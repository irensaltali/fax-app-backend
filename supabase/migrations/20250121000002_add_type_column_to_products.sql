-- Add type column to products table
-- This column defines the product type: subscription, limited-usage, or top-up
ALTER TABLE products 
ADD COLUMN type TEXT NOT NULL DEFAULT 'subscription' CHECK (type IN ('subscription', 'limited-usage', 'top-up'));

-- Remove the default constraint after setting appropriate values
ALTER TABLE products 
ALTER COLUMN type DROP DEFAULT; 
