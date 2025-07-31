# Management Service

Management service for Send Fax Pro application. Provides administrative and management functionality.

## Features

- Health checks (public and protected)
- Debug endpoints
- User management
- System statistics
- Recent activity tracking

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Deploy to Cloudflare Workers
npm run deploy
```

## Environment Variables

- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARN, ERROR)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for admin access

## API Endpoints

- `GET /health` - Public health check
- `GET /health-protected` - Protected health check (requires authentication)
- `GET /debug` - Debug information endpoint

## Service Binding

This service is bound to the main API gateway as `MANAGEMENT_SERVICE` and can be accessed through the gateway endpoints. 
