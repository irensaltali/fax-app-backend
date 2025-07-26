-- Create user_subscriptions table for storing current subscription and packages
-- This table stores active subscriptions and packages for each user
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    subscription_id TEXT, -- RevenueCat subscription ID for tracking
    entitlement_id TEXT, -- RevenueCat entitlement ID
    purchased_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ, -- NULL means it doesn't expire
    page_limit INTEGER NOT NULL DEFAULT 0,
    pages_used INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for necessary columns only
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_product_id ON user_subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_is_active ON user_subscriptions(is_active);

-- Create unique constraint to ensure only one subscription per user
-- This constraint will be enforced at the application level since PostgreSQL doesn't support
-- subqueries in index predicates. The application will check for existing subscriptions
-- before creating new ones for subscription type products.

-- Enable Row Level Security
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own subscriptions
CREATE POLICY "Users can read their own subscriptions" 
ON user_subscriptions 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Deny all other access to authenticated users
CREATE POLICY "Deny other access to users" 
ON user_subscriptions 
FOR ALL 
TO authenticated 
USING (false);

-- Allow full access only to service role
CREATE POLICY "Service role full access" 
ON user_subscriptions 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_user_subscriptions_updated_at
    BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_subscriptions_updated_at(); 
