# Fax Service - Claude Development Guide

## Project Overview

This is a multi-provider fax service built as a Cloudflare Worker service, designed to handle fax transmission through multiple API providers (Notifyre, Telnyx) with a plugin architecture. The service is part of a larger "Send Fax Pro" application ecosystem.

## Architecture

### Project Structure
```
fax-app-backend/services/fax/
├── src/
│   ├── fax.js                    # Main service entry point (WorkerEntrypoint)
│   ├── utils.js                  # Utility classes (Logger, FileUtils, ApiUtils)
│   ├── database.js               # Supabase database operations
│   ├── r2-utils.js               # Cloudflare R2 file storage utilities
│   └── providers/
│       ├── base-provider.js      # Abstract base provider class
│       ├── notifyre-provider.js  # Notifyre API implementation
│       ├── telnyx-provider.js    # Telnyx API implementation
│       ├── provider-factory.js   # Provider factory pattern
│       └── example-provider.js.template # Template for new providers
├── test/                         # Vitest test files
├── scripts/                      # Development utilities
│   └── supabase-login.js         # Supabase authentication helper
├── package.json                  # Dependencies and scripts
├── wrangler.toml                 # Cloudflare Workers configuration
└── vitest.config.js              # Test configuration
```

### Tech Stack

- **Runtime**: Cloudflare Workers (Node.js compatibility mode)
- **Database**: Supabase (PostgreSQL with RLS)
- **File Storage**: Cloudflare R2 (for Telnyx provider)
- **Authentication**: JWT tokens via Supabase Auth
- **Testing**: Vitest with Cloudflare Workers testing pool
- **Deployment**: Wrangler CLI

## Development Commands

### Available Scripts (package.json)
```bash
# Development
npm run dev          # Start development server with wrangler
npm start           # Alias for dev

# Testing
npm test            # Run vitest tests

# Deployment
npm run deploy      # Deploy to Cloudflare Workers
```

### Development Environment Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables** (set in Cloudflare Workers dashboard or wrangler):
   ```bash
   # Provider Selection
   FAX_PROVIDER=notifyre|telnyx
   
   # Notifyre Configuration
   NOTIFYRE_API_KEY=your_api_key
   
   # Telnyx Configuration (if using Telnyx)
   TELNYX_API_KEY=your_api_key
   TELNYX_CONNECTION_ID=your_connection_id
   R2_PUBLIC_DOMAIN=https://files.yourdomain.com
   
   # Database
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   
   # Optional
   LOG_LEVEL=DEBUG|INFO|WARN|ERROR
   ```

3. **Development Server**:
   ```bash
   wrangler dev
   ```

4. **Testing**:
   ```bash
   npm test
   ```

## Key Features

### Multi-Provider Architecture
- **Factory Pattern**: Provider-agnostic service design
- **Current Providers**: Notifyre (default), Telnyx (with R2 integration)
- **Extensible**: Easy to add new providers (Twilio, etc.)

### Authentication & Security
- **JWT Authentication**: Supabase-based user authentication
- **Anonymous Support**: Allows anonymous fax sending
- **Row Level Security**: Database-level access control

### File Handling
- **Multiple Formats**: PDF, images, documents
- **Base64 Processing**: Efficient file encoding/decoding
- **R2 Integration**: Cloud storage for Telnyx provider

### Database Recording
- **Audit Trail**: All fax transmissions recorded
- **Status Tracking**: Real-time status updates via webhooks
- **User History**: Authenticated users can view their fax history

## Service Endpoints

The service implements a WorkerEntrypoint pattern with these main methods:

### Core Methods
- `sendFax(request, caller_env, sagContext)` - Send fax via configured provider
- `health(request, caller_env, sagContext)` - Health check (unauthenticated)
- `healthProtected(request, caller_env, sagContext)` - Health check (authenticated)

### Provider Workflows

#### Standard Workflow (Notifyre)
1. Parse request body
2. Prepare fax request
3. Send via provider API
4. Save to database
5. Return response

#### Custom Workflow (Telnyx)
1. Save initial record to Supabase
2. Upload files to R2 storage
3. Update database with R2 URLs
4. Send fax using public file URLs
5. Update database with provider response

## Development Workflow

### Adding a New Provider

1. **Create Provider Class**:
   ```javascript
   // src/providers/new-provider.js
   import { BaseFaxProvider } from './base-provider.js';
   
   export class NewProvider extends BaseFaxProvider {
     constructor(apiKey, logger) {
       super(apiKey, logger);
       this.baseUrl = 'https://api.newprovider.com';
     }
     
     getProviderName() {
       return 'newprovider';
     }
     
     async buildPayload(faxRequest) {
       // Convert to provider format
     }
     
     async sendFax(payload) {
       // Send fax implementation
     }
   }
   ```

2. **Update Factory**:
   ```javascript
   // src/providers/provider-factory.js
   import { NewProvider } from './new-provider.js';
   
   // Add case in createProvider switch
   case 'newprovider':
     return new NewProvider(apiKey, logger);
   ```

3. **Update Main Service**:
   ```javascript
   // src/fax.js - in createFaxProvider method
   case 'newprovider':
     apiKey = env.NEWPROVIDER_API_KEY;
     break;
   ```

### Testing

The project uses Vitest with Cloudflare Workers testing pool:

```bash
# Run all tests
npm test

# Run specific test file
npx vitest fax.spec.js

# Run tests in watch mode
npx vitest --watch
```

### Database Schema

Key tables:
- `faxes` - Main fax records with RLS policies
- `fax_webhook_events` - Webhook event tracking
- `support_tickets` - Support ticket system

## Configuration Files

### wrangler.toml
- **Environment Management**: dev, staging, prod
- **R2 Bucket Bindings**: File storage configuration
- **Compatibility Settings**: Node.js compatibility mode
- **Observability**: Enabled for monitoring

### vitest.config.js
- **Workers Pool**: Uses Cloudflare Workers testing environment
- **Supabase Dependencies**: Inline dependency configuration

## Related Projects

### Frontend App (`fax-app/`)
- **Platform**: Expo/React Native
- **Features**: PDF rendering, document management, authentication
- **Tech**: TypeScript, Zustand, Supabase client

### API Gateway (`fax-app-backend/serverlessapigateway/`)
- **Purpose**: Serverless API Gateway for routing and auth
- **Features**: JWT authentication, CORS, service bindings

## Documentation Files

- `FAX_RECORDING_FEATURE.md` - Database recording implementation
- `SECRETS_SETUP.md` - Cloudflare Secrets Store configuration
- `TELNYX_PROVIDER_SETUP.md` - Telnyx provider setup guide
- `scripts/README.md` - Development scripts documentation
- `src/providers/README.md` - Provider architecture guide

## Environment Management

### Development
- Use `wrangler dev` for local development
- Environment variables via `.env` or wrangler config

### Staging
- Deploy with `wrangler deploy --env staging`
- Separate R2 buckets and database

### Production
- Deploy with `wrangler deploy --env prod`
- Minification enabled
- Production R2 buckets

## Security Considerations

1. **API Keys**: Stored in Cloudflare Secrets Store
2. **Authentication**: JWT token validation
3. **Database**: Row Level Security policies
4. **File Storage**: Public R2 URLs (consider signed URLs for sensitive docs)
5. **Logging**: Sensitive data sanitization

## Performance Notes

- **Cold Start**: Optimized for Cloudflare Workers runtime
- **File Processing**: Chunked base64 conversion for large files
- **Database**: Efficient queries with proper indexing
- **Caching**: R2 file caching for repeated access

## Common Issues & Solutions

1. **R2 Configuration**: Ensure bucket bindings and public domain are set
2. **Provider Errors**: Check API keys and connection IDs
3. **Database Connectivity**: Verify Supabase credentials
4. **File Upload Failures**: Check file size limits and formats

## Next Steps for Development

1. **Add More Providers**: Twilio, ClickSend, etc.
2. **Implement Signed URLs**: For sensitive document access
3. **Add Retry Logic**: For failed fax transmissions
4. **Implement Caching**: For frequently accessed data
5. **Add Monitoring**: Enhanced logging and metrics
6. **File Cleanup**: Automated R2 file retention policies
