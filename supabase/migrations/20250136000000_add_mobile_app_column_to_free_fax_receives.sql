-- Add mobile app tracking column to free_fax_receives table
-- This column will indicate if the received fax is coming from our mobile app

-- Add the column
ALTER TABLE free_fax_receives ADD COLUMN IF NOT EXISTS is_from_mobile_app BOOLEAN DEFAULT false;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_free_fax_receives_is_from_mobile_app ON free_fax_receives(is_from_mobile_app);

-- Make the column immutable by creating a trigger that prevents updates
CREATE OR REPLACE FUNCTION prevent_free_fax_receives_mobile_app_column_update()
RETURNS TRIGGER AS $$
BEGIN
    -- If the column is being updated, raise an error
    IF OLD.is_from_mobile_app IS DISTINCT FROM NEW.is_from_mobile_app THEN
        RAISE EXCEPTION 'is_from_mobile_app column cannot be modified after creation';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger
CREATE TRIGGER prevent_free_fax_receives_mobile_app_update 
    BEFORE UPDATE ON free_fax_receives 
    FOR EACH ROW 
    EXECUTE FUNCTION prevent_free_fax_receives_mobile_app_column_update();

-- Add comment
COMMENT ON COLUMN free_fax_receives.is_from_mobile_app IS 'Indicates if the received fax was sent from our mobile app. This column is immutable and cannot be modified after creation.'; 
