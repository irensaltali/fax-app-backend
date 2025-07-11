# SendFax Pro - Cron Service

A dedicated Cloudflare Worker service for handling scheduled tasks related to fax processing.

## Overview

This service handles:
- **Fax Status Polling**: Every 10 minutes, checks and updates fax statuses from Notifyre API
- **Daily Cleanup**: Removes old completed faxes (90+ days old) at 2 AM daily
- **Weekly Maintenance**: Logs statistics and performs maintenance tasks every Sunday

## Architecture

The cron service is completely separate from the main fax service, providing:
- **Dedicated scheduling**: Uses Cloudflare Workers cron triggers
- **Independent scaling**: Can be scaled and monitored separately
- **Isolated failures**: Problems in cron jobs don't affect fax sending
- **Manual triggers**: Endpoints for manual execution of tasks

## Scheduled Tasks

### 1. Fax Status Polling (`*/10 * * * *`)
- Runs every 10 minutes
- Checks faxes in non-final states (`queued`, `sending`, `processing`, `retrying`)
- Updates statuses from Notifyre API
- Only processes faxes that haven't been updated in the last hour

### 2. Daily Cleanup (`0 2 * * *`)
- Runs daily at 2 AM
- Removes fax records older than 90 days that are in final states
- Helps maintain database performance

### 3. Weekly Maintenance (`0 0 * * 0`)
- Runs every Sunday at midnight
- Logs weekly statistics
- Performs health checks and monitoring

## Manual Triggers

The service also supports manual triggers via HTTP endpoints:

- `GET /health` - Health check
- `POST /trigger/fax-polling` - Manually trigger fax status polling
- `POST /trigger/cleanup` - Manually trigger cleanup tasks

## Configuration

### Environment Variables

Set via `wrangler secret put`:

```bash
# Required secrets
wrangler secret put NOTIFYRE_API_KEY --env staging
wrangler secret put SUPABASE_URL --env staging
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
```

### Wrangler Configuration

The service is configured with:
- **Multiple cron triggers** for different schedules
- **Node.js compatibility** for Supabase client
- **Environment-specific names** for staging/production

## Deployment

### Install Dependencies

```bash
cd fax-app-backend/services/cron
npm install
```

### Deploy to Staging

```bash
wrangler deploy --env staging
```

### Deploy to Production

```bash
wrangler deploy --env production
```

## Development

### Local Development

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Manual Testing

Test individual functions:

```bash
# Test fax polling
curl https://sendfax-cron-staging.your-workers.dev/trigger/fax-polling

# Test cleanup
curl https://sendfax-cron-staging.your-workers.dev/trigger/cleanup

# Health check
curl https://sendfax-cron-staging.your-workers.dev/health
```

## Monitoring

The service logs detailed information about:
- Task execution times
- Success/failure rates
- Database operations
- API calls to Notifyre

All logs include:
- Timestamp
- Service identification (`cron`)
- Environment information
- Structured data for monitoring

## Security

- Uses service role key for database access
- API keys stored as Cloudflare Workers secrets
- No user authentication required (internal service)
- Rate limiting implemented for API calls

## Error Handling

The service includes comprehensive error handling:
- Individual task failures don't affect other tasks
- Retries with exponential backoff for API calls
- Detailed error logging for debugging
- Graceful degradation when external services are unavailable

## Performance

- Processes faxes in batches to avoid memory issues
- Rate limiting to respect API quotas
- Efficient database queries with proper indexing
- Small delays between API calls to avoid throttling

## Future Enhancements

Potential additions:
- Email notifications for failed faxes
- Advanced retry logic for failed API calls
- Custom scheduling for different environments
- Integration with monitoring services
- Performance metrics collection 
