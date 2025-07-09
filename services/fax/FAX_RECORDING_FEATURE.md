# Fax Recording Feature

This document describes the new fax recording feature that automatically saves all fax transmission details to Supabase with proper user authentication and Row Level Security (RLS).

## Overview

Every fax sent through the system is now automatically saved to a Supabase database table with the following benefits:

- **User-specific access**: Authenticated users can only see their own fax records
- **Anonymous support**: Anonymous users can send faxes, but cannot retrieve their history
- **Comprehensive tracking**: All fax details are saved except the actual document content
- **Real-time updates**: Fax status is automatically updated via webhooks
- **Secure access**: RLS policies ensure data security
- **Read-only for users**: Users can only read and create records, not modify or delete them

## Database Schema

### Faxes Table

The `faxes` table stores all fax transmission records with the following structure:

```sql
-- Table: faxes
id                 UUID (Primary Key)
user_id           UUID (Foreign Key to auth.users, nullable for anonymous users)
notifyre_fax_id   TEXT (Unique - Notifyre API ID)
status            ENUM (queued, processing, sending, delivered, receiving, no-answer, busy, failed, cancelled)
original_status   TEXT (Original status from Notifyre)
recipients        JSONB (Array of recipient fax numbers)
sender_id         TEXT (Optional sender phone number)
subject           TEXT (Fax subject/message)
pages             INTEGER (Number of pages)
cost              DECIMAL (Cost in USD)
client_reference  TEXT (Client reference identifier)
sent_at           TIMESTAMPTZ (When fax was sent)
completed_at      TIMESTAMPTZ (When fax was completed/failed)
error_message     TEXT (Error details if failed)
metadata          JSONB (Additional Notifyre response data)
created_at        TIMESTAMPTZ (Record creation time)
updated_at        TIMESTAMPTZ (Record last update time)
```

### Fax Status Codes

The system uses the following standardized status codes:

| Status | Description |
|--------|-------------|
| `queued` | The fax is queued, waiting for processing |
| `processing` | The fax is currently being processed |
| `sending` | The fax is now sending |
| `delivered` | The fax has been successfully delivered |
| `receiving` | The fax is in the process of being received |
| `no-answer` | The outbound fax failed due to the other end not picking up |
| `busy` | The outbound fax failed because the other side sent back a busy signal |
| `failed` | The fax failed to send or receive |
| `cancelled` | The fax was cancelled |

### Security (RLS Policies)

1. **Authenticated users can view own faxes**
   - `FOR SELECT` - Authenticated users can only see faxes where `user_id` matches their user ID

2. **Authenticated users can insert own faxes**
   - `FOR INSERT` - Authenticated users can only create fax records linked to their user ID

3. **Anonymous users can insert faxes**
   - `FOR INSERT` - Anonymous users can create fax records with `user_id = NULL`
   - Anonymous users cannot retrieve their fax history later

4. **Service can update fax status**
   - `FOR UPDATE` - Allows webhook updates to fax status and details

5. **No delete access**
   - Neither authenticated nor anonymous users can delete fax records for audit trail purposes

## API Endpoints

### New Endpoint: List User Faxes

**`GET /fax/user-faxes`** (Authenticated/Anonymous)

Retrieves fax records for the authenticated user from the database. Anonymous users receive an empty response as they cannot access fax history.

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Number of records to skip (default: 0)
- `status` (optional): Filter by fax status
- `fromDate` (optional): Filter faxes from this date
- `toDate` (optional): Filter faxes to this date

**Response:**
```json
{
  "statusCode": 200,
  "message": "User fax records retrieved successfully",
  "data": {
    "faxes": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "notifyre_fax_id": "notifyre_id",
        "status": "delivered", 
        "original_status": "Delivered",
        "recipients": ["+1234567890"],
        "sender_id": "+0987654321",
        "subject": "Important Document",
        "pages": 3,
        "cost": 1.50,
        "client_reference": "SendFaxPro",
        "sent_at": "2025-01-05T12:00:00Z",
        "completed_at": "2025-01-05T12:02:00Z",
        "error_message": null,
        "metadata": {...},
        "created_at": "2025-01-05T12:00:00Z",
        "updated_at": "2025-01-05T12:02:00Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

**Anonymous User Response:**
```json
{
  "statusCode": 200,
  "message": "No fax records available for anonymous users",
  "data": {
    "faxes": [],
    "total": 0,
    "limit": 50,
    "offset": 0,
    "note": "Anonymous users cannot retrieve fax history. Please sign in to view your fax records."
  }
}
```

### Enhanced Endpoint: Send Fax

**`POST /fax/send`** (Authenticated/Anonymous)

The existing send fax endpoint now automatically saves fax records to the database for both authenticated and anonymous users.

**What happens:**
1. Fax is submitted to Notifyre API
2. Upon successful submission, a record is created in the `faxes` table
3. **For authenticated users**: The record is linked to the user via JWT token
4. **For anonymous users**: The record is created with `user_id = NULL`
5. Fax details (except document content) are stored for tracking

## Automatic Status Updates

### Webhook Integration

The system automatically updates fax status when receiving webhooks from Notifyre:

1. **Webhook received** from Notifyre with status update
2. **Fax record updated** in database with new status, completion time, error messages, etc.
3. **Audit trail maintained** with webhook events stored separately

**Supported webhook events:**
- `fax.sent` - Fax has been sent
- `fax.delivered` - Fax successfully delivered
- `fax.failed` - Fax transmission failed

## Implementation Details

### User Authentication

User identification is extracted from JWT tokens in the following priority:
1. `context.jwtPayload.sub`
2. `context.jwtPayload.user_id`
3. `context.user.id`

**Anonymous User Handling:**
- If no user ID is found, the user is treated as anonymous
- Anonymous faxes are saved with `user_id = NULL`
- Anonymous users can send faxes but cannot retrieve their history
- All fax operations work the same for anonymous users except data retrieval

### Error Handling

- Database save failures do not prevent fax transmission
- Errors are logged but the fax operation continues
- Users receive successful fax response even if database save fails
- Status updates via webhooks are attempted but failures are logged

### Data Privacy

- **No document content** is stored in the database
- Only metadata and transmission details are saved
- Recipient numbers are stored but can be masked in logs
- User data is isolated through RLS policies

## Environment Variables

The following environment variables are required:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
NOTIFYRE_API_KEY=your_notifyre_api_key
NOTIFYRE_WEBHOOK_SECRET=your_webhook_secret (optional)
```

## Migration

To enable this feature, run the migration:

```bash
# Apply the database migration
supabase migration up
```

The migration file: `20250105120000_create_faxes_table.sql`

## TypeScript Types

Updated Supabase types are available in `fax-app/types/supabase.ts` with the new `faxes` table definition.

## Benefits

1. **Complete audit trail** - Every fax transmission is recorded (authenticated and anonymous)
2. **User dashboard** - Authenticated users can view their fax history
3. **Anonymous support** - Anonymous users can send faxes without requiring accounts
4. **Status tracking** - Real-time status updates from webhooks
5. **Cost tracking** - Monitor fax costs per user and overall usage
6. **Compliance** - Maintain records for regulatory requirements
7. **Analytics** - Analyze usage patterns and success rates across all users

## Future Enhancements

- User dashboard in the frontend app
- Cost reporting and analytics
- Fax retry functionality
- Advanced filtering and search
- Export capabilities
- Integration with contact management 
