-- Create RevenueCat webhook events table
-- This table stores webhook events from RevenueCat for subscription management
CREATE TABLE IF NOT EXISTS private.revenuecat_webhook_events (
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
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_user_id ON private.revenuecat_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_event_type ON private.revenuecat_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_processed_at ON private.revenuecat_webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_subscription_id ON private.revenuecat_webhook_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_event_id ON private.revenuecat_webhook_events(event_id);

-- Create a function to handle webhook events for non-existent users
CREATE OR REPLACE FUNCTION handle_revenuecat_webhook_for_unknown_user()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is a test event, allow it
    IF NEW.event_type = 'TEST' THEN
        RETURN NEW;
    END IF;
    
    -- For other events, if user_id is null, log it but allow the insert
    IF NEW.user_id IS NULL THEN
        -- Log that we received a webhook for an unknown user
        -- This could be used to create a user record later if needed
        RAISE LOG 'RevenueCat webhook received for unknown user: event_type=%, original_app_user_id=%', 
            NEW.event_type, NEW.original_app_user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to handle webhook events for unknown users
DROP TRIGGER IF EXISTS handle_revenuecat_webhook_unknown_user ON private.revenuecat_webhook_events;
CREATE TRIGGER handle_revenuecat_webhook_unknown_user
    BEFORE INSERT ON private.revenuecat_webhook_events
    FOR EACH ROW EXECUTE FUNCTION handle_revenuecat_webhook_for_unknown_user();

-- Enable Row Level Security on the table
ALTER TABLE private.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

-- Create a restrictive policy that denies all access except for service role (admin)
CREATE POLICY "Admin only access to revenuecat_webhook_events" 
ON private.revenuecat_webhook_events 
FOR ALL 
TO authenticated, anon 
USING (false);

-- Create a policy for service role
CREATE POLICY "Service role full access" 
ON private.revenuecat_webhook_events 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

