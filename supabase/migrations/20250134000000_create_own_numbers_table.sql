-- Create own_numbers table for storing our own phone numbers
-- This table will be used to identify faxes coming from our mobile app

CREATE TABLE IF NOT EXISTS own_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE, -- The phone number (e.g., +1234567890)
    description TEXT, -- Optional description of the number
    is_active BOOLEAN DEFAULT true, -- Whether this number is currently active
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_own_numbers_phone_number ON own_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_own_numbers_is_active ON own_numbers(is_active);

-- Add RLS (Row Level Security) policies
ALTER TABLE own_numbers ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access this table
CREATE POLICY "Service role only" ON own_numbers
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

CREATE TRIGGER update_own_numbers_updated_at 
    BEFORE UPDATE ON own_numbers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE own_numbers IS 'Table for storing our own phone numbers to identify mobile app faxes'; 
