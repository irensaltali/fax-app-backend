-- Create usage table for tracking user resource consumption
-- This table tracks usage of various resources like fax pages, storage bytes, etc.
CREATE TABLE IF NOT EXISTS usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('fax', 'storage', 'api_call')),
    unit_type TEXT NOT NULL CHECK (unit_type IN ('page', 'byte', 'call')),
    usage_amount NUMERIC(10, 4) NOT NULL CHECK (usage_amount >= 0),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_type ON usage(type);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_user_type_timestamp ON usage(user_id, type, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own usage data
CREATE POLICY "Users can read their own usage" 
ON usage 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Deny all other access to authenticated users
CREATE POLICY "Deny other access to users" 
ON usage 
FOR ALL 
TO authenticated 
USING (false);

-- Allow full access only to service role
CREATE POLICY "Service role full access" 
ON usage 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_usage_updated_at
    BEFORE UPDATE ON usage
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_updated_at();

-- Add comment
COMMENT ON TABLE usage IS 'Tracks user resource consumption for billing and analytics'; 
