import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Service layer for order operations
 */
const orderService = {
  async findByPaymentReference(paymentReference: string) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("payment_reference", paymentReference)
      .single();
    
    if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
      throw error;
    }
    return data;
  },

  async markAsPaid(orderId: string, amount: number) {
    const { error } = await supabase
      .from("orders")
      .update({ 
        status: "paid",
        total_amount: amount,
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId);

    if (error) throw error;
  },

  async markAsCancelled(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ 
        status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId);

    if (error) throw error;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get request body
    const body = await req.text();
    const payload = JSON.parse(body);

    console.log("Payment webhook received:", payload);

    // Get the payment reference from the webhook
    const paymentReference = payload.TransactionId || payload.transaction_id || payload.Data?.TransactionId;
    const status = payload.Status || payload.status || payload.Data?.Status;
    const amount = parseInt(payload.Amount || payload.amount || payload.Data?.Amount || "0");

    if (!paymentReference) {
      console.log("No payment reference found in webhook");
      return new Response(
        JSON.stringify({ success: false, message: "No payment reference" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find order by payment reference
    const order = await orderService.findByPaymentReference(paymentReference);

    if (!order) {
      console.log("Order not found for payment reference:", paymentReference);
      return new Response(
        JSON.stringify({ success: true, message: "Order not found, but processing anyway" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency check - if already paid, return success
    if (order.status === "paid") {
      console.log("Order already paid:", order.id);
      return new Response(
        JSON.stringify({ success: true, message: "Order already processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate amount matches (optional - log only)
    const orderAmount = order.total_amount || order.total || 0;
    if (amount > 0 && amount !== orderAmount) {
      console.log("Amount mismatch:", { expected: orderAmount, received: amount });
    }

    // Determine status based on iPaymu response
    const isSuccess = status === 1 || status === "1" || status === "success" || status === "Success";
    const isFailed = status === -1 || status === "-1" || status === "failed" || status === "Failed";

    if (isSuccess) {
      await orderService.markAsPaid(order.id, amount);
      console.log("Order marked as paid:", order.id);
    } else if (isFailed) {
      await orderService.markAsCancelled(order.id);
      console.log("Order marked as cancelled:", order.id);
    } else {
      console.log("Unhandled payment status:", status);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Webhook processed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
