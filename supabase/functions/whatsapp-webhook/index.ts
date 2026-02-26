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

// Get outlet coordinates for distance calculation
async function getOutletLocation(supabase: any, outletId: string): Promise<{latitude: number, longitude: number, name: string} | null> {
    const { data, error } = await supabase
        .from("outlet_locations")
        .select("latitude, longitude, outlets(name)")
        .eq("outlet_id", outletId)
        .single();

    if (error || !data) {
        // Default Malili coordinates
        return { latitude: -2.5833, longitude: 120.3667, name: "Malili" };
    }
    return { latitude: data.latitude, longitude: data.longitude, name: data.outlets?.name || "Malili" };
}

// Find nearest outlet based on customer location (if provided)
async function findNearestOutlet(supabase: any, lat?: number, lng?: number): Promise<{outlet_id: string, name: string, distance: number} | null> {
    // If no location provided, return default outlet
    if (!lat || !lng) {
        const outlet = await getOutletLocation(supabase, DEFAULT_OUTLET_ID);
        return { outlet_id: DEFAULT_OUTLET_ID, name: outlet?.name || "Malili", distance: 0 };
    }

    // Simple distance calculation for each outlet
    const { data: outlets } = await supabase
        .from("outlet_locations")
        .select("outlet_id, latitude, longitude, outlets(name)")
        .eq("is_active", true);

    if (!outlets || outlets.length === 0) {
        return { outlet_id: DEFAULT_OUTLET_ID, name: "Malili", distance: 0 };
    }

    // Calculate distance using Haversine formula
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    let nearest = null;
    let minDist = Infinity;

    for (const outlet of outlets) {
        const dist = calculateDistance(lat, lng, outlet.latitude, outlet.longitude);
        if (dist < minDist) {
            minDist = dist;
            nearest = {
                outlet_id: outlet.outlet_id,
                name: outlet.outlets?.name || "Unknown",
                distance: dist
            };
        }
    }

    return nearest;
}

// Helper function to generate order link with phone only (name looked up in weborder)
function getOrderLink(phone: string, referralCode?: string): string {
  let url = `${WEB_ORDER_URL}?phone=${encodeURIComponent(phone)}`;
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

async function createCustomer(supabase: any, name: string, phone: string, referredBy?: string): Promise<any> {
  const insertData: any = { name: name, phone: phone };
  if (referredBy) {
    insertData.referred_by = referredBy;
  }
  
  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    return null;
  }
  return newCustomer;
}

async function updateCustomerName(supabase: any, phone: string, newName: string): Promise<any> {
  const { data: updatedCustomer, error } = await supabase
    .from("customers")
    .update({ name: newName })
    .eq("phone", phone)
    .select()
    .single();

  if (error) {
    console.error("Error updating customer name:", error);
    return null;
  }
  return updatedCustomer;
}

async function getProducts(supabase: any, outletId?: string): Promise<any[]> {
  const targetOutlet = outletId || DEFAULT_OUTLET_ID;
  const { data } = await supabase
    .from("products")
    .select("name, price, stock")
    .eq("outlet_id", targetOutlet)
    .eq("active", true)
    .limit(10);
  return data || [];
}

// ============================================================
// GEMINI AI MARKETING
// ============================================================

async function searchProduct(supabase: any, query: string): Promise<any[]> {
    const { data } = await supabase
        .from("products")
        .select("name, price, stock, active")
        .eq("active", true)
        .ilike("name", "%" + query + "%")
        .limit(10);
    return data || [];
}

async function getAIResponse(messageText: string, customerName: string, customerPhone: string, customerReferralCode: string, totalReferrals: number, products: any[], outletName?: string, supabase?: any): Promise<string> {
    // First check for specific patterns that need database lookup
    const msg = messageText.toLowerCase();
    
    // Check if asking about specific product availability
    const productKeywords = ["ada", "tersedia", "stock", "jual", "beli", "menu", "catalog"];
    const isProductQuery = productKeywords.some(keyword => msg.includes(keyword));
    
    let productSearchResults = "";
    if (isProductQuery && supabase) {
        // Extract product name from message
        const productName = messageText
            .replace(/ada|tersedia|stock|jual|beli|menu|catalog|apa|saya| mau| cari| cari/i, "")
            .trim();
        
        if (productName.length > 2) {
            const searchResults = await searchProduct(supabase, productName);
            if (searchResults.length > 0) {
                productSearchResults = searchResults.map(p => 
                    `- ${p.name}: Rp ${p.price.toLocaleString("id-ID")} (${p.stock || "tersedia"})`
                ).join("\n");
            }
        }
    }

    if (!GEMINI_API_KEY) {
        return getFallbackResponse(messageText, customerName, customerPhone, customerReferralCode, totalReferrals, products, outletName);
    }

    const productList = products.map(p => `- ${p.name}: Rp ${p.price.toLocaleString("id-ID")} (${p.stock || "tersedia"})`).join("\n");
    const orderLink = getOrderLink(customerPhone, customerReferralCode);
    const outletDisplay = outletName || "Feisty Malili";

    const menuFallback = "- Es Teh Mangga\n- Americano\n- Chicken Salted Egg";
    const systemPrompt = "Anda adalah Feisty - asisten marketing yang SUPER FRIENDLY dan NATURAL untuk restaurant Feisty di Malili, Sulawesi Selatan. TUJUAN UTAMA: Membuat customer PESAN melalui link web ordering (bukan manual di WhatsApp!). LOKASI: " + outletDisplay + ". MENU FAVORIT: " + (productList || menuFallback) + ". CARA KERJA: - Tanya menu -> Tampilkan beberapa menu + selalu sertakan link order - Ingin pesan -> Langsung arahkan ke link web (jangan tanya detail pesanan di WhatsApp) - Tanya produk tertentu -> Cek ketersediaan + arahkan pesan via web - Ngobrol biasa -> Tetap friendly tapi selingi ajakan pesan - SEMUA PESANAN VIA WEB ORDER - Lebih cepat & tidak ribet! KEBUTUHAN WAJIB: 1. Gunakan nama customer dengan hangat 2. Respons pendek-pendek (maksimal 2-3 kalimat) 3. SELALU sertakan link order: " + orderLink + " 4. Pakai emoji yang sesuai 5. Bahasa Indonesia yang natural dan friendly. JANGAN: - Tanya detail pesanan di WhatsApp (Route ke web order) - Respons terlalu panjang - Terlalu formal. TEKNIK CLOSING: - Mau pesan sekarang? Klik link ini ya... - Lebih hemat waktu, langsung pesan di web aja... - Yuk, langsung klik link di bawah... CONTOH RESPONS: - Customer: assalamualaikum -> Feisty: Waalaikumussalam warahmatullahi wabarakatuh! Hai [nama]! Ada yang bisa Feisty bantu? Mau lihat menu atau langsung pesan? - Customer: halo -> Feisty: Halo [nama]! Welcome ke Feisty! Mau coba menu apa hari ini? - Customer: ada ayam goreng tidak? -> Feisty: Ada dong! Kami punya Chicken Salted Egg, Chicken Crispy, dan banyak lagi! Mau yang mana? Langsung klik sini buat pesan: " + orderLink + " - Customer: saya mau pesan -> Feisty: Siap! Paling mudah lewat web order aja, lebih cepat! Klik: " + orderLink + " - Customer: referral apa? -> Feisty: Nah itu dia! Share kode kamu ke teman, kalau teman pesan lewat link kamu, kamu dapat komisi! Kode kamu: " + customerReferralCode + ". Mau langsung coba?";

    let userPrompt = "Customer: " + customerName + " - Pesan: " + messageText;
    
    if (productSearchResults) {
        userPrompt += "\n\nHasil pencarian produk:\n" + productSearchResults;
    }

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
    
    return getFallbackResponse(messageText, customerName, customerPhone, customerReferralCode, totalReferrals, products);
  } catch (error) {
    console.error("Gemini error:", error);
    return getFallbackResponse(messageText, customerName, customerPhone, customerReferralCode, totalReferrals, products);
  }
}

function getFallbackResponse(messageText: string, customerName: string, customerPhone: string, customerReferralCode: string, totalReferrals: number, products: any[], outletName?: string): string {
  const msg = messageText.toLowerCase();
  const productList = products.slice(0, 5).map(p => `- ${p.name}: Rp ${p.price.toLocaleString("id-ID")} (${p.stock || "tersedia"})`).join("\n");
  const orderLink = getOrderLink(customerPhone, customerReferralCode);
  const outletDisplay = outletName || "Feisty Malili";

  // Handle Islamic greeting
  if (msg.includes("assalamualaikum") || msg.includes("salam") || msg.includes("ws") || msg.includes("wa") && msg.length < 15) {
    const responses = [
      `Waalaikumussalam warahmatullahi wabarakatuh! 😊 Hai ${customerName}! Welcome ke Feisty! Mau pesan apa hari ini?`,
      `Waalaikumussalam! 🌟 Hai ${customerName}! Senang bisa ngobrol denganmu! Mau lihat menu atau langsung pesan?`,
      `Assalamualaikum wr wb! ✨ Hai ${customerName}! Ada yang bisa Feisty bantu?`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Handle name change
  if (msg.includes("ganti nama") || msg.includes("ubah nama") || msg.includes("rubah nama")) {
    const newName = messageText.replace(/ganti nama|ubah nama|rubah nama/i, "").trim();
    return `Untuk mengganti nama, tuliskan nama baru Anda dengan format:\n\nganti nama [nama baru]\n\nContoh: ganti nama Budi`;
  }
  
  // Handle product availability queries
  const productKeywords = ["ada", "tersedia", "stock", "jual", "beli"];
  if (productKeywords.some(kw => msg.includes(kw))) {
    // Try to find matching products
    const searchQuery = messageText.toLowerCase().replace(/ada|tersedia|stock|jual|beli|tidak|ga|gak|gak ada/i, "").trim();
    if (searchQuery.length > 2) {
      const matchedProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery));
      if (matchedProducts.length > 0) {
        const foundList = matchedProducts.map(p => `- ${p.name}: Rp ${p.price.toLocaleString("id-ID")}`).join("\n");
        return `Alhamdulillah ada! 😊\n\n${foundList}\n\nMau pesan yang mana? Langsung klik: ${orderLink}`;
      }
    }
    return `Maaf, produk yang dimaksud tidak ada di menu kami. Tapi kami punya banyak menu menarik lainnya! 😊\n\n${productList}\n\nLihat lengkap: ${orderLink}`;
  }
  
  if (msg.includes("halo") || msg.includes("hi") || msg.includes("hello") || msg.includes("hay") || msg.includes("hy")) {
    const responses = [
      `Halo ${customerName}! 👋 Selamat datang di Feisty! Mau pesan apa hari ini?`,
      `Hai ${customerName}! 🌟 Welcome! Ada yang bisa Feisty bantu?`,
      `Halo ${customerName}! 😊 Welcome ke Feisty Malili! Mau coba menu apa?`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (msg.includes("menu") || msg.includes("catalog") || msg.includes("daftar")) {
    return `📋 *Menu Feisty*\n\n${productList}\n\n🔗 Pesan langsung: ${orderLink}`;
  }
  
  if (msg.includes("referral") || msg.includes("komisi") || msg.includes("share") || msg.includes("uang") || msg.includes("affiliate")) {
    return `🎁 *Program Referral Feisty*\n\nKode Anda: ${customerReferralCode}\n\nCara dapat komisi:\n1. Share kode Anda ke teman\n2. Teman pesan lewat link Anda\n3. Dapat komisi saat pesanan selesai!\n\n📊 Status: ${totalReferrals} teman sudah pesan!\n\nMau langsung coba? ${orderLink}`;
  }
  
  if (msg.includes("kode") || msg.includes("apa kode") || msg.includes("cek kode")) {
    return `📢 Kode Referral Anda: ${customerReferralCode}\n\nShare ke teman, dapat komisi! 🎁\n\nLink share: ${orderLink}`;
  }
  
  if (msg.includes("pesan") || msg.includes("order") || msg.includes("beli") || msg.includes("mau") || msg.includes("cobain") || msg.includes("try")) {
    return `🛒 Siap! Lebih mudah lewat web order, langsung klik:\n\n${orderLink}\n\nPasti lebih cepat & tidak ribet! 😄`;
  }
  
  if (msg.includes("thank") || msg.includes("terima kasih") || msg.includes("thanks") || msg.includes("ty")) {
    const responses = [
      `Sama-sama ${customerName}! 😊 Jangan lupa sering-sering pesan di Feisty ya!`,
      `Terima kasih kembali! 🌟 Selamat menikmati Feisty!`,
      `Sama-sama! 😄 Cepat sembuh ya! Jangan lupa order lagi!`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Default response - friendly with link
  const defaults = [
    `Halo ${customerName}! 👋 Mau pesan apa? Langsung klik: ${orderLink}`,
    `Feisty siap melayani! 😊 ${customerName}, mau coba menu apa hari ini?`,
    `Hai ${customerName}! 🌟 Ada yang bisa Feisty bantu? Mau pesan atau lihat menu?`
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// ============================================================
// NAME CAPTURE (for new customers)
// ============================================================

async function handleNameCapture(supabase: any, phone: string, nameInput: string): Promise<string> {
  if (!nameInput || nameInput.trim().length < 2) {
    return "Nama minimal 2 karakter. Boleh beritahu nama Anda?";
  }

  const customer = await createCustomer(supabase, nameInput.trim(), phone);
  
  if (!customer) {
    return "Maaf ada kesalahan. Boleh coba lagi?";
  }

  // Get nearest outlet
  const nearestOutlet = await findNearestOutlet(supabase);
  const outletName = nearestOutlet?.name || "Malili";
  
  const products = await getProducts(supabase, nearestOutlet?.outlet_id);
  const orderLink = getOrderLink(phone, customer.referral_code);
  
  return `Senang berkenalan dengan Anda, ${customer.name}! 🎉

Saya Feisty, asisten pesan Anda di ${outletName}!

📋 *Keuntungan jadi member Feisty:*
• Pesan lebih cepat via link personal
• Dapatkan kode referral untuk teman
• Bonus komisi kalau teman pesan lewat link Anda

🎁 *Kode Referral Anda:* ${customer.referral_code}

📢 *Cara Dapat Komis:*
1. Share kode referral atau link Anda ke teman
2. Teman pesan lewat link Anda
3. Dapat komisi saat pesanan selesai!

🍔 *Rekomendasi hari ini:*
${products.slice(0, 3).map(p => `• ${p.name}: Rp ${p.price.toLocaleString("id-ID")}`).join("\n")}

Mau pesan sekarang? Klik: ${orderLink}`;
}

// Handle name change request
async function handleNameChange(supabase: any, phone: string, newName: string): Promise<string> {
  if (!newName || newName.trim().length < 2) {
    return "Nama minimal 2 karakter. Boleh coba lagi dengan format: 'ganti nama [nama baru]'";
  }

  const customer = await updateCustomerName(supabase, phone, newName.trim());
  
  if (!customer) {
    return "Maaf ada kesalahan saat mengubah nama. Boleh coba lagi?";
  }

  const orderLink = getOrderLink(phone, customer.referral_code);
  
  return `✅ Nama berhasil diganti menjadi *${customer.name}*!

📢 *Kode Referral Anda:* ${customer.referral_code}

Anda bisa share kode ini ke teman untuk dapat komisi! 😄

Mau pesan sekarang? Klik: ${orderLink}`;
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
      const msg = messageText.toLowerCase().trim();
      
      // Check for name change command pattern
      const isNameChange = msg.match(/^(ganti|ubah|rubah)\s+nama\s+(.+)/);
      if (isNameChange) {
        return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
      }
      
      // If message looks like a name (short, no keywords), try to register
      const isNameInput = msg.length > 1 && msg.length < 30 && 
        !msg.includes("menu") && !msg.includes("pesan") && !msg.includes("halo") &&
        !msg.includes("hello") && !msg.includes("hi") && !msg.includes("ganti") &&
        !msg.includes("ubah") && !msg.includes("rubah");
      
      if (isNameInput) {
        // Treat as name
        responseMessage = await handleNameCapture(supabase, from, messageText);
      } else {
        // Ask for name
        responseMessage = `Halo! 👋

Selamat datang di Feisty!

Boleh tahu nama Anda? Supaya kami bisa melayani Anda dengan baik! 😊`;
      }
    } else {
      // EXISTING CUSTOMER - Check for name change command
      const msg = messageText.toLowerCase().trim();
      const nameChangeMatch = messageText.match(/^(ganti|ubah|rubah)\s+nama\s+(.+)/i);
      
      if (nameChangeMatch && nameChangeMatch[2]) {
        // Handle name change
        responseMessage = await handleNameChange(supabase, from, nameChangeMatch[2]);
      } else {
        // Get nearest outlet info
        const nearestOutlet = await findNearestOutlet(supabase);
        const outletName = nearestOutlet?.name || "Malili";
        const products = await getProducts(supabase, nearestOutlet?.outlet_id);
        
        // Use AI for marketing
        responseMessage = await getAIResponse(
          messageText, 
          customer.name, 
          from, 
          customer.referral_code || "BELUM ADA",
          customer.total_referrals || 0,
          products,
          outletName
        );
      }
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
