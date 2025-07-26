# Usage Tracking Feature

## Overview

The usage tracking feature allows the system to monitor and record user resource consumption for billing and analytics purposes. This includes tracking fax pages sent, storage usage, and API calls.

## Database Schema

### Usage Table

The `usage` table stores all usage records with the following structure:

```sql
CREATE TABLE usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('fax', 'storage', 'api_call')),
    unit_type TEXT NOT NULL CHECK (unit_type IN ('page', 'byte', 'call')),
    usage_amount NUMERIC(10, 4) NOT NULL CHECK (usage_amount >= 0),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Columns

- `user_id`: Reference to the user who consumed the resource
- `type`: Type of resource consumed (`fax`, `storage`, `api_call`)
- `unit_type`: Unit of measurement (`page`, `byte`, `call`)
- `usage_amount`: Amount of resource consumed
- `timestamp`: When the usage occurred
- `metadata`: Additional context about the usage (JSON)

### Row Level Security (RLS)

- **Users**: Can only read their own usage data
- **Service Role**: Has full read/write access for backend operations

## Implementation

### Database Utilities

The `DatabaseUtils` class provides two main methods for usage tracking:

#### `recordUsage(usageData, env, logger)`

Records a new usage entry.

```javascript
await DatabaseUtils.recordUsage({
    userId: 'user-uuid',
    type: 'fax',
    unitType: 'page',
    usageAmount: 5,
    timestamp: '2024-01-25T10:00:00Z',
    metadata: {
        fax_id: 'fax-uuid',
        provider: 'telnyx',
        event_type: 'fax.delivered'
    }
}, env, logger);
```



### Webhook Integration

Usage is automatically recorded when faxes are successfully delivered through webhook handlers:

#### Telnyx Webhook

When a Telnyx fax is delivered (`status === 'delivered'`), the system records:
- Type: `fax`
- Unit: `page`
- Amount: Page count from webhook or fax record
- Metadata: Fax ID, provider, event type, status

#### Notifyre Webhook

When a Notifyre fax is delivered (`status === 'delivered'`), the system records:
- Type: `fax`
- Unit: `page`
- Amount: Page count from webhook or fax record
- Metadata: Fax ID, provider, event type, status

## Usage Examples

### Recording Fax Usage

```javascript
// Automatically recorded in webhook handlers
await DatabaseUtils.recordUsage({
    userId: faxRecord.user_id,
    type: 'fax',
    unitType: 'page',
    usageAmount: pageCount,
    timestamp: new Date().toISOString(),
    metadata: {
        fax_id: faxId,
        provider: 'telnyx',
        event_type: 'fax.delivered'
    }
}, env, logger);
```

### Recording Storage Usage

```javascript
// For file uploads or storage operations
await DatabaseUtils.recordUsage({
    userId: userId,
    type: 'storage',
    unitType: 'byte',
    usageAmount: fileSize,
    timestamp: new Date().toISOString(),
    metadata: {
        file_id: fileId,
        operation: 'upload'
    }
}, env, logger);
```

### Recording API Usage

```javascript
// For API call tracking
await DatabaseUtils.recordUsage({
    userId: userId,
    type: 'api_call',
    unitType: 'call',
    usageAmount: 1,
    timestamp: new Date().toISOString(),
    metadata: {
        endpoint: '/api/fax/send',
        method: 'POST'
    }
}, env, logger);
```



## Migration

To deploy the usage tracking feature:

1. Run the migration: `20250125000000_create_usage_table.sql`
2. Deploy the updated fax service with webhook handlers
3. The system will automatically start recording usage for successful fax deliveries

## Testing

Run the usage tracking tests:

```bash
cd services/fax
npm test usage.spec.js
```

## Future Enhancements

- Usage aggregation functions for billing calculations
- Usage limits and quota enforcement
- Usage analytics and reporting endpoints
- Integration with subscription management for usage-based billing 
