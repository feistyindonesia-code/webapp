# iPaymu Payment Integration Setup

## Environment Variables

Set these in Supabase Dashboard > Edge Functions > Settings:

### Required:
- `IPAYMU_VA` - Your iPaymu Virtual Account number (e.g., 8215088191883005)
- `IPAYMU_API_KEY` - Your iPaymu API Key
- `IPAYMU_SECRET` - Your iPaymu Secret Key

### Optional:
- `IPAYMU_URL` - Default: https://sandbox.ipaymu.com (use production URL when ready)

## Database Migration

Run the migration in Supabase SQL Editor:

```sql
-- Add payment columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'ipaymu';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure proper status values exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending') THEN
        ALTER TYPE enum_orders_status ADD VALUE 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'paid') THEN
        ALTER TYPE enum_orders_status ADD VALUE 'paid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'expired') THEN
        ALTER TYPE enum_orders_status ADD VALUE 'expired';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cancelled') THEN
        ALTER TYPE enum_orders_status ADD VALUE 'cancelled';
    END IF;
END $$;

-- Allow service role to update orders
DROP POLICY IF EXISTS "Service role can update orders" ON orders;
CREATE POLICY "Service role can update orders" 
ON orders FOR UPDATE 
TO service_role 
USING (true)
WITH CHECK (true);
```

## Edge Functions

The following edge functions will be deployed:
1. `create-order` - Creates order in database
2. `create-payment` - Creates iPaymu payment transaction
3. `payment-webhook` - Handles payment callbacks from iPaymu

## Payment Flow

1. Customer adds items to cart and clicks checkout
2. Order is created with status "pending"
3. Payment modal shows with VA number
4. Customer clicks "Bayar" 
5. Edge function creates iPaymu transaction
6. Customer redirected to iPaymu payment page
7. After payment, iPaymu calls webhook
8. Webhook updates order status to "paid"
9. Customer redirected back to success page
