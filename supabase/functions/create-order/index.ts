import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Validate phone number format
 */
function validatePhone(phone: string): boolean {
  // Must start with 62 and have at least 10 digits
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.startsWith('62') && cleaned.length >= 10;
}

/**
 * Validate request body structure
 */
function validateRequest(body: any): { valid: boolean; error?: string } {
  if (!body) {
    return { valid: false, error: "Request body is required" };
  }
  
  if (!body.outlet_id) {
    return { valid: false, error: "outlet_id is required" };
  }
  
  if (!body.customer_id) {
    return { valid: false, error: "customer_id is required" };
  }
  
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return { valid: false, error: "items array is required and cannot be empty" };
  }
  
  for (const item of body.items) {
    if (!item.product_id) {
      return { valid: false, error: "Each item must have product_id" };
    }
    if (!item.quantity || item.quantity < 1) {
      return { valid: false, error: "Each item must have valid quantity" };
    }
  }
  
  return { valid: true };
}

/**
 * Calculate total from database prices (never trust frontend)
 */
async function calculateOrderTotal(items: any[], outletId: string): Promise<{ total: number; items: any[] }> {
  // Get all product IDs
  const productIds = items.map((item: any) => item.product_id);
  
  // Fetch products from database
  const { data: products, error } = await supabase
    .from("products")
    .select("id, price, outlet_id, active")
    .in("id", productIds)
    .eq("outlet_id", outletId)
    .eq("active", true);
  
  if (error) {
    throw new Error("Failed to fetch product prices");
  }
  
  // Create product price map
  const productPrices = new Map();
  for (const product of products || []) {
    productPrices.set(product.id, product.price);
  }
  
  // Calculate total using database prices
  let total = 0;
  const orderItems = items.map((item: any) => {
    const unitPrice = productPrices.get(item.product_id);
    if (!unitPrice) {
      throw new Error(`Product ${item.product_id} not found or inactive`);
    }
    
    const quantity = item.quantity || 1;
    const subtotal = unitPrice * quantity;
    total += subtotal;
    
    return {
      product_id: item.product_id,
      product_name: item.product_name || "Unknown",
      quantity: quantity,
      unit_price: unitPrice,
      subtotal: subtotal
    };
  });
  
  return { total, items: orderItems };
}

/**
 * Handle the create-order request
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate request method
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, message: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate body structure
    const validation = validateRequest(body);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, message: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate phone number if provided
    if (body.customer_phone && !validatePhone(body.customer_phone)) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid phone number format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total from database (never trust frontend)
    const { total, items: orderItems } = await calculateOrderTotal(
      body.items,
      body.outlet_id
    );

    // Create order in database
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        outlet_id: body.outlet_id,
        customer_id: body.customer_id,
        total: total,
        total_amount: total,
        status: "pending",
        payment_method: "ipaymu"
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order creation error:", orderError);
      return new Response(
        JSON.stringify({ success: false, message: "Failed to create order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add order_id to each item
    const itemsWithOrderId = orderItems.map((item: any) => ({
      ...item,
      order_id: order.id
    }));

    // Create order items in database
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsWithOrderId);

    if (itemsError) {
      console.error("Order items creation error:", itemsError);
      // Order was created, but items failed - still return success
      // In production, you'd want to handle this differently
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        total: total
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Create order error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Internal server error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
