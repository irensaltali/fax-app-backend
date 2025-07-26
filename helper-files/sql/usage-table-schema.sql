-- Usage Table Schema
-- This table tracks user resource consumption for billing and analytics

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

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_type ON usage(type);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_user_type_timestamp ON usage(user_id, type, timestamp DESC);

-- Row Level Security (RLS)
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage data
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

-- Service role has full access
CREATE POLICY "Service role full access" 
ON usage 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_usage_updated_at
    BEFORE UPDATE ON usage
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_updated_at();

-- Table comment
COMMENT ON TABLE usage IS 'Tracks user resource consumption for billing and analytics';

-- Column comments
COMMENT ON COLUMN usage.user_id IS 'Reference to auth.users table';
COMMENT ON COLUMN usage.type IS 'Type of resource: fax, storage, api_call';
COMMENT ON COLUMN usage.unit_type IS 'Unit of measurement: page, byte, call';
COMMENT ON COLUMN usage.usage_amount IS 'Amount of resource consumed';
COMMENT ON COLUMN usage.timestamp IS 'When the usage occurred';
COMMENT ON COLUMN usage.metadata IS 'Additional context about the usage (JSON)'; 
