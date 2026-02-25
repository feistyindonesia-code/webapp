/**
 * ============================================================
 * FEISTY WHATSAPP BOT - AI Marketing Assistant
 * 
 * Flow:
 * 1. Check if customer phone exists in database
 * 2. If NOT registered → ask for name and register
 * 3. If registered → AI answers as marketing (goal: order via web)
 * 
 * Integration: Whacenter API + Gemini AI
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration
const WHATSAPP_DEVICE_ID = Deno.env.get("WHATSAPP_DEVICE_ID") || "92b2af76-130d-46f0-b811-0874e3407988";
const WEB_ORDER_URL = Deno.env.get("WEB_ORDER_URL") || "https://feisty.my.id/weborder";
const WEBHOOK_KEY = Deno.env.get("WEBHOOK_KEY") || "feisty-webhook-secret-2024";
const DEFAULT_OUTLET_ID = "00000000-0000-0000-0000-000000000001";

// Helper function to generate order link with phone and referral
function getOrderLink(phone: string, name: string, referralCode?: string): string {
  let url = `${WEB_ORDER_URL}?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}`;
  if (referralCode) {
    url += `&ref=${encodeURIComponent(referralCode)}`;
  }
  return url;
}

// Gemini API
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "AIzaSyCg7JsZ-SW_QODiXBHdt3h6eNs_HAfxTX8";
const GEMINI_MODEL = "gemini-2.5-flash";

// ============================================================
// DATABASE FUNCTIONS
// ============================================================

async function getCustomerByPhone(supabase: any, phone: string): Promise<any> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching customer:", error);
    return null;
  }
  return data;
}

async function createCustomer(supabase: any, name: string, phone: string): Promise<any> {
  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert({ name: name, phone: phone })
    .select()
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    return null;
  }
  return newCustomer;
}

async function getProducts(supabase: any): Promise<any[]> {
  const { data } = await supabase
    .from("products")
    .select("name, price, stock")
    .eq("outlet_id", DEFAULT_OUTLET_ID)
    .eq("active", true)
    .limit(10);
  return data || [];
}

// ============================================================
// GEMINI AI MARKETING
// ============================================================

async function getAIResponse(messageText: string, customerName: string, customerPhone: string, customerReferralCode: string, products: any[]): Promise<string> {
  if (!GEMINI_API_KEY) {
    return getFallbackResponse(messageText, customerName, customerPhone, customerReferralCode, products);
  }

  const productList = products.map(p => `- ${p.name}: Rp ${p.price.toLocaleString("id-ID")} (stok: ${p.stock || "tersedia"})`).join("\n");
  const orderLink = getOrderLink(customerPhone, customerName, customerReferralCode);

  const systemPrompt = `Anda adalah "Feisty" - asisten marketing yang friendly dan helpful untuk restaurant Feisty.

TUJUAN UTAMA: Membuat customer下单 (pesan makanan) melalui link web ordering.

INFO_restaurant:
- Nama restaurant: Feisty
- Lokasi: Malili, Sulawesi Selatan  
- Menu: ${productList || "Menu lengkap tersedia"}

ATURAN:
1. Selalu ramah dan gunakan nama customer
2. Jika customer bertanya menu, tampilkan beberapa menu populer
3. Jika customer ingin memesan, arahkan ke link: ${WEB_ORDER_URL}
4. Gunakan emoji yang sesuai
5. Respons dalam Bahasa Indonesia yang natural
6. Jangan terlalu panjang, cukup informatif
7. Selalu ingatkan link order jika ada kesempatan

CONTOH:
- Customer: "halo"
  Feisty: "Halo [nama]! 👋 Selamat datang di Feisty! Ada yang bisa saya bantu? Mau lihat menu atau langsung pesan?"

- Customer: "menu apa saja?"
  Feisty: "Ini beberapa menu favorit kami:\n\n🍔 Feisty Burger - Rp 25.000\n🍟 Fries Medium - Rp 15.000\n🥤 Cola Reg - Rp 8.000\n\nMau pesan yang mana? Klik saja: ${WEB_ORDER_URL}"

- Customer: " cara pesan?"
  Feisty: "Gampang banget! Klik link ini: ${WEB_ORDER_URL} terus pilih menu yang wanted, lalu checkout. Ada yang bingung?"`;

  const userPrompt = `Customer: ${customerName}
Pesan: ${messageText}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          systemInstruction: { role: "model", parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    );

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (content) {
      return content;
    }
    
    return getFallbackResponse(messageText, customerName, customerPhone, customerReferralCode, products);
  } catch (error) {
    console.error("Gemini error:", error);
    return getFallbackResponse(messageText, customerName, customerPhone, customerReferralCode, products);
  }
}

function getFallbackResponse(messageText: string, customerName: string, customerPhone: string, customerReferralCode: string, products: any[]): string {
  const msg = messageText.toLowerCase();
  const productList = products.slice(0, 5).map(p => `- ${p.name}: Rp ${p.price.toLocaleString("id-ID")} (stok: ${p.stock || "tersedia"})`).join("\n");
  const orderLink = getOrderLink(customerPhone, customerName, customerReferralCode);

  if (msg.includes("halo") || msg.includes("hi") || msg.includes("hello")) {
    return `Halo ${customerName}! 👋\n\nSelamat datang di Feisty!\n\nMau pesan apa hari ini? Ketik "menu" untuk lihat menu!\n\n📢 Share kode referral Anda: *${customerReferralCode}*\nDapat komisi kalau teman pesan lewat link Anda!`;
  }
  
  if (msg.includes("menu")) {
    return `📋 *Menu Feisty*\n\n${productList}\n\nKlik untuk pesan: ${orderLink}`;
  }
  
  if (msg.includes("referral") || msg.includes("komisi") || msg.includes("share")) {
    return `📢 *Kode Referral Anda*\n\n*Kode:* ${customerReferralCode}\n\nShare kode ini ke teman! Kalau mereka pesan lewat link Anda, Anda dapat komisi!\n\nLink share: ${orderLink}`;
  }
  
  if (msg.includes("pesan") || msg.includes("order") || msg.includes("beli")) {
    return `🛒 Klik link berikut untuk pesan:\n\n${orderLink}`;
  }
  
  return `Halo ${customerName}! 👋\n\nMau pesan apa? Ketik "menu" untuk lihat menu atau langsung klik:\n\n${orderLink}`;
}

// ============================================================
// NAME CAPTURE (for new customers)
// ============================================================

function isNameCaptureMode(lastMessage: string): boolean {
  // Check if previous bot message was asking for name
  const msg = lastMessage.toLowerCase();
  return msg.includes("nama") || msg.includes("siapa") || msg.includes("call");
}

async function handleNameCapture(supabase: any, phone: string, nameInput: string): Promise<string> {
  if (!nameInput || nameInput.trim().length < 2) {
    return "Nama minimal 2 karakter. Boleh beritahu nama Anda?";
  }

  const customer = await createCustomer(supabase, nameInput.trim(), phone);
  
  if (!customer) {
    return "Maaf ada kesalahan. Boleh coba lagi?";
  }

  const products = await getProducts(supabase);
  const orderLink = getOrderLink(phone, customer.name);
  
  return `Senang berkenalan dengan Anda, ${customer.name}! 🎉\n\nSaya Feisty, asisten pesan Anda!\n\n📋 *Rekomendasi hari ini:*\n${products.slice(0, 3).map(p => `- ${p.name}: Rp ${p.price.toLocaleString("id-ID")} (stok: ${p.stock || "tersedia"})`).join("\n")}\n\nMau pesan sekarang? Klik: ${orderLink}`;
}

// ============================================================
// WHATSAPP API
// ============================================================

async function sendWhatsAppMessage(to: string, message: string) {
  if (!WHATSAPP_DEVICE_ID) return null;

  const response = await fetch("https://api.whacenter.com/api/send/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: WHATSAPP_DEVICE_ID,
      number: to,
      message: message,
      file: null,
      schedule: null,
    }),
  });

  return response.json();
}

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const webhookKey = req.headers.get("X-WEBHOOK-KEY");
  if (webhookKey && webhookKey !== WEBHOOK_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    console.log("Received:", JSON.stringify(body));

    // Extract message
    let from = "";
    let messageText = "";

    if (body.from && body.message) {
      from = body.from;
      messageText = body.message;
    } else if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      from = msg.from;
      messageText = msg.text?.body || "";
    } else {
      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
    }

    // Check if customer exists
    const customer = await getCustomerByPhone(supabase, from);

    let responseMessage = "";

    if (!customer) {
      // NEW CUSTOMER - Check if this is a name response
      // For now, treat first message as potential name input or greeting
      const msg = messageText.toLowerCase().trim();
      
      // If message looks like a name (short, no keywords), try to register
      const isNameInput = msg.length > 1 && msg.length < 30 && 
        !msg.includes("menu") && !msg.includes("pesan") && !msg.includes("halo") &&
        !msg.includes("hello") && !msg.includes("hi");
      
      if (isNameInput) {
        // Treat as name
        responseMessage = await handleNameCapture(supabase, from, messageText);
      } else {
        // Ask for name
        responseMessage = `Halo! 👋\n\nSelamat datang di Feisty!\n\nBoleh tahu nama Anda? Supaya kami bisa melayani Anda dengan baik! 😊`;
      }
    } else {
      // EXISTING CUSTOMER - Use AI for marketing
      const products = await getProducts(supabase);
      responseMessage = await getAIResponse(messageText, customer.name, from, customer.referral_code, products);
    }

    // Send response
    console.log(`Sending to ${from}: ${responseMessage}`);
    await sendWhatsAppMessage(from, responseMessage);

    return new Response(JSON.stringify({ received: true, customerRegistered: !!customer }), {
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
