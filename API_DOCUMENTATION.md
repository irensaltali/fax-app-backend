# Send Fax API Documentation

## Overview

The Send Fax API provides comprehensive authentication and fax management services. The API is built on Cloudflare Workers and uses Supabase for authentication.

## Base URL

- **Staging**: `https://api-staging.sendfax.pro`
- **Production**: `https://api.sendfax.pro`

## Authentication

The API uses JWT-based authentication with Supabase. Most endpoints require a valid JWT token in the Authorization header.

### Authorization Header Format
```
Authorization: Bearer <your_jwt_token>
```

## Response Format

All responses are in JSON format with consistent error handling:

**Success Response:**
```json
{
  "data": { ... },
  "message": "Success message"
}
```

**Error Response:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Rate Limiting

The API implements standard rate limiting. Please implement appropriate retry logic with exponential backoff.

---

# Authentication Endpoints

## 1. Send Email OTP

Send a one-time password (OTP) to the user's email for authentication.

- **Method**: `POST`
- **Path**: `/v1/auth/email/otp`
- **Authentication**: Not required

### Request Body
```json
{
  "email": "user@example.com",
  "shouldCreateUser": true
}
```

### Parameters
- `email` (required): User's email address
- `shouldCreateUser` (optional): Whether to create a new user if email doesn't exist (default: true)

### Response
```json
{
  "message": "OTP sent successfully to your email",
  "note": "Check your email for a 6-digit verification code"
}
```

### Example
```bash
curl -X POST "https://api-staging.sendfax.pro/v1/auth/email/otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

---

## 2. Sign In with Password

Authenticate using email and password.

- **Method**: `POST`
- **Path**: `/v1/auth/signin`
- **Authentication**: Not required

### Request Body
```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

### Parameters
- `email` (required): User's email address
- `password` (required): User's password

### Response
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00Z",
    "email_confirmed_at": "2023-01-01T00:00:00Z"
  }
}
```

### Example
```bash
curl -X POST "https://api-staging.sendfax.pro/v1/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your_password"
  }'
```

---

## 3. Forgot Password

Send a password reset email to the user.

- **Method**: `POST`
- **Path**: `/v1/auth/forgot-password`
- **Authentication**: Not required

### Request Body
```json
{
  "email": "user@example.com",
  "redirectTo": "https://yourapp.com/reset-password"
}
```

### Parameters
- `email` (required): User's email address
- `redirectTo` (optional): URL to redirect to after password reset

### Response
```json
{
  "message": "Password reset email sent successfully",
  "note": "Check your email for password reset instructions"
}
```

### Example
```bash
curl -X POST "https://api-staging.sendfax.pro/v1/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

---

## 4. Verify OTP

Verify the OTP code sent via email and return authentication tokens.

- **Method**: `POST`
- **Path**: `/v1/auth/verify`
- **Authentication**: Not required

### Request Body
```json
{
  "email": "user@example.com",
  "token": "123456"
}
```

### Parameters
- `email` (required): User's email address
- `token` (required): 6-digit OTP code received via email

### Response
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00Z",
    "email_confirmed_at": "2023-01-01T00:00:00Z"
  }
}
```

### Example
```bash
curl -X POST "https://api-staging.sendfax.pro/v1/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "token": "123456"
  }'
```

---

## 5. Get User Profile

Get the current user's profile information.

- **Method**: `GET`
- **Path**: `/v1/auth/profile`
- **Authentication**: Required

### Response
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00Z",
    "email_confirmed_at": "2023-01-01T00:00:00Z",
    "last_sign_in_at": "2023-01-01T00:00:00Z",
    "user_metadata": {
      "displayName": "John Doe"
    },
    "app_metadata": {}
  }
}
```

### Example
```bash
curl -X GET "https://api-staging.sendfax.pro/v1/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 6. Update User Profile

Update the current user's profile information.

- **Method**: `PUT`
- **Path**: `/v1/auth/profile`
- **Authentication**: Required

### Request Body
```json
{
  "email": "newemail@example.com",
  "user_metadata": {
    "displayName": "John Doe",
    "phone": "+1234567890"
  }
}
```

### Parameters
- `email` (optional): New email address
- `user_metadata` (optional): User metadata object

### Response
```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "user-uuid",
    "email": "newemail@example.com",
    "user_metadata": {
      "displayName": "John Doe",
      "phone": "+1234567890"
    }
  }
}
```

### Example
```bash
curl -X PUT "https://api-staging.sendfax.pro/v1/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "user_metadata": {
      "displayName": "John Doe"
    }
  }'
```

---

## 7. Refresh Token

Refresh an expired access token using a refresh token.

- **Method**: `POST`
- **Path**: `/v1/auth/refresh`
- **Authentication**: Not required

### Request Body
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Parameters
- `refresh_token` (required): Valid refresh token

### Response
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}
```

### Example
```bash
curl -X POST "https://api-staging.sendfax.pro/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }'
```

---

## 8. Sign Out

Sign out the current user and invalidate the session.

- **Method**: `POST`
- **Path**: `/v1/auth/signout`
- **Authentication**: Required

### Response
```json
{
  "message": "Successfully signed out"
}
```

### Example
```bash
curl -X POST "https://api-staging.sendfax.pro/v1/auth/signout" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 9. Health Check (Public)

Check the health status of the authentication service.

- **Method**: `GET`
- **Path**: `/v1/auth/health`
- **Authentication**: Not required

### Response
```json
{
  "service": "auth-service",
  "status": "healthy",
  "timestamp": "2023-01-01T00:00:00Z",
  "supabase_configured": true
}
```

### Example
```bash
curl -X GET "https://api-staging.sendfax.pro/v1/auth/health" \
  -H "Content-Type: application/json"
```

---

## 10. Health Check (Protected)

Check the health status with authentication verification.

- **Method**: `GET`
- **Path**: `/v1/auth/health/protected`
- **Authentication**: Required

### Response
```json
{
  "service": "auth-service",
  "status": "healthy",
  "timestamp": "2023-01-01T00:00:00Z",
  "authenticated": true,
  "user_id": "user-uuid",
  "user_email": "user@example.com"
}
```

### Example
```bash
curl -X GET "https://api-staging.sendfax.pro/v1/auth/health/protected" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

# Fax Service Endpoints

## 11. Send Fax

Send a fax document to one or more recipients.

- **Method**: `POST`
- **Path**: `/v1/fax/send`
- **Authentication**: Required

### Request Body
```json
{
  "to": ["+1234567890", "+0987654321"],
  "document": "base64_encoded_pdf_content",
  "cover_page": {
    "subject": "Important Document",
    "message": "Please find the attached document."
  }
}
```

### Parameters
- `to` (required): Array of fax numbers in international format
- `document` (required): Base64-encoded PDF document
- `cover_page` (optional): Cover page information

### Response
```json
{
  "fax_id": "fax-uuid",
  "status": "queued",
  "recipients": ["+1234567890", "+0987654321"],
  "created_at": "2023-01-01T00:00:00Z"
}
```

### Example
```bash
curl -X POST "https://api-staging.sendfax.pro/v1/fax/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "to": ["+1234567890"],
    "document": "JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgoxMDAgNzAwIFRkCihIZWxsbyBXb3JsZCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago=",
    "cover_page": {
      "subject": "Test Fax",
      "message": "This is a test fax."
    }
  }'
```

---

## 12. Get Fax Status

Check the status of a sent fax.

- **Method**: `GET`
- **Path**: `/v1/fax/status`
- **Authentication**: Required

### Query Parameters
- `fax_id` (required): The fax ID returned from the send fax endpoint

### Response
```json
{
  "fax_id": "fax-uuid",
  "status": "completed",
  "recipients": [
    {
      "number": "+1234567890",
      "status": "delivered",
      "pages": 2,
      "duration": 45,
      "completed_at": "2023-01-01T00:00:00Z"
    }
  ],
  "created_at": "2023-01-01T00:00:00Z",
  "total_pages": 2
}
```

### Status Values
- `queued`: Fax is in the queue waiting to be sent
- `sending`: Fax is currently being transmitted
- `completed`: Fax has been successfully delivered
- `failed`: Fax transmission failed
- `cancelled`: Fax was cancelled

### Example
```bash
curl -X GET "https://api-staging.sendfax.pro/v1/fax/status?fax_id=fax-uuid" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 13. Fax Webhook (User Created)

Webhook endpoint for handling user creation events from Supabase.

- **Method**: `POST`
- **Path**: `/v1/fax/webhook/user-created`
- **Authentication**: Not required (Webhook)

### Request Body
```json
{
  "type": "INSERT",
  "table": "auth.users",
  "record": {
    "id": "user-uuid",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00Z"
  }
}
```

### Response
```json
{
  "message": "User creation webhook processed successfully"
}
```

---

## 14. Fax Health Check (Public)

Check the health status of the fax service.

- **Method**: `GET`
- **Path**: `/v1/fax/health`
- **Authentication**: Not required

### Response
```json
{
  "service": "fax-service",
  "status": "healthy",
  "timestamp": "2023-01-01T00:00:00Z"
}
```

### Example
```bash
curl -X GET "https://api-staging.sendfax.pro/v1/fax/health" \
  -H "Content-Type: application/json"
```

---

## 15. Fax Health Check (Protected)

Check the health status of the fax service with authentication.

- **Method**: `GET`
- **Path**: `/v1/fax/health/protected`
- **Authentication**: Required

### Response
```json
{
  "service": "fax-service",
  "status": "healthy",
  "timestamp": "2023-01-01T00:00:00Z",
  "authenticated": true,
  "user_id": "user-uuid"
}
```

### Example
```bash
curl -X GET "https://api-staging.sendfax.pro/v1/fax/health/protected" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

# Legacy Supabase Endpoints

These endpoints provide direct integration with Supabase's authentication system.

## 16. Supabase OTP

Send OTP using Supabase's built-in authentication.

- **Method**: `POST`
- **Path**: `/v1/auth/supabase/otp`
- **Authentication**: Not required

### Request Body
```json
{
  "email": "user@example.com"
}
```

---

## 17. Supabase OTP Verify

Verify OTP using Supabase's built-in authentication.

- **Method**: `POST`
- **Path**: `/v1/auth/supabase/otp/verify`
- **Authentication**: Not required

### Request Body
```json
{
  "email": "user@example.com",
  "token": "123456"
}
```

---

# Error Codes

## Authentication Errors
- `MISSING_EMAIL`: Email parameter is required
- `MISSING_CREDENTIALS`: Required credentials are missing
- `AUTH_FAILED`: Authentication failed
- `UNAUTHORIZED`: Access denied, valid JWT token required
- `OTP_SEND_FAILED`: Failed to send OTP
- `OTP_VERIFICATION_FAILED`: OTP verification failed
- `PASSWORD_RESET_FAILED`: Password reset failed
- `PROFILE_FETCH_FAILED`: Failed to fetch user profile
- `PROFILE_UPDATE_FAILED`: Failed to update user profile
- `TOKEN_REFRESH_FAILED`: Token refresh failed
- `SIGN_OUT_FAILED`: Sign out failed

## General Errors
- `INTERNAL_ERROR`: Internal server error
- `RATE_LIMITED`: Too many requests

---

# SDK Examples

## JavaScript/TypeScript

```javascript
class SendFaxAPI {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async signIn(email, password) {
    const response = await fetch(`${this.baseUrl}/v1/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    return response.json();
  }

  async sendFax(to, document, accessToken) {
    const response = await fetch(`${this.baseUrl}/v1/fax/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to, document }),
    });
    return response.json();
  }
}

// Usage
const api = new SendFaxAPI('https://api-staging.sendfax.pro');
const authResult = await api.signIn('user@example.com', 'password');
const faxResult = await api.sendFax(['+1234567890'], 'base64_pdf', authResult.access_token);
```

## Python

```python
import requests

class SendFaxAPI:
    def __init__(self, base_url):
        self.base_url = base_url
        
    def sign_in(self, email, password):
        response = requests.post(
            f"{self.base_url}/v1/auth/signin",
            json={"email": email, "password": password}
        )
        return response.json()
    
    def send_fax(self, to, document, access_token):
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        response = requests.post(
            f"{self.base_url}/v1/fax/send",
            json={"to": to, "document": document},
            headers=headers
        )
        return response.json()

# Usage
api = SendFaxAPI("https://api-staging.sendfax.pro")
auth_result = api.sign_in("user@example.com", "password")
fax_result = api.send_fax(["+1234567890"], "base64_pdf", auth_result["access_token"])
```

---

# Best Practices

## Security
- Always use HTTPS endpoints
- Store JWT tokens securely (not in localStorage for web apps)
- Implement proper token refresh logic
- Validate all inputs before sending requests

## Error Handling
- Implement retry logic with exponential backoff
- Handle rate limiting gracefully
- Log errors for debugging but don't expose sensitive information

## Performance
- Cache authentication tokens appropriately
- Use connection pooling for multiple requests
- Implement proper timeouts

## Monitoring
- Monitor API response times
- Track error rates
- Set up alerts for service degradation

---

# Support

For API support, please contact:
- Email: support@sendfax.pro
- Documentation: https://docs.sendfax.pro
- Status Page: https://status.sendfax.pro

Last Updated: July 6, 2025 
