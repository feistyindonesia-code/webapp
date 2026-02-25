# Cara Deploy WhatsApp Webhook ke Supabase

## Langkah 1: Buka Terminal

1. Buka Command Prompt (cmd) atau PowerShell
2. Ketik perintah berikut untuk masuk ke folder project:

```
cd e:\Feisty APP
```

## Langkah 2: Generate Token (Jika Belum Punya)

1. Buka browser dan login ke https://app.supabase.com
2. Klik profile picture Anda di pojok kanan atas
3. Klik "Account"
4. Di sidebar kiri, klik "API"
5. Di bagian "Personal Access Tokens", klik "Generate New Token"
6. Beri nama: "deploy-whatsapp"
7. Klik "Generate Token"
8. **COPY** token yang dihasilkan (dimulai dengan `sbp_`)

## Langkah 3: Setup Environment Variable

Di terminal, ketik (ganti `TOKEN_ANDA` dengan token yang sudah di-copy):

```
set SUPABASE_ACCESS_TOKEN=TOKEN_ANDA
```

Contoh:
```
set SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Langkah 4: Link ke Project Supabase

Ketik perintah ini di terminal:

```
e:\Feisty APP\supabase.exe link --project-ref ztefkcbgkdqgvcfphvys
```

Jika berhasil, akan muncul pesan "Linked to project ztefkcbgkdqgvcfphvys"

## Langkah 5: Set Environment Variables

Ketik perintah berikut satu per satu:

```
e:\Feisty APP\supabase.exe secrets set WHATSAPP_DEVICE_ID=92b2af76-130d-46f0-b811-0874e3407988
e:\Feisty APP\supabase.exe secrets set WEB_ORDER_URL=https://ztefkcbgkdqgvcfphvys.supabase.co/weborder
```

## Langkah 6: Deploy Function

Ketik perintah ini:

```
e:\Feisty APP\supabase.exe functions deploy whatsapp-webhook
```

Jika berhasil, akan muncul pesan seperti:
```
Deploying whatsapp-webhook... 
Deployed function whatsapp-webhook
```

## Langkah 7: Catat Webhook URL

Setelah deploy, URL webhook Anda adalah:

```
https://ztefkcbgkdqgvcfphvys.supabase.co/functions/v1/whatsapp-webhook
```

## Langkah 8: Setup di Whacenter

1. Login ke dashboard Whacenter (https://dash.whacenter.com)
2. Cari menu untuk setting webhook/callback
3. Masukkan URL dari Langkah 7
4. Simpan pengaturan

---

## Troubleshooting

**Error: "Invalid access token format"**
- Token Anda salah atau expired. Generate token baru dari https://app.supabase.com/account/tokens

**Error: "Project not found"**
- Project ref mungkin salah. Cek di https://app.supabase.com - project ID ada di URL

**Error: "Function name already exists"**
- Tambahkan flag `--override`:
  ```
  e:\Feisty APP\supabase.exe functions deploy whatsapp-webhook --override
  ```

---

## Testing

Setelah deployment selesai, coba kirim pesan "halo" ke nomor WhatsApp yang terdaftar di Whacenter. Anda seharusnya menerima balasan otomatis.

Jika tidak menerima balasan, cek:
1. Apakah webhook URL sudah benar di Whacenter
2. Cek logs di Supabase Dashboard -> Edge Functions -> whatsapp-webhook -> Logs
