# Telnyx Fax Provider Setup Guide

## Overview

The Telnyx fax provider implements a custom workflow specifically designed for Telnyx's Programmable Fax API. Unlike the standard provider workflow, Telnyx follows this sequence:

1. **Save to Supabase** - Create initial fax record
2. **Upload to R2** - Store files in Cloudflare R2 and get public URLs
3. **Update Supabase** - Save R2 URLs to database
4. **Send to Telnyx** - Submit fax using R2 public URLs
5. **Update Supabase** - Save Telnyx response

## Prerequisites

### 1. Telnyx Account Setup
- Create a Telnyx account at [telnyx.com](https://telnyx.com)
- Obtain a phone number for fax sending
- Create a Programmable Fax Application
- Generate a Telnyx API v2 key

### 2. Cloudflare R2 Setup
- Create R2 buckets for file storage
- Configure public access domain for file URLs
- Set up bucket bindings in Cloudflare Workers

### 3. Supabase Database
- Ensure Supabase is configured with proper tables
- Database schema should support Telnyx-specific fields

## Environment Variables

Add these environment variables to your Cloudflare Workers environment:

```bash
# Provider Selection
FAX_PROVIDER=telnyx

# Telnyx Configuration
TELNYX_API_KEY=your_telnyx_api_key_here
TELNYX_CONNECTION_ID=your_telnyx_connection_id_here

# R2 Configuration (required for Telnyx)
R2_PUBLIC_DOMAIN=https://files.yourdomain.com
# FAX_FILES_BUCKET is configured in wrangler.toml

# Supabase Configuration (existing)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Wrangler Configuration

The `wrangler.toml` file has been updated to include R2 bucket bindings:

```toml
# R2 bucket binding for file storage
[[r2_buckets]]
binding = "FAX_FILES_BUCKET"
bucket_name = "fax-files"
preview_bucket_name = "fax-files-preview"
```

## Cloudflare R2 Bucket Setup

### 1. Create R2 Buckets
```bash
# Create buckets via Cloudflare dashboard or wrangler
wrangler r2 bucket create fax-files
wrangler r2 bucket create fax-files-staging
wrangler r2 bucket create fax-files-prod
```

### 2. Configure Public Access
Set up a custom domain for public file access:
- Go to Cloudflare R2 dashboard
- Configure public access domain (e.g., `files.yourdomain.com`)
- Update `R2_PUBLIC_DOMAIN` environment variable

### 3. CORS Configuration (if needed)
If accessing files from browser, configure CORS:
```json
{
  "cors": [
    {
      "origin": ["*"],
      "method": ["GET"],
      "responseHeader": ["*"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

## Telnyx API Configuration

### 1. Get Connection ID
- Log into Telnyx Mission Control
- Go to Programmable Fax Applications
- Copy your Application ID (this is your `connection_id`)

### 2. API Key Permissions
Ensure your API key has permissions for:
- Programmable Fax (send)
- Fax status checking

## Database Schema Updates

The Supabase `faxes` table should include these Telnyx-specific columns:

```sql
ALTER TABLE faxes ADD COLUMN IF NOT EXISTS telnyx_fax_id VARCHAR;
ALTER TABLE faxes ADD COLUMN IF NOT EXISTS r2_urls JSONB;
ALTER TABLE faxes ADD COLUMN IF NOT EXISTS telnyx_response JSONB;
ALTER TABLE faxes ADD COLUMN IF NOT EXISTS provider VARCHAR DEFAULT 'notifyre';
```

## Usage Examples

### 1. Basic Fax Sending
```bash
curl -X POST https://api.sendfax.pro/v1/fax/send \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["+1234567890"],
    "senderId": "+1987654321",
    "message": "Test fax via Telnyx",
    "files": [
      {
        "data": "base64_encoded_pdf_data",
        "filename": "document.pdf",
        "mimeType": "application/pdf"
      }
    ]
  }'
```

### 2. Multiple Recipients
Note: Telnyx sends to one recipient per request. The service will automatically handle multiple recipients by creating separate fax requests.

```bash
curl -X POST https://api.sendfax.pro/v1/fax/send \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["+1234567890", "+1555666777"],
    "senderId": "+1987654321",
    "files": [{"data": "...", "filename": "doc.pdf"}]
  }'
```

## File Upload Process

### 1. Supported File Types
- PDF (recommended)
- Other formats supported by Telnyx

### 2. File Storage Structure
Files are stored in R2 with this structure:
```
/fax/{fax_id}/document_{index}_{timestamp}.pdf
```

### 3. Public URL Generation
Public URLs follow this format:
```
https://files.yourdomain.com/fax/{fax_id}/document_1_1234567890.pdf
```

## Monitoring and Debugging

### 1. Log Levels
Set `LOG_LEVEL=DEBUG` to see detailed workflow logs:
- File upload progress
- R2 URL generation
- Telnyx API requests/responses
- Database operations

### 2. Status Mapping
Telnyx statuses are mapped to standard statuses:
- `queued` → `pending`
- `sending` → `sending`
- `delivered` → `completed`
- `failed` → `failed`
- `canceled` → `failed`

### 3. Error Handling
Common error scenarios:
- R2 upload failures
- Telnyx API errors
- Database save issues
- Invalid file formats

## Switching Between Providers

To switch back to Notifyre or other providers:
```bash
# Set environment variable
FAX_PROVIDER=notifyre
# or
FAX_PROVIDER=telnyx
```

## Performance Considerations

### 1. File Upload Performance
- Large files may take longer to upload to R2
- Consider file size limits
- Implement timeout handling

### 2. Database Operations
- Multiple database operations per fax
- Consider database connection pooling
- Monitor for database timeouts

### 3. R2 Storage Costs
- Monitor storage usage
- Implement file cleanup policies
- Consider file retention policies

## Security Considerations

### 1. Public File Access
- Files are publicly accessible via R2 URLs
- Consider implementing signed URLs for sensitive documents
- Monitor file access patterns

### 2. API Key Management
- Store API keys securely
- Rotate keys regularly
- Use different keys for different environments

### 3. File Cleanup
Consider implementing automated file cleanup:
```javascript
// Example cleanup after 30 days
const cleanupOldFiles = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  // Implementation depends on your cleanup strategy
};
```

## Troubleshooting

### Common Issues

1. **"R2 bucket not configured"**
   - Check wrangler.toml R2 bindings
   - Verify bucket exists in Cloudflare

2. **"R2 public domain not configured"**
   - Set `R2_PUBLIC_DOMAIN` environment variable
   - Verify domain is properly configured in Cloudflare

3. **"Telnyx connection_id is required"**
   - Set `TELNYX_CONNECTION_ID` environment variable
   - Verify connection ID from Telnyx dashboard

4. **File upload failures**
   - Check file format and size
   - Verify R2 bucket permissions
   - Check for CORS issues

### Debug Commands

```bash
# Test R2 connection
wrangler r2 object list fax-files

# Check environment variables
wrangler secret list

# View logs
wrangler tail --format=pretty
```

## Migration Guide

### From Notifyre to Telnyx

1. Set up Telnyx account and get credentials
2. Configure R2 buckets and domain
3. Update environment variables
4. Test with a small fax first
5. Monitor logs for any issues
6. Update documentation and team

### From Telnyx to Notifyre

1. Change `FAX_PROVIDER=notifyre`
2. Ensure Notifyre credentials are set
3. R2 configuration can remain (unused)
4. Test functionality

## Support

For issues specific to:
- **Telnyx API**: Check [Telnyx Documentation](https://developers.telnyx.com/docs/programmable-fax)
- **Cloudflare R2**: Check [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- **Provider Implementation**: Check logs and error messages

## Limitations

1. **Single File per Fax**: Telnyx accepts one `media_url` per fax. Multiple files require multiple fax requests.
2. **Public File Access**: Files must be publicly accessible via URL (no authentication headers supported).
3. **File Format Support**: Limited to formats supported by Telnyx API.
4. **Regional Restrictions**: Telnyx availability varies by region.