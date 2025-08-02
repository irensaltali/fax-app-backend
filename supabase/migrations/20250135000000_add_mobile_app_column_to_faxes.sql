-- Add mobile app tracking column to faxes table
-- This column will indicate if the fax is coming from our mobile app

-- Add the column
ALTER TABLE faxes ADD COLUMN IF NOT EXISTS is_from_mobile_app BOOLEAN DEFAULT false;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_faxes_is_from_mobile_app ON faxes(is_from_mobile_app);

-- Make the column immutable by creating a trigger that prevents updates
CREATE OR REPLACE FUNCTION prevent_mobile_app_column_update()
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
CREATE TRIGGER prevent_faxes_mobile_app_update 
    BEFORE UPDATE ON faxes 
    FOR EACH ROW 
    EXECUTE FUNCTION prevent_mobile_app_column_update();

-- Add comment
COMMENT ON COLUMN faxes.is_from_mobile_app IS 'Indicates if the fax was sent from our mobile app. This column is immutable and cannot be modified after creation.'; 
