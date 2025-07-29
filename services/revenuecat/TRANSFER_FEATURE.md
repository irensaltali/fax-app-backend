# RevenueCat Transfer Feature

## Overview

This document describes the RevenueCat Transfer feature implementation for the Send Fax Pro application. The transfer feature allows users to transfer their subscriptions, usage data, and fax records between accounts, which is particularly useful when users switch devices or accounts.

## Features

### 1. User Data Transfer
- **Subscriptions**: Transfers active user subscriptions to the new user
- **Usage Records**: Transfers all usage tracking data
- **Fax Records**: Transfers all fax transmission history
- **Anonymous User Cleanup**: Automatically deletes anonymous users after successful transfer

### 2. Audit Trail
- Complete audit trail of all transfer operations
- Tracks transfer status, counts, and error messages
- Provides full traceability for compliance and debugging

### 3. Transaction Safety
- All transfer operations are wrapped in database transactions
- Ensures atomicity - either all operations succeed or all fail
- Prevents data corruption and partial transfers

### 4. Validation
- Validates both source and target users exist
- Prevents transfers to anonymous users
- Ensures data integrity before processing

## Database Schema

### User Transfers Table
```sql
CREATE TABLE user_transfers (
    id UUID PRIMARY KEY,
    from_user_id UUID REFERENCES auth.users(id),
    to_user_id UUID REFERENCES auth.users(id),
    transfer_reason TEXT NOT NULL,
    status TEXT CHECK (status IN ('in_progress', 'completed', 'failed')),
    transferred_subscriptions INTEGER DEFAULT 0,
    transferred_usage INTEGER DEFAULT 0,
    transferred_faxes INTEGER DEFAULT 0,
    old_user_deleted BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

### Transaction Function
```sql
CREATE FUNCTION transfer_user_data_transaction(
    p_from_user_id UUID,
    p_to_user_id UUID,
    p_transfer_id UUID
) RETURNS TABLE(
    transferred_subscriptions INTEGER,
    transferred_usage INTEGER,
    transferred_faxes INTEGER
);
```

## API Implementation

### Webhook Handler
The transfer feature is triggered by RevenueCat `TRANSFER` webhook events:

```javascript
async handleTransfer(webhookData, callerEnvObj) {
    const event = webhookData.event;
    const fromUserId = event.transferred_from[0];
    const toUserId = event.transferred_to[0];
    
    const transferResult = await DatabaseUtils.transferUserData(
        fromUserId, 
        toUserId, 
        callerEnvObj, 
        this.logger, 
        'revenuecat_transfer'
    );
}
```

### Database Utilities
- `transferUserData()`: Main transfer orchestration method
- `validateUsersForTransfer()`: User validation
- `createTransferAuditRecord()`: Audit trail creation
- `updateTransferAuditRecord()`: Audit trail updates

## Consumable Purchase Support

### Problem
One-time purchases (consumables) like `fax_pro_consumable_10` were not being properly stored in the database, preventing users from using their purchased fax credits.

### Solution
- Added `NON_RENEWING_PURCHASE` to the list of events that create user subscriptions
- Implemented `addConsumablePages()` method to handle consumable purchases
- Consumables add pages to existing subscriptions or create new ones
- Proper expiration handling based on product configuration

### Implementation
```javascript
// In storeRevenueCatWebhookEvent method
if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE'].includes(event.type)) {
    if (event.type === 'NON_RENEWING_PURCHASE' && product.type === 'limited-usage') {
        await DatabaseUtils.addConsumablePages(userId, event.product_id, product.page_limit, env, logger);
    } else {
        // Handle regular subscriptions
    }
}
```

### Consumable Logic
- **Existing Subscription**: Adds pages to current subscription
- **No Subscription**: Creates new subscription with expiration
- **Product Validation**: Ensures product exists and is of correct type
- **Error Handling**: Graceful failure with detailed logging

## Usage Examples

### Transfer Event
```json
{
  "api_version": "1.0",
  "event": {
    "type": "TRANSFER",
    "transferred_from": ["user-1-id"],
    "transferred_to": ["user-2-id"],
    "id": "transfer-event-id"
  }
}
```

### Consumable Purchase Event
```json
{
  "api_version": "1.0",
  "event": {
    "type": "NON_RENEWING_PURCHASE",
    "product_id": "fax_pro_consumable_10",
    "app_user_id": "user-id",
    "price": 5.67,
    "currency": "TRY"
  }
}
```

## Testing

The implementation includes comprehensive test coverage:

- Transfer functionality tests
- User validation tests
- Error handling tests
- Edge case scenarios

Run tests with:
```bash
npm test
```

## Monitoring

### Audit Trail Queries
```sql
-- View all transfers
SELECT * FROM user_transfers ORDER BY created_at DESC;

-- View failed transfers
SELECT * FROM user_transfers WHERE status = 'failed';

-- View transfers for specific user
SELECT * FROM user_transfers WHERE from_user_id = 'user-id' OR to_user_id = 'user-id';
```

### Logging
All transfer operations are logged with detailed information:
- Transfer initiation and completion
- User validation results
- Database operation results
- Error conditions and resolutions

## Security

- Row Level Security (RLS) enabled on all tables
- Service role access for administrative operations
- User data isolation and protection
- Audit trail for compliance

## Future Enhancements

- Support for bulk transfers
- Transfer scheduling capabilities
- Enhanced validation rules
- Performance optimizations for large datasets 
