-- Create free_fax_receives table for storing received faxes
-- This table is only accessible via service role, not user access

CREATE TABLE IF NOT EXISTS free_fax_receives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id TEXT NOT NULL, -- The webhook event ID from Telnyx
    from_number TEXT NOT NULL, -- The sender's phone number
    page_count INTEGER NOT NULL DEFAULT 1,
    media_url TEXT NOT NULL, -- The R2 URL where the fax file is stored
    original_media_url TEXT, -- The original Telnyx media URL
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_free_fax_receives_webhook_id ON free_fax_receives(webhook_id);
CREATE INDEX IF NOT EXISTS idx_free_fax_receives_from_number ON free_fax_receives(from_number);
CREATE INDEX IF NOT EXISTS idx_free_fax_receives_received_at ON free_fax_receives(received_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE free_fax_receives ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access this table
CREATE POLICY "Service role only" ON free_fax_receives
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_free_fax_receives_updated_at 
    BEFORE UPDATE ON free_fax_receives 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 
