-- Add payment_method and payment_status columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'whatsapp';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Allow anon users to insert orders
CREATE POLICY "Allow anon insert orders" 
ON orders FOR INSERT 
TO anon 
WITH CHECK (true);

-- Allow anon users to insert order_items
CREATE POLICY "Allow anon insert order_items" 
ON order_items FOR INSERT 
TO anon 
WITH CHECK (true);
