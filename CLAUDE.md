# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the backend for "Send Fax Pro" - a comprehensive fax application built on Cloudflare Workers with a microservices architecture. The system includes a serverless API gateway, fax service, and cron service, all deployed on Cloudflare's edge network.

## Architecture

### High-Level Structure
```
fax-app-backend/
├── serverlessapigateway/    # Main API Gateway (Cloudflare Worker)
├── services/
│   ├── fax/                 # Fax service with multi-provider support
│   └── cron/                # Scheduled tasks service
├── scripts/                 # Deployment scripts
└── *.json                   # Environment-specific configurations
```

### Key Components

#### 1. Serverless API Gateway (`serverlessapigateway/`)
- **Purpose**: Central routing and authentication layer
- **Features**: JWT auth, CORS, service bindings, Auth0/Supabase integration
- **Pattern**: Configuration-driven routing with JSON configs
- **Integration Types**: HTTP proxy, service bindings, static responses

#### 2. Fax Service (`services/fax/`)
- **Purpose**: Multi-provider fax transmission service
- **Providers**: Notifyre (default), Telnyx (with R2 storage)
- **Pattern**: Factory pattern for provider abstraction
- **Features**: File handling, status tracking, database recording

#### 3. Cron Service (`services/cron/`)
- **Purpose**: Scheduled tasks (fax status polling)
- **Features**: Notifyre API polling, database updates, status mapping
- **Schedule**: Runs every minute via Cloudflare Workers cron

## Development Commands

### Testing
```bash
# Run all service tests (from root)
./scripts/deploy.sh api --skip-tests  # Skip tests
npm test                              # Run tests in individual services

# Individual service testing
cd services/fax && npm test
cd services/cron && npm test
```

### Development
```bash
# Start development servers
cd serverlessapigateway && npm run dev
cd services/fax && npm run dev
cd services/cron && npm run dev
```

### Deployment
```bash
# Deploy everything with tests
./scripts/deploy.sh api all

# Deploy to specific environments
./scripts/deploy.sh api all --env staging
./scripts/deploy.sh api all --env prod

# Deploy only services
./scripts/deploy.sh api all --services-only
```

## Environment Configuration

### Configuration Files
- `wrangler.api.toml` - Main API Gateway configuration
- `api-config.json` - API Gateway routes and integrations
- `api-config.staging.json` - Staging environment routes
- `api-config.prod.json` - Production environment routes

### Required Environment Variables
```bash
# Database
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET

# Fax Providers
NOTIFYRE_API_KEY
TELNYX_API_KEY
TELNYX_CONNECTION_ID

# File Storage (Telnyx)
R2_PUBLIC_DOMAIN
FAX_FILES_BUCKET  # R2 bucket binding

# Provider Selection
FAX_PROVIDER=notifyre  # or telnyx
```

## Key Architectural Patterns

### 1. Service Bindings
- API Gateway routes requests to microservices via Cloudflare service bindings
- Each service implements `WorkerEntrypoint` pattern
- Services can be called directly: `env.FAX_SERVICE.sendFax(request, env, context)`

### 2. Configuration-Driven Routing
- API Gateway uses JSON configuration files for route definitions
- Supports multiple integration types: HTTP proxy, service bindings, static responses
- Environment-specific configurations for staging/production

### 3. Multi-Provider Architecture
- Fax service uses factory pattern for provider abstraction
- Base provider class with standardized interface
- Easy to add new providers (Twilio, ClickSend, etc.)

### 4. Database Integration
- Supabase for database with Row Level Security
- JWT token validation for user authentication
- Audit trail for all fax operations

## Authentication Flow

### JWT Authentication
1. User authenticates via frontend (Supabase Auth)
2. JWT token included in `Authorization: Bearer <token>` header
3. API Gateway validates token using `SUPABASE_JWT_SECRET`
4. Validated payload passed to services in `sagContext`

### Anonymous Support
- Fax service supports anonymous usage
- Database records include user_id when authenticated
- Maintains audit trail for all transmissions

## File Handling

### Supported Formats
- Documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
- Images: JPG, PNG, GIF, BMP, TIFF
- Text: TXT, RTF, HTML, PS
- Maximum size: 100MB

### Storage Strategy
- **Notifyre**: Files sent directly via API (base64)
- **Telnyx**: Files uploaded to R2 storage, public URLs sent to API
- **R2 Integration**: Presigned URLs for secure file uploads

## Database Schema

### Core Tables
- `faxes` - Main fax records with RLS policies
- `fax_webhook_events` - Webhook event tracking
- `support_tickets` - Support ticket system

### Status Mapping
- Internal statuses: `preparing`, `sent`, `failed`, `cancelled`
- Provider-specific statuses mapped to internal values
- Real-time updates via webhook handlers

## Development Workflow

### Adding New Fax Provider
1. Create provider class extending `BaseFaxProvider`
2. Implement required methods: `sendFax`, `buildPayload`
3. Add to `provider-factory.js` and environment handling
4. Add required environment variables
5. Update documentation

### Testing Strategy
- Vitest with Cloudflare Workers testing pool
- Unit tests for each service
- Integration tests for API endpoints
- Mock external API calls in tests

## Security Considerations

### API Keys and Secrets
- Stored in Cloudflare Secrets Store
- Accessed via environment variables
- Never logged or exposed in responses

### Database Security
- Row Level Security policies in Supabase
- JWT token validation for all authenticated endpoints
- Service role key for backend operations

### File Security
- Base64 encoding for file transmission
- Public R2 URLs (consider signed URLs for sensitive docs)
- File type validation and size limits

## Performance Optimizations

### Cold Start Optimization
- ES modules for faster imports
- Minimal dependencies in hot paths
- Efficient database queries

### Caching Strategy
- R2 files cached at edge locations
- API Gateway configuration cached
- Database connection pooling

## Monitoring and Observability

### Logging
- Structured JSON logging with levels (DEBUG, INFO, WARN, ERROR)
- Request tracing with correlation IDs
- Error context preservation

### Metrics
- Cloudflare Workers analytics
- Database query metrics
- Provider API response times

## Common Issues and Solutions

### R2 Configuration
- Ensure bucket bindings are set in wrangler.toml
- Verify R2_PUBLIC_DOMAIN matches actual bucket domain
- Check CORS settings for public access

### Provider Errors
- Verify API keys are correctly set
- Check provider-specific configuration (connection IDs, etc.)
- Review provider API documentation for rate limits

### Database Connectivity
- Verify Supabase credentials and URL
- Check RLS policies for access issues
- Ensure service role key has necessary permissions

## Related Documentation

- `API_DOCUMENTATION.md` - Complete API reference
- `DEPLOYMENT.md` - Detailed deployment guide
- `services/fax/CLAUDE.md` - Fax service specifics
- `services/cron/CLAUDE.md` - Cron service specifics
- `services/fax/FAX_RECORDING_FEATURE.md` - Database recording
- `services/fax/TELNYX_PROVIDER_SETUP.md` - Telnyx integration
