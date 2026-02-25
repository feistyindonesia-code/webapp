-- ============================================================
-- FEISTY MULTI-OUTLET LOCATION SYSTEM MIGRATION
-- Run this script to add location-based ordering features
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: outlet_locations
-- ============================================================
CREATE TABLE IF NOT EXISTS outlet_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_km DECIMAL(5, 2) DEFAULT 20.00,
    free_delivery_km DECIMAL(5, 2) DEFAULT 3.00,
    delivery_fee_per_km INTEGER DEFAULT 2000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert Malili outlet location
INSERT INTO outlet_locations (outlet_id, latitude, longitude, radius_km, free_delivery_km, delivery_fee_per_km, is_active) VALUES
    ('00000000-0000-0000-0000-000000000001', -2.5833, 120.3667, 20.00, 3.00, 2000, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLE: customer_locations
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address TEXT,
    label VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE: order_delivery
-- ============================================================
CREATE TABLE IF NOT EXISTS order_delivery (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address TEXT NOT NULL,
    distance_km DECIMAL(5, 2),
    delivery_fee INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE: outlet_whatsapp
-- ============================================================
CREATE TABLE IF NOT EXISTS outlet_whatsapp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL,
    contact_name VARCHAR(255),
    is_primary BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default WhatsApp for Malili
INSERT INTO outlet_whatsapp (outlet_id, phone_number, contact_name, is_primary) VALUES
    ('00000000-0000-0000-0000-000000000001', '0812-xxxx-xxxx', 'Admin Malili', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================
ALTER TABLE outlets 
ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

UPDATE outlets SET is_primary = true WHERE id = '00000000-0000-0000-0000-000000000001';

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS default_location_id UUID;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_outlet_locations_outlet ON outlet_locations(outlet_id);
CREATE INDEX IF NOT EXISTS idx_customer_locations_customer ON customer_locations(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_order ON order_delivery(order_id);
CREATE INDEX IF NOT EXISTS idx_outlet_whatsapp_outlet ON outlet_whatsapp(outlet_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE outlet_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_whatsapp ENABLE ROW LEVEL SECURITY;

-- Outlet Locations
DROP POLICY IF EXISTS "Anyone can read outlet locations" ON outlet_locations;
CREATE POLICY "Anyone can read outlet locations" ON outlet_locations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role can manage outlet locations" ON outlet_locations;
CREATE POLICY "Service role can manage outlet locations" ON outlet_locations FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Owner can manage outlet locations" ON outlet_locations;
CREATE POLICY "Owner can manage outlet locations" ON outlet_locations FOR ALL USING (auth.role() = 'owner');

-- Customer Locations
DROP POLICY IF EXISTS "Customer can manage own location" ON customer_locations;
CREATE POLICY "Customer can manage own location" ON customer_locations FOR ALL USING (
    auth.uid()::TEXT = customer_id::TEXT OR auth.role() IN ('owner', 'outlet_admin', 'service_role')
);

DROP POLICY IF EXISTS "Service role can manage customer locations" ON customer_locations;
CREATE POLICY "Service role can manage customer locations" ON customer_locations FOR ALL USING (auth.role() = 'service_role');

-- Order Delivery
DROP POLICY IF EXISTS "Service role can manage order delivery" ON order_delivery;
CREATE POLICY "Service role can manage order delivery" ON order_delivery FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated can read order delivery" ON order_delivery;
CREATE POLICY "Authenticated can read order delivery" ON order_delivery FOR SELECT USING (auth.role() IN ('authenticated', 'owner', 'outlet_admin', 'cashier', 'service_role'));

-- Outlet WhatsApp
DROP POLICY IF EXISTS "Owner can manage outlet whatsapp" ON outlet_whatsapp;
CREATE POLICY "Owner can manage outlet whatsapp" ON outlet_whatsapp FOR ALL USING (auth.role() = 'owner');

DROP POLICY IF EXISTS "Service role can manage outlet whatsapp" ON outlet_whatsapp;
CREATE POLICY "Service role can manage outlet whatsapp" ON outlet_whatsapp FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- DATABASE FUNCTIONS
-- ============================================================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS find_nearest_outlet(DECIMAL, DECIMAL);
DROP FUNCTION IF EXISTS calculate_delivery_fee(DECIMAL, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS get_available_outlets(DECIMAL, DECIMAL);
DROP FUNCTION IF EXISTS get_outlet_whatsapp(UUID);
DROP FUNCTION IF EXISTS save_customer_location(UUID, DECIMAL, DECIMAL, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS get_customer_default_location(UUID);
DROP FUNCTION IF EXISTS get_customer_locations(UUID);

-- Function: Find nearest outlet
CREATE OR REPLACE FUNCTION find_nearest_outlet(
    customer_lat DECIMAL(10, 8),
    customer_lng DECIMAL(11, 8)
)
RETURNS TABLE(
    outlet_id UUID,
    outlet_name VARCHAR,
    outlet_address TEXT,
    distance_km DECIMAL(5, 2),
    radius_km DECIMAL(5, 2),
    can_deliver BOOLEAN,
    free_delivery_km DECIMAL(5, 2),
    delivery_fee_per_km INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id AS outlet_id,
        o.name AS outlet_name,
        o.address AS outlet_address,
        (6371 * acos(
            cos(radians(customer_lat)) * cos(radians(ol.latitude)) * 
            cos(radians(ol.longitude) - radians(customer_lng)) + 
            sin(radians(customer_lat)) * sin(radians(ol.latitude))
        ))::DECIMAL(5,2) AS distance_km,
        ol.radius_km,
        (6371 * acos(
            cos(radians(customer_lat)) * cos(radians(ol.latitude)) * 
            cos(radians(ol.longitude) - radians(customer_lng)) + 
            sin(radians(customer_lat)) * sin(radians(ol.latitude))
        )) <= ol.radius_km AS can_deliver,
        ol.free_delivery_km,
        ol.delivery_fee_per_km
    FROM outlets o
    JOIN outlet_locations ol ON o.id = ol.outlet_id
    WHERE o.active = true AND ol.is_active = true
    ORDER BY distance_km
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Calculate delivery fee
CREATE OR REPLACE FUNCTION calculate_delivery_fee(
    distance_km DECIMAL(5, 2),
    free_radius_km DECIMAL(5, 2),
    fee_per_km INTEGER
)
RETURNS INTEGER AS $$
DECLARE chargeable_distance DECIMAL(5, 2);
BEGIN
    IF distance_km <= free_radius_km OR free_radius_km IS NULL THEN
        RETURN 0;
    END IF;
    chargeable_distance := distance_km - free_radius_km;
    RETURN (chargeable_distance * fee_per_km)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Get available outlets
CREATE OR REPLACE FUNCTION get_available_outlets(
    customer_lat DECIMAL(10, 8),
    customer_lng DECIMAL(11, 8)
)
RETURNS TABLE(
    outlet_id UUID,
    outlet_name VARCHAR,
    outlet_address TEXT,
    distance_km DECIMAL(5, 2),
    can_deliver BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id AS outlet_id,
        o.name AS outlet_name,
        o.address AS outlet_address,
        (6371 * acos(
            cos(radians(customer_lat)) * cos(radians(ol.latitude)) * 
            cos(radians(ol.longitude) - radians(customer_lng)) + 
            sin(radians(customer_lat)) * sin(radians(ol.latitude))
        ))::DECIMAL(5,2) AS distance_km,
        (6371 * acos(
            cos(radians(customer_lat)) * cos(radians(ol.latitude)) * 
            cos(radians(ol.longitude) - radians(customer_lng)) + 
            sin(radians(customer_lat)) * sin(radians(ol.latitude))
        )) <= ol.radius_km AS can_deliver
    FROM outlets o
    JOIN outlet_locations ol ON o.id = ol.outlet_id
    WHERE o.active = true AND ol.is_active = true
    ORDER BY distance_km;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get outlet WhatsApp
CREATE OR REPLACE FUNCTION get_outlet_whatsapp(outlet_uuid UUID)
RETURNS TABLE(phone_number VARCHAR, contact_name VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT ow.phone_number, ow.contact_name
    FROM outlet_whatsapp ow
    WHERE ow.outlet_id = outlet_uuid AND ow.is_primary = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Save customer location
CREATE OR REPLACE FUNCTION save_customer_location(
    customer_uuid UUID,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    addr TEXT,
    addr_label TEXT,
    set_default BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE location_id UUID;
BEGIN
    IF set_default THEN
        UPDATE customer_locations SET is_default = false WHERE customer_id = customer_uuid;
    END IF;
    
    SELECT id INTO location_id FROM customer_locations
    WHERE customer_id = customer_uuid AND latitude = lat AND longitude = lng;
    
    IF location_id IS NOT NULL THEN
        UPDATE customer_locations SET address = addr, label = addr_label, is_default = set_default, updated_at = NOW() WHERE id = location_id;
    ELSE
        INSERT INTO customer_locations (customer_id, latitude, longitude, address, label, is_default)
        VALUES (customer_uuid, lat, lng, addr, addr_label, set_default) RETURNING id INTO location_id;
    END IF;
    
    RETURN location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get customer default location
CREATE OR REPLACE FUNCTION get_customer_default_location(customer_uuid UUID)
RETURNS TABLE(id UUID, latitude DECIMAL(10, 8), longitude DECIMAL(11, 8), address TEXT, label VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT cl.id, cl.latitude, cl.longitude, cl.address, cl.label
    FROM customer_locations cl
    WHERE cl.customer_id = customer_uuid AND cl.is_default = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get customer saved locations
CREATE OR REPLACE FUNCTION get_customer_locations(customer_uuid UUID)
RETURNS TABLE(id UUID, latitude DECIMAL(10, 8), longitude DECIMAL(11, 8), address TEXT, label VARCHAR, is_default BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    SELECT cl.id, cl.latitude, cl.longitude, cl.address, cl.label, cl.is_default
    FROM customer_locations cl
    WHERE cl.customer_id = customer_uuid
    ORDER BY cl.is_default DESC, cl.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
SELECT 'Migration completed successfully!' AS status;
