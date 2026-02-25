# Feisty Digital Ecosystem - Setup Guide

## Konfigurasi Supabase ✓ SUDAH

Semua frontend sudah dikonfigurasi dengan:
- **URL**: `https://ztefkcbgkdqgvcfphvys.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

---

## Langkah Selanjutnya: Eksekusi Schema

### 1. Buka Supabase Dashboard
Buka https://app.supabase.com dan login

### 2. Pilih Project Anda
Klik project "ztefkcbgkdqgvcfphvys"

### 3. Buka SQL Editor
Di sidebar kiri, klik **SQL Editor** (icon database)

### 4. Jalankan Schema
1. Klik tombol **New query** 
2. Copy semua isi file: `supabase/schema.sql`
3. Paste di editor
4. Klik tombol **Run** (tombol biru "Run")

### 5. Verifikasi
Setelah berhasil:
- Akan ada notifikasi "Success"
- Di sidebar kiri, klik **Table Editor**
- Pastikan ada tabel: outlets, customers, products, orders, order_items, users, delivery_zones

---

## Test Koneksi

Setelah schema berhasil dijalankan:
1. Buka file `test-connection.html` di browser
2. Halaman akan menampilkan status koneksi

---

## Akses Sistem

| Modul | File | Keterangan |
|-------|------|-------------|
| Landing | `landing/index.html` | Halaman utama |
| Web Order | `weborder/index.html?token=xxx&customer=xxx` | Untuk customer |
| POS | `pos/index.html` | Untuk kasir (login required) |
| Admin | `admin/index.html` | Untuk admin (login required) |

---

## Konfigurasi Tambahan

### WhatsApp Webhook
Untuk mengaktifkan bot WhatsApp:
1. Buka Supabase → **Edge Functions**
2. Deploy `supabase/functions/whatsapp-webhook.ts`
3. Konfigurasi WhatsApp Business API webhook URL

### Production
Untuk deployment:
1. Hosting static (Vercel, Netlify, atau Cloudflare Pages)
2. Update SUPABASE_URL dan SUPABASE_ANON_KEY sesuai environment
