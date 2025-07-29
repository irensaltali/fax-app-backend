-- Clean up existing duplicate event_id values before adding unique constraint
-- Keep only the most recent record for each event_id
WITH duplicates AS (
    SELECT 
        event_id,
        COUNT(*) as count,
        MAX(created_at) as latest_created_at
    FROM public.revenuecat_webhook_events 
    WHERE event_id IS NOT NULL
    GROUP BY event_id 
    HAVING COUNT(*) > 1
),
records_to_delete AS (
    SELECT rwe.id
    FROM public.revenuecat_webhook_events rwe
    INNER JOIN duplicates d ON rwe.event_id = d.event_id
    WHERE rwe.created_at < d.latest_created_at
)
DELETE FROM public.revenuecat_webhook_events 
WHERE id IN (SELECT id FROM records_to_delete);

-- Add unique constraint on event_id to prevent duplicate webhook processing
-- Only add constraint if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'revenuecat_webhook_events_event_id_unique' 
        AND conrelid = 'public.revenuecat_webhook_events'::regclass
    ) THEN
        ALTER TABLE public.revenuecat_webhook_events 
        ADD CONSTRAINT revenuecat_webhook_events_event_id_unique 
        UNIQUE (event_id);
    END IF;
END $$;

-- Add index for faster duplicate lookups (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_event_id_unique 
ON public.revenuecat_webhook_events (event_id) 
WHERE event_id IS NOT NULL;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT revenuecat_webhook_events_event_id_unique ON public.revenuecat_webhook_events 
IS 'Prevents duplicate webhook processing by ensuring each RevenueCat event_id is unique'; 
