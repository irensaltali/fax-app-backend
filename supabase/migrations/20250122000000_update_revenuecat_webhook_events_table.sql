-- Update RevenueCat webhook events table
-- Remove unused columns and update entitlement_id logic

-- Drop indexes that reference columns being removed
DROP INDEX IF EXISTS idx_revenuecat_webhook_events_subscription_id;

-- Remove columns that are no longer needed
ALTER TABLE revenuecat_webhook_events 
DROP COLUMN IF EXISTS subscription_id,
DROP COLUMN IF EXISTS aliases,
DROP COLUMN IF EXISTS attributes,
DROP COLUMN IF EXISTS product_identifier,
DROP COLUMN IF EXISTS product_title,
DROP COLUMN IF EXISTS product_description;
DROP COLUMN IF EXISTS original_app_user_id;

-- Update entitlement_id column to handle both single and array values
-- The application logic will handle extracting the appropriate entitlement_id
-- from either event.entitlement_id or event.entitlement_ids

-- Note: original_app_user_id column is kept for now but will be used differently
-- The application will use original_app_user_id as the user_id foreign key
-- instead of storing it separately 
