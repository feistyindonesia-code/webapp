-- Add policy to allow anonymous users to insert customers (for weborder)
-- This allows new customers to be created when they access weborder

-- Allow anon role to INSERT customers
CREATE POLICY "Allow anon to insert customers"
    ON customers FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow anon role to SELECT customers (to check if phone exists)
CREATE POLICY "Allow anon to select customers"
    ON customers FOR SELECT
    TO anon
    USING (true);

-- Allow anon role to UPDATE their own customer record (for name changes)
CREATE POLICY "Allow anon to update customers"
    ON customers FOR UPDATE
    TO anon
    USING (phone = auth.jwt() ->> 'phone')
    WITH CHECK (phone = auth.jwt() ->> 'phone');
