-- ============================================================
-- FEISTY DIGITAL ECOSYSTEM - SUPABASE DATABASE SCHEMA
-- Location: Malili, Sulawesi Selatan
-- Architecture: Multi-Outlet Ready (Single Outlet Active)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: outlets
-- Purpose: Store outlet information (currently only Malili)
-- ============================================================
CREATE TABLE outlets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert Malili outlet (first and primary outlet)
INSERT INTO outlets (id, name, address, active) 
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Malili', 'Malili, Sulawesi Selatan', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TABLE: customers (GLOBAL)
-- Purpose: Customer identity is global across all outlets
-- ============================================================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) UNIQUE NOT NULL,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    referred_by UUID REFERENCES customers(id),
    total_referrals INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_referral_code ON customers(referral_code);
CREATE INDEX idx_customers_referred_by ON customers(referred_by);

-- ============================================================
-- TABLE: products
-- Purpose: Products can differ per outlet
-- ============================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price INTEGER NOT NULL, -- Store as integer (Rupiah cents)
    stock INTEGER DEFAULT 100, -- Product stock quantity
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_products_outlet_id ON products(outlet_id);
CREATE INDEX idx_products_active ON products(active);

-- Insert sample products for Malili
INSERT INTO products (outlet_id, name, price, active) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Kopi Hitam', 15000, true),
    ('00000000-0000-0000-0000-000000000001', 'Kopi Susu', 18000, true),
    ('00000000-0000-0000-0000-000000000001', 'Teh Manis', 12000, true),
    ('00000000-0000-0000-0000-000000000001', 'Es Jeruk', 15000, true),
    ('00000000-0000-0000-0000-000000000001', 'Nasi Goreng', 25000, true),
    ('00000000-0000-0000-0000-000000000001', 'Mie Goreng', 22000, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLE: orders
-- Purpose: Store order information with referral tracking
-- ============================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    total INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
    referral_rewarded BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_outlet_id ON orders(outlet_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- ============================================================
-- TABLE: order_items
-- Purpose: Store individual items in an order
-- ============================================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL,
    subtotal INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- ============================================================
-- TABLE: users
-- Purpose: Staff and admin users for POS and Admin Dashboard
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'cashier')),
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_outlet_id ON users(outlet_id);

-- Insert owner user (change password after first login)
INSERT INTO users (name, email, role, outlet_id) VALUES
    ('Pemilik Feisty', 'owner@feisty.id', 'owner', NULL)
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- TABLE: delivery_zones (Future Ready)
-- Purpose: Prepare structure for delivery zone management
-- ============================================================
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    free_radius_km DECIMAL(5,2),
    max_radius_km DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default delivery zone for Malili
INSERT INTO delivery_zones (outlet_id, name, free_radius_km, max_radius_km) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Malili Area', 3.00, 15.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- REFERRAL SYSTEM TRIGGER
-- Purpose: Automatically reward referrer when order is completed
-- ============================================================

-- Function to handle referral reward
CREATE OR REPLACE FUNCTION handle_referral_reward()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process when:
    -- 1. Order status changes to 'completed'
    -- 2. referral_rewarded is still false
    -- 3. Customer has a referrer (referred_by is not null)
    IF NEW.status = 'completed' 
       AND NEW.referral_rewarded = false 
       AND NEW.customer_id IS NOT NULL THEN
        
        -- Check if customer has a referrer
        UPDATE customers
        SET total_referrals = total_referrals + 1
        WHERE id = (
            SELECT referred_by 
            FROM customers 
            WHERE id = NEW.customer_id
            LIMIT 1
        )
        AND referred_by IS NOT NULL;

        -- Mark referral as rewarded to prevent double counting
        UPDATE orders
        SET referral_rewarded = true
        WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS trigger_referral_reward ON orders;
CREATE TRIGGER trigger_referral_reward
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_referral_reward();

-- ============================================================
-- HELPER FUNCTION: Generate unique referral code
-- ============================================================
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code VARCHAR(50);
    code_exists BOOLEAN := true;
BEGIN
    -- Generate unique 8-character alphanumeric code
    WHILE code_exists LOOP
        new_code := UPPER(
            SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)
        );
        SELECT EXISTS(SELECT 1 FROM customers WHERE referral_code = new_code)
        INTO code_exists;
    END LOOP;
    
    NEW.referral_code := new_code;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to generate referral code
DROP TRIGGER IF EXISTS trigger_generate_referral_code ON customers;
CREATE TRIGGER trigger_generate_referral_code
    BEFORE INSERT ON customers
    FOR EACH ROW
    WHEN (NEW.referral_code IS NULL)
    EXECUTE FUNCTION generate_referral_code();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: outlets
-- ============================================================

-- Everyone can read outlets (needed for dropdowns, etc.)
CREATE POLICY "Anyone can view outlets"
    ON outlets FOR SELECT
    USING (true);

-- Only service role can insert/update/delete
CREATE POLICY "Service role can manage outlets"
    ON outlets FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- RLS POLICIES: customers
-- ============================================================

-- Customers can read their own data
CREATE POLICY "Customers can read own data"
    ON customers FOR SELECT
    USING (
        auth.uid()::TEXT = id::TEXT 
        OR auth.role() IN ('owner', 'admin', 'cashier', 'service_role')
    );

-- Service role can insert customers (WhatsApp bot)
CREATE POLICY "Service role can insert customers"
    ON customers FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Service role can update customers
CREATE POLICY "Service role can update customers"
    ON customers FOR UPDATE
    USING (auth.role() = 'service_role');

-- ============================================================
-- RLS POLICIES: products
-- ============================================================

-- Authenticated users can read active products
CREATE POLICY "Anyone can read active products"
    ON products FOR SELECT
    USING (
        active = true 
        OR auth.role() IN ('owner', 'admin', 'cashier', 'service_role')
    );

-- Service role can manage products
CREATE POLICY "Service role can manage products"
    ON products FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- RLS POLICIES: orders
-- ============================================================

-- Owner can view all orders
CREATE POLICY "Owner can view all orders"
    ON orders FOR SELECT
    USING (
        auth.role() = 'owner' 
        OR auth.role() = 'service_role'
    );

-- Admin can view orders for their outlet
CREATE POLICY "Admin can view outlet orders"
    ON orders FOR SELECT
    USING (
        auth.role() = 'admin' 
        AND outlet_id = (
            SELECT outlet_id FROM users WHERE id::TEXT = auth.uid()::TEXT
        )
    );

-- Cashier can view orders for their outlet
CREATE POLICY "Cashier can view outlet orders"
    ON orders FOR SELECT
    USING (
        auth.role() = 'cashier' 
        AND outlet_id = (
            SELECT outlet_id FROM users WHERE id::TEXT = auth.uid()::TEXT
        )
    );

-- Service role can insert orders (Web Order)
CREATE POLICY "Authenticated can insert orders"
    ON orders FOR INSERT
    WITH CHECK (
        auth.role() IN ('authenticated', 'service_role')
    );

-- Cashier/Admin can update order status
CREATE POLICY "Staff can update order status"
    ON orders FOR UPDATE
    USING (
        auth.role() IN ('owner', 'admin', 'cashier', 'service_role')
    );

-- ============================================================
-- RLS POLICIES: order_items
-- ============================================================

-- Related users can view order items
CREATE POLICY "Users can view order items"
    ON order_items FOR SELECT
    USING (
        auth.role() IN ('owner', 'admin', 'cashier', 'service_role', 'authenticated')
    );

-- Service role can manage order items
CREATE POLICY "Service role can manage order items"
    ON order_items FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- RLS POLICIES: users
-- ============================================================

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
    ON users FOR SELECT
    USING (
        id::TEXT = auth.uid()::TEXT 
        OR auth.role() IN ('owner', 'service_role')
    );

-- Owner can manage all users
CREATE POLICY "Owner can manage users"
    ON users FOR ALL
    USING (auth.role() = 'owner');

-- Service role can manage users
CREATE POLICY "Service role can manage users"
    ON users FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- RLS POLICIES: delivery_zones
-- ============================================================

-- Anyone can read delivery zones
CREATE POLICY "Anyone can read delivery zones"
    ON delivery_zones FOR SELECT
    USING (true);

-- Service role can manage delivery zones
CREATE POLICY "Service role can manage delivery zones"
    ON delivery_zones FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- SUPABASE AUTH: Custom Claims for role-based access
-- ============================================================

-- Function to set user role as custom claim
CREATE OR REPLACE FUNCTION set_user_role(user_id UUID, user_role TEXT, outlet_uuid UUID)
RETURNS VOID AS $$
BEGIN
    -- This is handled by the users table, not auth.users
    -- Role is stored in the users table with role field
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DATABASE FUNCTIONS FOR BUSINESS LOGIC
-- ============================================================

-- Function to get customer by phone (for WhatsApp bot)
CREATE OR REPLACE FUNCTION get_customer_by_phone(phone_number TEXT)
RETURNS TABLE(
    id UUID,
    name VARCHAR,
    phone VARCHAR,
    referral_code VARCHAR,
    referred_by UUID,
    total_referrals INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.name, c.phone, c.referral_code, c.referred_by, c.total_referrals, c.created_at
    FROM customers c
    WHERE c.phone = phone_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create new customer with referral
CREATE OR REPLACE FUNCTION create_customer(
    customer_name TEXT,
    customer_phone TEXT,
    referrer_referral_code TEXT DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    name VARCHAR,
    phone VARCHAR,
    referral_code VARCHAR,
    referred_by UUID,
    total_referrals INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    new_customer_id UUID;
    referrer_id UUID;
BEGIN
    -- Find referrer by referral code if provided
    IF referrer_referral_code IS NOT NULL THEN
        SELECT id INTO referrer_id
        FROM customers
        WHERE referral_code = referrer_referral_code
        LIMIT 1;
    END IF;

    -- Insert new customer
    INSERT INTO customers (name, phone, referred_by)
    VALUES (customer_name, customer_phone, referrer_id)
    RETURNING id INTO new_customer_id;

    -- Return the created customer
    RETURN QUERY
    SELECT c.id, c.name, c.phone, c.referral_code, c.referred_by, c.total_referrals, c.created_at
    FROM customers c
    WHERE c.id = new_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get products by outlet
CREATE OR REPLACE FUNCTION get_products_by_outlet(outlet_uuid UUID)
RETURNS TABLE(
    id UUID,
    name VARCHAR,
    price INTEGER,
    active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.price, p.active, p.created_at
    FROM products p
    WHERE p.outlet_id = outlet_uuid AND p.active = true
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get today's orders for outlet
CREATE OR REPLACE FUNCTION get_today_orders(outlet_uuid UUID DEFAULT NULL)
RETURNS TABLE(
    id UUID,
    outlet_id UUID,
    customer_id UUID,
    total INTEGER,
    status VARCHAR,
    referral_rewarded BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    customer_name VARCHAR,
    customer_phone VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.outlet_id,
        o.customer_id,
        o.total,
        o.status,
        o.referral_rewarded,
        o.created_at,
        COALESCE(c.name, 'Guest')::VARCHAR AS customer_name,
        COALESCE(c.phone, '-')::VARCHAR AS customer_phone
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE 
        o.created_at::DATE = CURRENT_DATE
        AND (outlet_uuid IS NULL OR o.outlet_id = outlet_uuid)
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get today's sales summary
CREATE OR REPLACE FUNCTION get_today_sales(outlet_uuid UUID DEFAULT NULL)
RETURNS TABLE(
    total_orders INTEGER,
    total_sales INTEGER,
    completed_orders INTEGER,
    pending_orders INTEGER,
    processing_orders INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER AS total_orders,
        COALESCE(SUM(o.total), 0)::INTEGER AS total_sales,
        COUNT(*) FILTER (WHERE o.status = 'completed')::INTEGER AS completed_orders,
        COUNT(*) FILTER (WHERE o.status = 'pending')::INTEGER AS pending_orders,
        COUNT(*) FILTER (WHERE o.status = 'processing')::INTEGER AS processing_orders
    FROM orders o
    WHERE 
        o.created_at::DATE = CURRENT_DATE
        AND (outlet_uuid IS NULL OR o.outlet_id = outlet_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get product sales summary
CREATE OR REPLACE FUNCTION get_product_sales(
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE DEFAULT CURRENT_DATE,
    outlet_uuid UUID DEFAULT NULL
)
RETURNS TABLE(
    product_name VARCHAR,
    quantity_sold INTEGER,
    total_sales INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        oi.product_name,
        SUM(oi.quantity)::INTEGER AS quantity_sold,
        SUM(oi.subtotal)::INTEGER AS total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE 
        o.created_at::DATE BETWEEN start_date AND end_date
        AND (outlet_uuid IS NULL OR o.outlet_id = outlet_uuid)
        AND o.status = 'completed'
    GROUP BY oi.product_name
    ORDER BY total_sales DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get top referrers
CREATE OR REPLACE FUNCTION get_top_referrers(limit_count INTEGER DEFAULT 10)
RETURNS TABLE(
    customer_name VARCHAR,
    referral_code VARCHAR,
    total_referrals INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.name AS customer_name,
        c.referral_code,
        c.total_referrals
    FROM customers c
    WHERE c.total_referrals > 0
    ORDER BY c.total_referrals DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get daily sales for chart (last 30 days)
CREATE OR REPLACE FUNCTION get_daily_sales(
    days_count INTEGER DEFAULT 30,
    outlet_uuid UUID DEFAULT NULL
)
RETURNS TABLE(
    sale_date DATE,
    daily_total INTEGER,
    order_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.created_at::DATE AS sale_date,
        SUM(o.total)::INTEGER AS daily_total,
        COUNT(*)::INTEGER AS order_count
    FROM orders o
    WHERE 
        o.created_at >= CURRENT_DATE - (days_count || ' days')::INTERVAL
        AND (outlet_uuid IS NULL OR o.outlet_id = outlet_uuid)
        AND o.status = 'completed'
    GROUP BY o.created_at::DATE
    ORDER BY sale_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
