import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// iPaymu configuration
const IPAYMU_VA = Deno.env.get("IPAYMU_VA")!;
const IPAYMU_API_KEY = Deno.env.get("IPAYMU_API_KEY")!;
const IPAYMU_URL = Deno.env.get("IPAYMU_URL") || "https://sandbox.ipaymu.com";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Service layer for order operations
 */
const orderService = {
  async getById(orderId: string) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();
    
    if (error) throw error;
    return data;
  },

  async updatePaymentReference(orderId: string, paymentReference: string) {
    const { error } = await supabase
      .from("orders")
      .update({ 
        payment_reference: paymentReference,
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId);

    if (error) throw error;
  },

  async markAsExpired(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ 
        status: "expired",
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId);

    if (error) throw error;
  }
};

/**
 * Service layer for iPaymu payment operations
 */
const paymentService = {
  async createPayment(orderId: string, amount: number, customerPhone: string) {
    const timestamp = Date.now();
    const notifyUrl = `${supabaseUrl}/functions/v1/payment-webhook`;

    const body = {
      method: "vc",
      amount: amount.toString(),
      buyer_email: "",
      buyer_phone: customerPhone,
      customer_name: "",
      description: `Order ${orderId.slice(0, 8)}`,
      expire: 15, // 15 minutes
      notify_url: notifyUrl,
      return_url: "",
      va: IPAYMU_VA
    };

    const jsonBody = JSON.stringify(body);
    const signature = await generateSignature("POST", jsonBody);

    const response = await fetch(`${IPAYMU_URL}/api/v2/payment/direct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${IPAYMU_API_KEY}`,
        "Timestamp": timestamp.toString()
      },
      body: jsonBody
    });

    const result = await response.json();
    
    if (result.Success === false) {
      throw new Error(result.Message || "Failed to create payment");
    }

    return {
      transactionId: result.Data.TransactionId,
      paymentUrl: result.Data.Url
    };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();

    // Validate input
    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, message: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order from database
    const order = await orderService.getById(order_id);

    // Validate order exists
    if (!order) {
      return new Response(
        JSON.stringify({ success: false, message: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate order status is pending
    if (order.status !== "pending") {
      return new Response(
        JSON.stringify({ success: false, message: `Order status is ${order.status}, not pending` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if order is expired
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
    
    if (diffMinutes > 15) {
      await orderService.markAsExpired(order_id);
      return new Response(
        JSON.stringify({ success: false, message: "Order has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get customer phone
    const { data: customer } = await supabase
      .from("customers")
      .select("phone")
      .eq("id", order.customer_id)
      .single();

    const customerPhone = customer?.phone || "";

    // Create iPaymu payment
    const payment = await paymentService.createPayment(
      order_id,
      order.total_amount || order.total,
      customerPhone
    );

    // Store payment reference
    await orderService.updatePaymentReference(order_id, payment.transactionId);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: payment.paymentUrl,
        payment_reference: payment.transactionId
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Payment creation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to create payment"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
