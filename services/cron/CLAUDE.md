# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## SendFax Pro - Cron Service

This is a Cloudflare Worker service that handles scheduled tasks for the SendFax Pro application.

## Development Commands

### Core Commands
- `npm run dev` - Start local development server with Wrangler
- `npm run start` - Alternative to dev command
- `npm test` - Run tests with Vitest
- `npm run test:watch` - Run tests in watch mode

### Deployment Commands
- `npm run deploy` - Deploy to default environment
- `wrangler deploy --env staging` - Deploy to staging environment
- `wrangler deploy --env production` - Deploy to production environment

### Environment Setup
Required secrets (set via `wrangler secret put`):
- `NOTIFYRE_API_KEY` - API key for Notifyre fax service
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key for database access

## Architecture

### Service Structure
- **Cloudflare Worker**: Runs on Cloudflare's edge network
- **Cron Triggers**: Scheduled tasks using Cloudflare Workers cron syntax
- **HTTP Endpoints**: Manual trigger endpoints for testing and operations
- **Database**: Uses Supabase for data storage with service role authentication

### Key Components
- `src/cron.js` - Main worker entry point with scheduled and fetch handlers
- `src/utils.js` - Utility classes for logging, API calls, and database operations
- `test/cron.spec.js` - Test file for the cron service
- `wrangler.toml` - Cloudflare Worker configuration

### Main Functionality
1. **Fax Status Polling**: Runs every minute to check fax statuses from Notifyre API
2. **Status Mapping**: Maps Notifyre status codes to internal status values
3. **Database Updates**: Updates fax records in Supabase with latest status information
4. **Error Handling**: Comprehensive logging and error handling throughout

### Status Mapping
The service maps Notifyre API status codes to internal status values using `NOTIFYRE_STATUS_MAP`:
- Processing states: `preparing`, `queued`, `processing`, `sending`
- Success states: `delivered` (from `successful`, `sent`, `received`)
- Failure states: `failed`, `busy`, `no-answer`
- Other states: `cancelled`, `retrying`

### HTTP Endpoints
- `GET /health` - Health check endpoint
- `POST /trigger/fax-polling` - Manually trigger fax status polling
- `POST /trigger/cleanup` - Manually trigger cleanup tasks (placeholder)

## Testing

### Test Environment
- Uses Vitest with miniflare environment for Cloudflare Workers
- Test bindings configured in `vitest.config.js`
- Test environment variables include mock API keys and database URLs

### Running Tests
- Tests are located in `test/cron.spec.js`
- Run with `npm test` or `npm run test:watch`
- Uses globals configuration for test functions

## Environment Configuration

### Staging Environment
- Worker name: `sendfax-cron-staging`
- Log level: `DEBUG`
- Cron schedule: Every minute (`* * * * *`)
- Observability enabled

### Production Environment
- Worker name: `sendfax-cron-prod`
- Log level: `INFO`
- Minification enabled
- Observability enabled

## Key Implementation Details

### Logging
- Structured JSON logging with timestamp, level, and environment context
- Log levels: DEBUG, INFO, WARN, ERROR
- All logs include service identification and environment information

### API Integration
- Uses Notifyre API for fax status retrieval
- Implements rate limiting and retry logic
- Handles multiple API response formats for compatibility

### Database Operations
- Uses Supabase client with service role authentication
- Updates fax records by `notifyre_fax_id` field
- Handles missing records gracefully (faxes not sent through the system)

### Error Handling
- Individual task failures don't affect other operations
- Comprehensive error logging with context
- Graceful degradation when external services are unavailable