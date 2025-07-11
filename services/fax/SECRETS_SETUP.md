# Cloudflare Secrets Store Setup

This document explains how to set up the NOTIFYRE_API_KEY in Cloudflare's Secrets Store for the fax service.

## Prerequisites

- Cloudflare account with Workers enabled
- `wrangler` CLI installed and authenticated
- NOTIFYRE_API_KEY value

## Setup Instructions

### 1. Create Secrets Stores

Create the secrets stores for each environment:

```bash
# Development environment
wrangler secret-store:create fax-service-secrets

# Staging environment  
wrangler secret-store:create fax-service-secrets-staging

# Production environment
wrangler secret-store:create fax-service-secrets-prod
```

### 2. Add the NOTIFYRE_API_KEY Secret

Add the API key to each secrets store:

```bash
# Development environment
wrangler secret-store:secret:put NOTIFYRE_API_KEY --store-name=fax-service-secrets
# You'll be prompted to enter the API key value

# Staging environment
wrangler secret-store:secret:put NOTIFYRE_API_KEY --store-name=fax-service-secrets-staging
# You'll be prompted to enter the API key value

# Production environment  
wrangler secret-store:secret:put NOTIFYRE_API_KEY --store-name=fax-service-secrets-prod
# You'll be prompted to enter the API key value
```

### 3. Verify Secrets

You can verify the secrets are stored correctly:

```bash
# List secrets in each store
wrangler secret-store:secret:list --store-name=fax-service-secrets
wrangler secret-store:secret:list --store-name=fax-service-secrets-staging  
wrangler secret-store:secret:list --store-name=fax-service-secrets-prod
```

### 4. Deploy the Worker

Deploy the worker to activate the secrets store bindings:

```bash
# Deploy to development
wrangler deploy

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env prod
```

## Code Changes

The fax service code has been updated to:

1. **Fallback Support**: If the secrets store is not available, it falls back to environment variables
2. **Error Handling**: Proper error handling for secrets store access
3. **Logging**: Debug logging for secrets store operations

## Environment Variable Fallback

For backward compatibility, the service will fall back to the `NOTIFYRE_API_KEY` environment variable if:
- The secrets store binding is not available
- The secret is not found in the secrets store
- There's an error accessing the secrets store

## Security Benefits

Using Cloudflare Secrets Store provides:
- **Encryption**: Secrets are encrypted at rest and in transit
- **Access Control**: Fine-grained access control for secrets
- **Audit Logging**: Access to secrets is logged
- **Separation**: Secrets are separated from code and configuration

## Troubleshooting

### Secret Not Found
If you get "NOTIFYRE_API_KEY not found in secrets store" errors:
1. Verify the secret exists: `wrangler secret-store:secret:list --store-name=<store-name>`
2. Check the store name in `wrangler.toml` matches the created store
3. Ensure the worker has been deployed after adding the secret

### Binding Not Available
If you get "SECRETS binding not available" errors:
1. Check that `[[secret_stores]]` binding is correctly configured in `wrangler.toml`
2. Ensure the store exists: `wrangler secret-store:list`
3. Deploy the worker: `wrangler deploy`

### Permissions Issues
If you get permission errors:
1. Ensure you're authenticated: `wrangler auth whoami`
2. Check you have the correct permissions for the Cloudflare account
3. Verify the account ID in `wrangler.toml` is correct 
