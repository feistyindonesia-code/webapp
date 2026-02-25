# Cara Deploy via Web (Supabase Dashboard)

## Langkah 1: Buka Supabase Dashboard

1. Buka browser dan login ke https://app.supabase.com
2. Klik project "ztefkcbgkdqgvcfphvys"

## Langkah 2: Buka Edge Functions

1. Di sidebar kiri, cari bagian "Edge Functions" (biasanya ada di bawah "API" atau "Database")
2. Klik "Edge Functions"

## Langkah 3: Deploy Function

1. Klik tombol "+ New function" atau "Create a new function"
2. Untuk "Function name", ketik: `whatsapp-webhook`
3. Untuk "Entry point", biarkan default atau pilih sesuai kebutuhan

## Langkah 4: Copy Kode

Buka file `e:\Feisty APP\supabase\functions\whatsapp-webhook.ts` 
Copy semua isi file tersebut dan paste ke editor di Supabase

## Langkah 5: Set Environment Variables

1. Di dashboard Supabase, klik "Settings" (icon gear) di sidebar kiri
2. Klik "Edge Functions"
3. Di bagian "Environment Variables", tambahkan:

| Key | Value |
|-----|-------|
| WHATSAPP_DEVICE_ID | 92b2af76-130d-46f0-b811-0874e3407988 |
| WEB_ORDER_URL | https://ztefkcbgkdqgvcfphvys.supabase.co/weborder |
| SUPABASE_URL | https://ztefkcbgkdqgvcfphvys.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | [dari Settings -> API -> service_role secret] |

**Catatan:** Untuk mendapatkan SUPABASE_SERVICE_ROLE_KEY:
1. Di Settings, klik "API"
2. Di bagian "Project API keys", cari "service_role secret"
3. Klik icon "copy" untuk menyalin

## Langkah 6: Deploy

1. Klik tombol "Deploy Function" atau "Save"
2. Tunggu hingga deployment selesai

## Langkah 7: Dapatkan Webhook URL

Setelah deploy berhasil, Anda akan melihat URL seperti:
```
https://ztefkcbgkdqgvcfphvys.supabase.co/functions/v1/whatsapp-webhook
```

**SIMPAN URL INI!** Anda butuh ini untuk langkah berikutnya.

## Langkah 8: Setup di Whacenter

1. Buka https://dash.whacenter.com dan login
2. Cari menu "Pengaturan Webhook" atau "Webhook Settings"
3. Masukkan URL dari Langkah 7
4. Simpan pengaturan

## Langkah 9: Test

Kirim pesan "halo" ke nomor WhatsApp Whacenter Anda. Anda seharusnya menerima balasan otomatis.

---

## Jika Gagal

Cek logs:
1. Di Supabase Dashboard, klik "Edge Functions"
2. Klik function "whatsapp-webhook"
3. Klik tab "Logs"
4. Lihat pesan error jika ada
