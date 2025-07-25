-- Fix RevenueCat webhook events table to handle users who don't exist yet
-- The user_id column should be nullable because RevenueCat can send webhooks for:
-- 1. Test events with non-existent user IDs
-- 2. Users who haven't signed up in the app yet
-- 3. Events from RevenueCat's sandbox environment

-- Ensure user_id column is nullable
ALTER TABLE revenuecat_webhook_events ALTER COLUMN user_id DROP NOT NULL;

-- Add comment to explain why user_id can be null
COMMENT ON COLUMN revenuecat_webhook_events.user_id IS 'Can be null for test events or users who haven''t signed up yet';

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
DROP TRIGGER IF EXISTS handle_revenuecat_webhook_unknown_user ON revenuecat_webhook_events;
CREATE TRIGGER handle_revenuecat_webhook_unknown_user
    BEFORE INSERT ON revenuecat_webhook_events
    FOR EACH ROW EXECUTE FUNCTION handle_revenuecat_webhook_for_unknown_user(); 



-- Enable Row Level Security on the table
ALTER TABLE public.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

-- Create a restrictive policy that denies all access except for service role (admin)
CREATE POLICY "Admin only access to revenuecat_webhook_events" 
ON public.revenuecat_webhook_events 
FOR ALL 
TO authenticated, anon 
USING (false);

-- Optional: Create a policy for service role
CREATE POLICY "Service role full access" 
ON public.revenuecat_webhook_events 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);
