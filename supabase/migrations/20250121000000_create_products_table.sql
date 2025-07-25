-- Create products table for storing product information with limits
-- This table stores product details including page limits and expiration days
CREATE TABLE IF NOT EXISTS products (
    product_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT,
    page_limit INTEGER NOT NULL DEFAULT 0,
    expire_days INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_display_name ON products(display_name);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;X

-- Deny all other access to authenticated users
CREATE POLICY "Deny other access to users" 
ON products 
FOR ALL 
TO authenticated 
USING (false);

-- Allow full access only to service role
CREATE POLICY "Service role full access" 
ON products 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- Update revenuecat_webhook_events table to reference products table
-- First, add the foreign key constraint
ALTER TABLE revenuecat_webhook_events 
ADD CONSTRAINT fk_revenuecat_webhook_events_product_id 
FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE SET NULL;

-- Create index for the foreign key
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_product_id_fk ON revenuecat_webhook_events(product_id);
