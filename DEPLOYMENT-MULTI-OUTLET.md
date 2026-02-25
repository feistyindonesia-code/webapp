# Deployment Guide: Multi-Outlet Location-Based Ordering System

## Overview

This guide explains how to deploy the multi-outlet location-based ordering system for Feisty. The system enables:
- Multiple outlets with 20KM delivery radius each
- Customer location-based outlet assignment
- 3-step web order flow: Customer Info → Menu → Delivery Location
- Dual WhatsApp notifications (outlet admin + customer)

## Deployment Steps

### Step 1: Run Database Migration

You need to run the migration script to add the new tables and functions. 

**Option A: Using Supabase SQL Editor**

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migration-multi-outlet.sql`
4. Run the script

**Option B: Using Supabase CLI**

```bash
supabase db push
```

### Step 2: Add Outlet Location Data

After running the migration, add location coordinates for each outlet:

```sql
-- Example: Adding outlet locations
INSERT INTO outlet_locations (outlet_id, latitude, longitude, radius_km, free_delivery_km, delivery_fee_per_km, is_active) 
VALUES 
    ('your-outlet-id-1', -2.5833, 120.3667, 20.00, 3.00, 2000, true),
    ('your-outlet-id-2', -2.5000, 120.3000, 20.00, 3.00, 2000, true);
```

### Step 3: Configure Outlet WhatsApp Numbers

```sql
-- Add WhatsApp numbers for outlet admins
INSERT INTO outlet_whatsapp (outlet_id, phone_number, contact_name, is_primary)
VALUES 
    ('your-outlet-id-1', '0812-xxxx-xxxx', 'Admin Outlet 1', true),
    ('your-outlet-id-2', '0813-xxxx-xxxx', 'Admin Outlet 2', true);
```

### Step 4: Deploy WhatsApp Webhook Function

```bash
# Deploy the updated WhatsApp webhook
supabase functions deploy whatsapp-webhook
```

Or use the existing deployment script:

```bash
deploy-whatsapp.bat
```

### Step 5: Update Web Order URL

The web order is automatically available at:
- `https://your-domain.com/weborder`

### Step 6: Configure Maps (Optional)

The web order uses OpenStreetMap (free, no API key required). For better maps, you can configure Google Maps:

1. Get a Google Maps API key
2. Update the web order HTML to use Google Maps instead of OpenStreetMap

## Testing the System

### Test 1: WhatsApp Order Flow

1. Send a WhatsApp message to your Feisty number
2. Register as a new customer
3. Ask for "menu" to see available products
4. Ask to "order" or "pesan"
5. You should receive an order link

### Test 2: Web Order Flow

1. Open the web order link
2. Step 1: Verify customer info is displayed
3. Click "Gunakan Lokasi Saat Ini" to get location
4. Step 2: Browse menu from assigned outlet
5. Add items to cart
6. Step 3: Verify delivery location on map
7. Place order
8. Verify WhatsApp messages sent to both customer and outlet admin

### Test 3: Multi-Outlet Scenario

1. Add a second outlet with different coordinates
2. Test ordering from a location closer to the second outlet
3. Verify the system assigns the correct outlet

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WHATSAPP_DEVICE_ID` | Whacenter device ID | (from existing config) |
| `WEB_ORDER_URL` | URL for web order | https://feisty.my.id/weborder |
| `WEBHOOK_KEY` | Security key for webhook | (from existing config) |
| `GEMINI_API_KEY` | Gemini AI API key | (from existing config) |

### Default Delivery Settings

| Setting | Default Value |
|---------|---------------|
| Delivery Radius | 20 KM |
| Free Delivery Radius | 3 KM |
| Delivery Fee per KM | Rp 2,000 |

## Troubleshooting

### Issue: "Location tidak ditemukan" error

**Solution:** Ensure the user has granted location permission in their browser. On mobile, make sure location services are enabled for the browser.

### Issue: Orders not going to correct outlet

**Solution:** Check that:
1. `outlet_locations` table has valid coordinates
2. `is_active` is set to `true` for the outlet
3. The customer's location is within the outlet's radius

### Issue: WhatsApp notifications not sent

**Solution:** 
1. Verify the Whacenter API is working
2. Check outlet WhatsApp numbers are configured in `outlet_whatsapp` table
3. Check Supabase Edge Functions logs for errors

## Files Modified/Created

| File | Description |
|------|-------------|
| `supabase/schema.sql` | Added new tables and functions |
| `supabase/migration-multi-outlet.sql` | Standalone migration script |
| `weborder/index.html` | New 3-step web order UI |
| `supabase/functions/whatsapp-webhook.ts` | Updated for multi-outlet support |
| `plans/multi-outlet-location-system.md` | Technical specification |

## Support

For issues or questions, please refer to the technical specification at `plans/multi-outlet-location-system.md`.

---

*Last Updated: 2026-02-25*
