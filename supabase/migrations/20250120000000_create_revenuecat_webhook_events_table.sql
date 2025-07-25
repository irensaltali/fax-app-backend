-- Create RevenueCat webhook events table
-- This table stores webhook events from RevenueCat for subscription management
CREATE TABLE IF NOT EXISTS revenuecat_webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id TEXT,
    subscription_id TEXT,
    entitlement_id TEXT,
    period_type TEXT,
    purchased_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    environment TEXT,
    store TEXT,
    is_trial_conversion BOOLEAN DEFAULT FALSE,
    price DECIMAL(10,2),
    currency TEXT,
    country_code TEXT,
    app_id TEXT,
    original_app_user_id TEXT,
    aliases JSONB DEFAULT '[]',
    attributes JSONB DEFAULT '{}',
    product_identifier TEXT,
    product_title TEXT,
    product_description TEXT,
    raw_data JSONB NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_user_id ON revenuecat_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_event_type ON revenuecat_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_processed_at ON revenuecat_webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_subscription_id ON revenuecat_webhook_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_event_id ON revenuecat_webhook_events(event_id);

-- Enable Row Level Security
ALTER TABLE revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

-- Deny all access to authenticated and anonymous users
CREATE POLICY "Deny all access to users" 
ON revenuecat_webhook_events 
FOR ALL 
TO authenticated, anon 
USING (false);

-- Allow full access only to service role
CREATE POLICY "Service role full access" 
ON revenuecat_webhook_events 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

