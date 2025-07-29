# Credit Checking Implementation

## Overview

This document describes the implementation of credit checking for fax sending in the Send Fax Pro application. The system now validates user credits before allowing fax transmission and tracks usage after successful fax delivery.

## Features

### 1. Pre-Send Credit Validation
- **Credit Check**: Validates user has sufficient credits before sending fax
- **Multi-Subscription Support**: Handles users with both subscriptions and consumables
- **Priority Ordering**: Uses subscriptions first, then consumables
- **Expiration Handling**: Only considers active, non-expired subscriptions

### 2. Usage Tracking
- **Page Deduction**: Deducts pages from user's subscription after successful fax
- **Analytics Recording**: Records usage in the `usage` table for analytics
- **Error Resilience**: Fax operation continues even if usage tracking fails

### 3. Database Integration
- **Direct Supabase Access**: Uses service role for direct database operations
- **Real-time Validation**: Checks credits in real-time before fax transmission
- **Atomic Updates**: Ensures consistent credit deduction

## Implementation Details

### Credit Checking Logic

The credit checking process follows these steps:

1. **User Identification**: Extract user ID from JWT payload
2. **Subscription Query**: Fetch active, non-expired subscriptions
3. **Priority Sorting**: Order by subscription type (subscription first, then consumables)
4. **Credit Calculation**: Sum available pages across all subscriptions
5. **Validation**: Compare required pages with available credits

### Database Schema Usage

#### User Subscriptions Table
```sql
SELECT 
    us.id,
    us.product_id,
    us.page_limit,
    us.pages_used,
    (us.page_limit - us.pages_used) as available_pages,
    us.expires_at,
    us.is_active,
    p.type,
    p.display_name
FROM user_subscriptions us
JOIN products p ON us.product_id = p.product_id
WHERE us.user_id = ?
    AND us.is_active = true
    AND us.expires_at > NOW()
ORDER BY p.type ASC, us.created_at DESC;
```

#### Usage Tracking Table
```sql
INSERT INTO usage (
    user_id,
    type,
    unit_type,
    usage_amount,
    metadata
) VALUES (
    ?,
    'fax',
    'page',
    ?,
    '{"subscription_id": ?, "action": "fax_sent"}'
);
```

### API Response Codes

#### Success (200)
```json
{
    "statusCode": 200,
    "message": "Fax submitted successfully",
    "data": {
        "id": "fax-id",
        "friendlyId": "friendly-id",
        "status": "queued",
        "message": "Fax is now queued for processing",
        "timestamp": "2025-07-29T20:00:00.000Z",
        "recipient": "+1234567890",
        "pages": 1,
        "apiProvider": "notifyre"
    }
}
```

#### Insufficient Credits (402)
```json
{
    "statusCode": 402,
    "error": "Insufficient credits",
    "message": "You don't have enough credits to send this fax",
    "data": {
        "pagesRequired": 5,
        "availablePages": 3,
        "subscriptionId": "sub-123"
    },
    "timestamp": "2025-07-29T20:00:00.000Z"
}
```

## Code Implementation

### FaxDatabaseUtils Class

The `FaxDatabaseUtils` class provides three main methods:

#### 1. checkUserCredits(userId, pagesRequired, env, logger)
- Validates user has sufficient credits
- Returns credit check result with available pages and subscription ID
- Handles multiple subscription types and priorities

#### 2. updatePageUsage(userId, pagesUsed, subscriptionId, env, logger)
- Updates subscription's `pages_used` field
- Records usage in analytics table
- Handles errors gracefully without failing fax operation

#### 3. getUserFaxUsage(userId, env, logger)
- Retrieves user's fax usage statistics
- Counts successful (non-failed) faxes
- Calculates total pages used

### Integration in Fax Service

The credit checking is integrated into the `sendFax` method:

```javascript
// 1. Extract user ID
const userId = sagContextObj.jwtPayload?.sub || sagContextObj.jwtPayload?.user_id || sagContextObj.user?.id || null;

// 2. Check credits before sending
const pagesRequired = faxRequest.pages || 1;
const creditCheck = await FaxDatabaseUtils.checkUserCredits(userId, pagesRequired, this.env, this.logger);

if (!creditCheck.hasCredits) {
    return {
        statusCode: 402,
        error: "Insufficient credits",
        message: creditCheck.error || "You don't have enough credits to send this fax",
        data: {
            pagesRequired: pagesRequired,
            availablePages: creditCheck.availablePages,
            subscriptionId: creditCheck.subscriptionId
        }
    };
}

// 3. Send fax
const faxResult = await faxProvider.sendFax(providerPayload);

// 4. Update usage after successful fax
if (creditCheck.subscriptionId) {
    await FaxDatabaseUtils.updatePageUsage(userId, pagesRequired, creditCheck.subscriptionId, this.env, this.logger);
}
```

## Usage Examples

### User with Subscription
- **Subscription**: 250 pages/month
- **Used**: 100 pages
- **Available**: 150 pages
- **Fax Request**: 5 pages
- **Result**: ✅ Approved (145 pages remaining)

### User with Consumable
- **Consumable**: 10 pages
- **Used**: 0 pages
- **Available**: 10 pages
- **Fax Request**: 15 pages
- **Result**: ❌ Denied (insufficient credits)

### User with Both
- **Subscription**: 250 pages/month (100 used)
- **Consumable**: 10 pages (0 used)
- **Total Available**: 160 pages
- **Fax Request**: 20 pages
- **Result**: ✅ Approved (140 pages remaining)

## Error Handling

### Database Errors
- Credit check failures return 402 status
- Usage tracking failures don't affect fax operation
- All errors are logged for debugging

### Missing Configuration
- Supabase configuration errors are handled gracefully
- Service continues to function with proper error responses

### Edge Cases
- Users without subscriptions get clear error messages
- Expired subscriptions are automatically excluded
- Zero or negative page requests are handled

## Monitoring and Analytics

### Usage Tracking
- All fax usage is recorded in the `usage` table
- Metadata includes subscription ID and action type
- Enables detailed analytics and reporting

### Logging
- Credit check results are logged at INFO level
- Usage updates are logged with success/failure status
- Error conditions are logged at ERROR level

### Metrics Available
- Total pages used per user
- Subscription utilization rates
- Failed credit check attempts
- Usage patterns over time

## Security Considerations

### Access Control
- Service role access for database operations
- User ID validation from JWT payload
- Row-level security maintained

### Data Integrity
- Atomic credit deduction operations
- Consistent state between subscriptions and usage
- Audit trail for all credit operations

## Future Enhancements

### Planned Features
- **Credit Pooling**: Allow users to combine multiple subscriptions
- **Usage Alerts**: Notify users when credits are low
- **Auto-Renewal**: Automatic subscription renewal
- **Usage Analytics**: Detailed usage reports and insights

### Performance Optimizations
- **Caching**: Cache user credit information
- **Batch Updates**: Optimize usage tracking for high-volume users
- **Connection Pooling**: Improve database connection efficiency 
