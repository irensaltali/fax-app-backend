-- Create RevenueCat webhook events table
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

-- Add subscription-related columns to profiles table if they don't exist
DO $$ 
BEGIN
    -- Add subscription_status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_status') THEN
        ALTER TABLE profiles ADD COLUMN subscription_status TEXT DEFAULT 'none';
    END IF;

    -- Add subscription_product_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_product_id') THEN
        ALTER TABLE profiles ADD COLUMN subscription_product_id TEXT;
    END IF;

    -- Add subscription_expires_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_expires_at') THEN
        ALTER TABLE profiles ADD COLUMN subscription_expires_at TIMESTAMPTZ;
    END IF;

    -- Add subscription_purchased_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_purchased_at') THEN
        ALTER TABLE profiles ADD COLUMN subscription_purchased_at TIMESTAMPTZ;
    END IF;

    -- Add subscription_store column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_store') THEN
        ALTER TABLE profiles ADD COLUMN subscription_store TEXT;
    END IF;

    -- Add subscription_environment column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_environment') THEN
        ALTER TABLE profiles ADD COLUMN subscription_environment TEXT;
    END IF;
END $$;

-- Create indexes for profiles table subscription columns
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_product_id ON profiles(subscription_product_id);

-- Add RLS policies for profiles table subscription columns
-- Users can view their own subscription data
CREATE POLICY "Users can view their own subscription data" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Service role can manage all subscription data
CREATE POLICY "Service role can manage all subscription data" ON profiles
    FOR ALL USING (auth.role() = 'service_role'); 
