-- Create user_transfers table for audit trail
CREATE TABLE IF NOT EXISTS user_transfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transfer_reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')) DEFAULT 'in_progress',
    transferred_subscriptions INTEGER DEFAULT 0,
    transferred_usage INTEGER DEFAULT 0,
    transferred_faxes INTEGER DEFAULT 0,
    old_user_deleted BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_transfers_from_user_id ON user_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_user_transfers_to_user_id ON user_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_user_transfers_status ON user_transfers(status);
CREATE INDEX IF NOT EXISTS idx_user_transfers_created_at ON user_transfers(created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_transfers ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" 
ON user_transfers 
FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- Deny all access to regular users
CREATE POLICY "Deny all access to users" 
ON user_transfers 
FOR ALL 
TO authenticated 
USING (false);

-- Create transaction function for user data transfer
CREATE OR REPLACE FUNCTION transfer_user_data_transaction(
    p_from_user_id UUID,
    p_to_user_id UUID,
    p_transfer_id UUID
)
RETURNS TABLE(
    transferred_subscriptions INTEGER,
    transferred_usage INTEGER,
    transferred_faxes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription_count INTEGER := 0;
    v_usage_count INTEGER := 0;
    v_fax_count INTEGER := 0;
BEGIN
    -- Transfer user subscriptions
    UPDATE user_subscriptions 
    SET user_id = p_to_user_id,
        updated_at = NOW()
    WHERE user_id = p_from_user_id 
    AND is_active = true;
    
    GET DIAGNOSTICS v_subscription_count = ROW_COUNT;
    
    -- Transfer usage records
    UPDATE usage 
    SET user_id = p_to_user_id,
        updated_at = NOW()
    WHERE user_id = p_from_user_id;
    
    GET DIAGNOSTICS v_usage_count = ROW_COUNT;
    
    -- Transfer faxes
    UPDATE faxes 
    SET user_id = p_to_user_id,
        updated_at = NOW()
    WHERE user_id = p_from_user_id;
    
    GET DIAGNOSTICS v_fax_count = ROW_COUNT;
    
    -- Return counts
    RETURN QUERY SELECT v_subscription_count, v_usage_count, v_fax_count;
    
    -- Log the transfer operation
    INSERT INTO user_transfers (
        id,
        from_user_id,
        to_user_id,
        transfer_reason,
        status,
        transferred_subscriptions,
        transferred_usage,
        transferred_faxes,
        completed_at
    ) VALUES (
        p_transfer_id,
        p_from_user_id,
        p_to_user_id,
        'revenuecat_transfer',
        'completed',
        v_subscription_count,
        v_usage_count,
        v_fax_count,
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        status = 'completed',
        transferred_subscriptions = v_subscription_count,
        transferred_usage = v_usage_count,
        transferred_faxes = v_fax_count,
        completed_at = NOW();
        
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error
        INSERT INTO user_transfers (
            id,
            from_user_id,
            to_user_id,
            transfer_reason,
            status,
            error_message,
            completed_at
        ) VALUES (
            p_transfer_id,
            p_from_user_id,
            p_to_user_id,
            'revenuecat_transfer',
            'failed',
            SQLERRM,
            NOW()
        ) ON CONFLICT (id) DO UPDATE SET
            status = 'failed',
            error_message = SQLERRM,
            completed_at = NOW();
            
        -- Re-raise the error
        RAISE;
END;
$$;

-- Add comment
COMMENT ON TABLE user_transfers IS 'Audit trail for user data transfers';
COMMENT ON FUNCTION transfer_user_data_transaction IS 'Transactional function to transfer user data between users'; 
