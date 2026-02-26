-- Rename columns to match requirements (if they exist)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'ipaymu';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure status column exists and has proper values
DO $ 
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
END $;

-- Allow anon users to insert orders
DROP POLICY IF EXISTS "Allow anon insert orders" ON orders;
CREATE POLICY "Allow anon insert orders" 
ON orders FOR INSERT 
TO anon 
WITH CHECK (true);

-- Allow anon users to insert order_items
DROP POLICY IF EXISTS "Allow anon insert order_items" ON order_items;
CREATE POLICY "Allow anon insert order_items" 
ON order_items FOR INSERT 
TO anon 
WITH CHECK (true);

-- Allow service role to update orders
DROP POLICY IF EXISTS "Service role can update orders" ON orders;
CREATE POLICY "Service role can update orders" 
ON orders FOR UPDATE 
TO service_role 
USING (true)
WITH CHECK (true);
