-- Add expire_period column to products table
-- This column will store the expiration period type: 'day', 'week', 'month', 'year'

-- Add the expire_period column with a default value of 'month'
ALTER TABLE products 
ADD COLUMN expire_period TEXT DEFAULT 'month' CHECK (expire_period IN ('day', 'week', 'month', 'year'));

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_products_expire_period ON products(expire_period);

-- Update existing records to have a default expire_period if they don't have one
-- This ensures all existing products have a valid expire_period value
UPDATE products 
SET expire_period = 'month' 
WHERE expire_period IS NULL; 
