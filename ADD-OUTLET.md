# Cara Tambah Data Outlet

## Method 1: Via Supabase Dashboard (GUI)

1. Buka **Supabase Dashboard**
2. Pilih project **Feisty**
3. Klik **Table Editor** di sidebar
4. Pilih table **`outlets`**
5. Klik **Insert**
6. Isi data:

| Field | Contoh |
|-------|--------|
| id | (biarkan kosong - auto generate) |
| name | Feisty Malili |
| address | Jl. Pattimura No. 45, Malili |
| active | true |
| created_at | (biarkan kosong) |

## Method 2: Via SQL

Buka **SQL Editor** dan jalankan:

```sql
-- Tambah outlet
INSERT INTO outlets (name, address) 
VALUES ('Feisty Malili', 'Jl. Pattimura No. 45, Malili, Sulawesi Selatan');

-- Atau dengan ID spesifik
INSERT INTO outlets (id, name, address) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Feisty Malili', 'Jl. Pattimura No. 45, Malili');
```

## Method 3: Via Admin Panel (Jika sudah dibuat)

1. Buka **https://feisty.my.id/admin**
2. Login dengan akun owner
3. Menu **Outlet** → **Tambah Outlet**

---

## Untuk Multi-Outlet dengan Location

Setelah migration dijalankan, tambah data di table **`outlet_locations`**:

```sql
-- Tambah lokasi outlet dengan radius
INSERT INTO outlet_locations (
    outlet_id,
    latitude,
    longitude,
    radius_km,
    delivery_fee_base,
    free_delivery_radius_km
) VALUES (
    '00000000-0000-0000-0000-000000000001',  -- ID Outlet
    -2.5833,   -- Latitude Malili
    120.3333,  -- Longitude Malili
    20,        -- Radius 20KM
    5000,      -- Ongkir dasar Rp 5.000
    3           -- Gratis ongkir dalam radius 3KM
);
```

## Lokasi Malili (Contoh Koordinat)

- **Malili, Sulawesi Selatan**
  - Latitude: -2.5833
  - Longitude: 120.3333

- **Luwuk, Sulawesi Tengah** (contoh outlet ke-2)
  - Latitude: -0.95
  - Longitude: 122.78

---

## Cara Dapat Koordinat

1. Buka **Google Maps** 
2. Klik kanan pada lokasi
3. Klik angka di atas (contoh: `-2.5833, 120.3333`)
4. Copy & paste ke database
