# Auth Service

A comprehensive authentication service built on Supabase for the Serverless API Gateway.

## Features

- **Email OTP Authentication**: Send and verify OTP codes via email
- **Phone OTP Authentication**: Send and verify OTP codes via SMS
- **User Profile Management**: Get and update user profiles
- **Token Management**: Refresh access tokens and handle sign-out
- **Health Checks**: Service health monitoring with protected endpoints

## Available Endpoints

### Authentication
- `POST /v1/auth/email/otp` - Send OTP via email
- `POST /v1/auth/phone/otp` - Send OTP via SMS
- `POST /v1/auth/verify` - Verify OTP and get session tokens

### User Management (Protected)
- `GET /v1/auth/profile` - Get user profile
- `PUT /v1/auth/profile` - Update user profile
- `POST /v1/auth/signout` - Sign out user

### Token Management
- `POST /v1/auth/refresh` - Refresh access token

### Health Checks
- `GET /v1/auth/health` - Service health check
- `GET /v1/auth/health/protected` - Protected health check

## API Usage Examples

### Send Email OTP
```bash
curl -X POST https://your-api.com/v1/auth/email/otp \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

### Verify OTP
```bash
curl -X POST https://your-api.com/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "token": "123456"}'
```

### Get User Profile (Protected)
```bash
curl -X GET https://your-api.com/v1/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update User Profile (Protected)
```bash
curl -X PUT https://your-api.com/v1/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_metadata": {"first_name": "John", "last_name": "Doe"}}'
```

## Configuration

The service requires the following environment variables:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for admin operations)

## Authentication Flow

1. **Send OTP**: User requests OTP via email or phone
2. **Verify OTP**: User submits OTP code to get access/refresh tokens
3. **Use Token**: Include access token in `Authorization: Bearer <token>` header
4. **Refresh Token**: Use refresh token to get new access token when needed

## Error Handling

The service returns structured error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `MISSING_EMAIL`: Email is required
- `MISSING_PHONE`: Phone is required
- `MISSING_CREDENTIALS`: Token and email/phone are required
- `OTP_SEND_FAILED`: Failed to send OTP
- `OTP_VERIFICATION_FAILED`: OTP verification failed
- `UNAUTHORIZED`: Invalid or missing authentication
- `PROFILE_FETCH_FAILED`: Failed to get user profile
- `PROFILE_UPDATE_FAILED`: Failed to update user profile
- `TOKEN_REFRESH_FAILED`: Token refresh failed
- `INTERNAL_ERROR`: Internal server error

## Testing

Run tests with:
```bash
npm test
```

## Deployment

Deploy the service with:
```bash
npm run deploy
```

## Security Best Practices

- Store JWT secrets securely using Wrangler secrets
- Use HTTPS for all API endpoints
- Implement rate limiting for OTP endpoints
- Rotate credentials regularly
- Validate all input data
- Use service role key only for admin operations 
