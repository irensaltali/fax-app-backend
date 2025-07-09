# Fax API Documentation

## Overview

This API provides comprehensive fax functionality powered by Notifyre's secure, HIPAA-compliant fax service. The API supports sending faxes, checking status, retrieving sent and received faxes, downloading fax documents, managing fax numbers, and handling webhooks.

## Base URL
- **Staging**: `https://api-staging.sendfax.pro`
- **Production**: `https://api.sendfax.pro`

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Environment Variables Required

- `NOTIFYRE_API_KEY`: Your Notifyre API key
- `NOTIFYRE_WEBHOOK_SECRET`: (Optional) Secret for webhook signature verification
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `SUPABASE_JWT_SECRET`: JWT secret for token verification

## API Endpoints

### 1. Send Fax

**Endpoint**: `POST /v1/fax/send`  
**Authentication**: Required  
**Description**: Send a fax using Notifyre API

#### Request Body (JSON)
```json
{
  "recipient": "1234567890",
  "recipients": ["1234567890", "0987654321"],
  "message": "Optional cover page message",
  "coverPage": "template_id",
  "senderId": "your_sender_id",
  "files": [
    {
      "data": "base64_encoded_file_data",
      "filename": "document.pdf",
      "mimeType": "application/pdf"
    }
  ]
}
```

#### Request Body (Form Data)
```
recipients[]: 1234567890
recipients[]: 0987654321
message: Optional cover page message
coverPage: template_id
senderId: your_sender_id
files[]: <file_upload>
```

#### Response
```json
{
  "statusCode": 200,
  "message": "Fax submitted successfully",
  "data": {
    "id": "fax_123456",
    "status": "preparing",
    "originalStatus": "Preparing",
    "message": "Fax has been queued for sending",
    "timestamp": "2024-01-01T00:00:00Z",
    "recipient": "1234567890",
    "pages": 1,
    "cost": 0.03,
    "notifyreResponse": { /* Original Notifyre response */ }
  }
}
```

#### Supported File Types
- **PDF**: .pdf
- **Word**: .doc, .docx
- **Excel**: .xls, .xlsx
- **Text**: .txt, .rtf
- **PowerPoint**: .ppt, .pptx
- **Images**: .jpg, .jpeg, .png, .gif, .bmp, .tiff
- **Other**: .html, .ps

**Maximum file size**: 100MB  
**Recommended**: A4 standard sizing for best results

---

### 2. Get Fax Status

**Endpoint**: `GET /v1/fax/status?id={fax_id}`  
**Authentication**: Required  
**Description**: Get the current status of a sent fax

#### Query Parameters
- `id` (required): The fax ID to check

#### Response
```json
{
  "statusCode": 200,
  "message": "Status retrieved successfully",
  "data": {
    "id": "fax_123456",
    "status": "sent",
    "originalStatus": "Successful",
    "message": "Fax status retrieved",
    "timestamp": "2024-01-01T00:00:00Z",
    "recipient": "1234567890",
    "pages": 1,
    "cost": 0.03,
    "sentAt": "2024-01-01T00:05:00Z",
    "completedAt": "2024-01-01T00:05:30Z",
    "errorMessage": null,
    "notifyreResponse": { /* Original Notifyre response */ }
  }
}
```

#### Status Values
- `preparing`: Fax is being prepared for sending
- `in_progress`: Fax transmission in progress
- `sent`: Fax has been sent successfully
- `failed`: Fax has failed to send
- `failed_busy`: Failed - recipient was busy
- `failed_no_answer`: Failed - no answer
- `failed_invalid_number`: Failed - invalid number format
- `failed_not_fax_machine`: Failed - not a fax machine
- `cancelled`: Fax was cancelled

---

### 3. List Sent Faxes

**Endpoint**: `GET /v1/fax/sent`  
**Authentication**: Required  
**Description**: Retrieve a list of sent faxes

#### Query Parameters
- `limit` (optional): Number of results to return (default: 50)
- `offset` (optional): Number of results to skip (default: 0)
- `fromDate` (optional): Start date filter (ISO 8601 format)
- `toDate` (optional): End date filter (ISO 8601 format)

#### Response
```json
{
  "statusCode": 200,
  "message": "Sent faxes retrieved successfully",
  "data": {
    "faxes": [
      {
        "id": "fax_123456",
        "status": "sent",
        "originalStatus": "Successful",
        "recipient": "1234567890",
        "pages": 1,
        "cost": 0.03,
        "sentAt": "2024-01-01T00:05:00Z",
        "completedAt": "2024-01-01T00:05:30Z",
        "errorMessage": null
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 4. List Received Faxes

**Endpoint**: `GET /v1/fax/received`  
**Authentication**: Required  
**Description**: Retrieve a list of received faxes

#### Query Parameters
- `limit` (optional): Number of results to return (default: 50)
- `offset` (optional): Number of results to skip (default: 0)
- `fromDate` (optional): Start date filter (ISO 8601 format)
- `toDate` (optional): End date filter (ISO 8601 format)

#### Response
```json
{
  "statusCode": 200,
  "message": "Received faxes retrieved successfully",
  "data": {
    "faxes": [
      {
        "id": "received_fax_123456",
        "sender": "0987654321",
        "pages": 2,
        "receivedAt": "2024-01-01T00:10:00Z",
        "faxNumber": "1234567890",
        "fileUrl": "https://api.notifyre.com/download/..."
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 5. Download Sent Fax

**Endpoint**: `GET /v1/fax/sent/download?id={fax_id}`  
**Authentication**: Required  
**Description**: Download a sent fax document

#### Query Parameters
- `id` (required): The fax ID to download

#### Response
```json
{
  "statusCode": 200,
  "message": "Fax downloaded successfully",
  "data": {
    "id": "fax_123456",
    "fileData": "base64_encoded_pdf_data",
    "filename": "fax_123456.pdf",
    "mimeType": "application/pdf"
  }
}
```

---

### 6. Download Received Fax

**Endpoint**: `GET /v1/fax/received/download?id={fax_id}`  
**Authentication**: Required  
**Description**: Download a received fax document

#### Query Parameters
- `id` (required): The received fax ID to download

#### Response
```json
{
  "statusCode": 200,
  "message": "Received fax downloaded successfully",
  "data": {
    "id": "received_fax_123456",
    "fileData": "base64_encoded_pdf_data",
    "filename": "received_fax_123456.pdf",
    "mimeType": "application/pdf"
  }
}
```

---

### 7. List Fax Numbers

**Endpoint**: `GET /v1/fax/numbers`  
**Authentication**: Required  
**Description**: Get a list of your fax numbers

#### Response
```json
{
  "statusCode": 200,
  "message": "Fax numbers retrieved successfully",
  "data": {
    "faxNumbers": [
      {
        "id": "number_123",
        "number": "1234567890",
        "country": "US",
        "areaCode": "123",
        "isActive": true,
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

### 8. List Cover Pages

**Endpoint**: `GET /v1/fax/coverpages`  
**Authentication**: Required  
**Description**: Get a list of available cover page templates

#### Response
```json
{
  "statusCode": 200,
  "message": "Cover pages retrieved successfully",
  "data": {
    "coverPages": [
      {
        "id": "template_123",
        "name": "Business Template",
        "description": "Professional business cover page",
        "isDefault": true,
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

### 9. Notifyre Webhook Handler

**Endpoint**: `POST /v1/fax/webhook/notifyre`  
**Authentication**: None (webhook secret verification)  
**Description**: Handle incoming webhooks from Notifyre for fax status updates

#### Webhook Events
- `fax.sent`: Fax was successfully sent
- `fax.delivered`: Fax was delivered (alias for fax.sent)
- `fax.failed`: Fax sending failed
- `fax.received`: New fax was received

#### Request Body (from Notifyre)
```json
{
  "event": "fax.sent",
  "data": {
    "id": "fax_123456",
    "status": "Successful",
    "recipients": ["1234567890"],
    "pages": 1,
    "cost": 0.03,
    "completedAt": "2024-01-01T00:05:30Z"
  }
}
```

#### Response
```json
{
  "statusCode": 200,
  "message": "Webhook processed successfully",
  "data": {
    "id": "webhook_1704067200000",
    "status": "processed",
    "message": "Notifyre webhook processed successfully",
    "timestamp": "2024-01-01T00:00:00Z",
    "event": "fax.sent",
    "data": { /* Processed data */ }
  }
}
```

---

### 10. Health Check

**Endpoint**: `GET /v1/fax/health`  
**Authentication**: None  
**Description**: Check service health status

#### Response
```json
{
  "statusCode": 200,
  "message": "Notifyre Fax service healthy",
  "data": {
    "service": "notifyre-fax",
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "2.0.0",
    "features": [
      "send-fax",
      "get-status",
      "list-sent-faxes",
      "list-received-faxes",
      "download-faxes",
      "fax-numbers",
      "cover-pages",
      "webhooks"
    ]
  }
}
```

---

### 11. Protected Health Check

**Endpoint**: `GET /v1/fax/health/protected`  
**Authentication**: Required  
**Description**: Check service health status with authentication

#### Response
```json
{
  "statusCode": 200,
  "message": "Notifyre Fax service healthy (authenticated)",
  "data": {
    "service": "notifyre-fax",
    "user": {
      "sub": "user_id",
      "email": "user@example.com"
    },
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "2.0.0",
    "authenticated": true,
    "features": [
      "send-fax",
      "get-status",
      "list-sent-faxes",
      "list-received-faxes",
      "download-faxes",
      "fax-numbers",
      "cover-pages",
      "webhooks"
    ]
  }
}
```

---

### 12. User Creation Webhook (Supabase)

**Endpoint**: `POST /v1/fax/webhook/user-created`  
**Authentication**: None (webhook secret verification)  
**Description**: Handle user creation events from Supabase

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "statusCode": 400|401|403|404|500,
  "error": "Error type",
  "message": "Human readable error message",
  "details": "Additional error details (in development)"
}
```

### Common Error Codes
- `400`: Bad Request - Invalid request parameters
- `401`: Unauthorized - Missing or invalid authentication
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource not found
- `500`: Internal Server Error - Server-side error

---

## Rate Limiting

The API respects Notifyre's rate limiting policies. If rate limits are exceeded, you'll receive a `429 Too Many Requests` response.

---

## Webhook Security

### Notifyre Webhooks
Notifyre webhooks can be verified using HMAC-SHA256 signatures. Set the `NOTIFYRE_WEBHOOK_SECRET` environment variable to enable verification.

### Supabase Webhooks
Supabase webhooks are verified using the `X-Supabase-Event-Secret` header and the `SUPABASE_WEBHOOK_SECRET` environment variable.

---

## Integration Examples

### JavaScript/Node.js
```javascript
// Send a fax
const response = await fetch('/v1/fax/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recipient: '1234567890',
    message: 'Please find attached document',
    files: [{
      data: base64FileData,
      filename: 'document.pdf',
      mimeType: 'application/pdf'
    }]
  })
});

const result = await response.json();
console.log('Fax ID:', result.data.id);

// Check fax status
const statusResponse = await fetch(`/v1/fax/status?id=${result.data.id}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const status = await statusResponse.json();
console.log('Fax Status:', status.data.status);
```

### cURL
```bash
# Send a fax
curl -X POST "https://api.sendfax.pro/v1/fax/send" \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "1234567890",
    "message": "Please find attached document",
    "files": [{
      "data": "base64_encoded_pdf_data",
      "filename": "document.pdf",
      "mimeType": "application/pdf"
    }]
  }'

# List sent faxes
curl -X GET "https://api.sendfax.pro/v1/fax/sent?limit=10" \
  -H "Authorization: Bearer your-jwt-token"

# Download a fax
curl -X GET "https://api.sendfax.pro/v1/fax/sent/download?id=fax_123456" \
  -H "Authorization: Bearer your-jwt-token"
```

---

## Development Setup

1. Set environment variables:
```bash
export NOTIFYRE_API_KEY="your_notifyre_api_key"
export NOTIFYRE_WEBHOOK_SECRET="your_webhook_secret"
export SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_SUPABASE_SERVICE_ROLE_KEY"
export SUPABASE_JWT_SECRET="your_jwt_secret"
```

2. Deploy the service using Cloudflare Workers
3. Configure webhooks in your Notifyre dashboard to point to `/v1/fax/webhook/notifyre`

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- File uploads support both base64 encoding (JSON) and multipart form data
- The service automatically maps Notifyre's status codes to simplified versions
- Webhook events are stored in Supabase if database credentials are provided
- All endpoints support CORS for web applications
- The service is HIPAA compliant when used with Notifyre's secure infrastructure

---

## Support

For API support, please contact the development team or refer to the Notifyre documentation at [https://docs.notifyre.com](https://docs.notifyre.com).

Last Updated: July 6, 2025 
