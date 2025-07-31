-- Create webhook_events table for storing incoming webhooks
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    headers JSONB NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);

-- Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_webhook_events_updated_at 
    BEFORE UPDATE ON webhook_events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS (Row Level Security) policies
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy for service role access (admin access)
CREATE POLICY "Service role can access all webhook events" ON webhook_events
    FOR ALL USING (auth.role() = 'service_role');

-- Policy for authenticated users to read webhook events (if needed for admin panel)
CREATE POLICY "Authenticated users can read webhook events" ON webhook_events
    FOR SELECT USING (auth.role() = 'authenticated');

-- Add comments for documentation
COMMENT ON TABLE webhook_events IS 'Stores incoming webhook events from various services (App Store, Sign in with Apple, etc.)';
COMMENT ON COLUMN webhook_events.type IS 'Type of webhook (app_store, sign_in_with_apple, etc.)';
COMMENT ON COLUMN webhook_events.payload IS 'The webhook payload as JSON';
COMMENT ON COLUMN webhook_events.headers IS 'HTTP headers from the webhook request';
COMMENT ON COLUMN webhook_events.received_at IS 'Timestamp when the webhook was received';
COMMENT ON COLUMN webhook_events.processed IS 'Whether the webhook has been processed';
COMMENT ON COLUMN webhook_events.processed_at IS 'Timestamp when the webhook was processed'; 
