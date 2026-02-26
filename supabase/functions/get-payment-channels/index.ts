const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// iPaymu configuration
const IPAYMU_VA = Deno.env.get("IPAYMU_VA")!;
const IPAYMU_API_KEY = Deno.env.get("IPAYMU_API_KEY")!;
const IPAYMU_URL = Deno.env.get("IPAYMU_URL") || "https://sandbox.ipaymu.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate request method
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, message: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const timestamp = Date.now().toString();

    const response = await fetch(`${IPAYMU_URL}/api/v2/payment-channels`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${IPAYMU_API_KEY}`,
        "Timestamp": timestamp,
        "va": IPAYMU_VA
      }
    });

    const result = await response.json();

    if (result.Success === false) {
      throw new Error(result.Message || "Failed to get payment channels");
    }

    // Process and simplify the channels for frontend
    const channels = result.Data || [];
    
    // Group channels by category
    const paymentMethods = channels.map((category: any) => {
      const methodCode = category.Code;
      const methodName = category.Name;
      const methodDescription = category.Description;
      
      const subChannels = category.Channels || [];
      
      return {
        code: methodCode,
        name: methodName,
        description: methodDescription,
        channels: subChannels.map((ch: any) => ({
          code: ch.Code,
          name: ch.Name,
          description: ch.Description,
          logo: ch.Logo || '',
          fee: ch.TransactionFee || {}
        }))
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        channels: paymentMethods
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Get payment channels error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to get payment channels"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
