# Fax Service Scripts

This directory contains utility scripts for the fax service.

## supabase-login.js

A helper script to authenticate with Supabase and retrieve access/refresh tokens for testing and development.

### Setup

1. Ensure you have the required environment variables:
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_ANON_KEY="your-anon-key"
   ```

2. Optionally set default credentials:
   ```bash
   export SUPABASE_TEST_EMAIL="user@example.com"
   export SUPABASE_TEST_PASSWORD="your-password"
   ```

### Usage

#### Basic Authentication
```bash
# Using command line arguments
node scripts/supabase-login.js user@example.com mypassword

# Using environment variables
SUPABASE_TEST_EMAIL=user@example.com SUPABASE_TEST_PASSWORD=mypassword node scripts/supabase-login.js
```

#### Refresh Tokens
```bash
node scripts/supabase-login.js refresh eyJ0eXAiOiJKV1QiLCJhbGc...
```

#### Help
```bash
node scripts/supabase-login.js help
```

### Output

The script will:
1. ✅ Authenticate with Supabase
2. 📄 Display session details (user ID, email, expiration)
3. 🔑 Show access and refresh tokens
4. 📋 Output copy-paste ready JSON
5. 💾 Save tokens to `tokens.json`
6. 🔧 Save environment format to `tokens.env`
7. 🧪 Test the access token validity
8. 🚀 Provide example curl commands

### Example Output

```
🔐 Authenticating with Supabase...
📧 Email: user@example.com
🌐 Supabase URL: https://your-project.supabase.co

✅ Authentication successful!

📄 Session Details:
👤 User ID: 12345678-1234-1234-1234-123456789abc
📧 Email: user@example.com
⏰ Expires: 2024-01-01T12:00:00.000Z

🔑 Tokens:

🟢 Access Token:
eyJ0eXAiOiJKV1QiLCJhbGc...

🔄 Refresh Token:
eyJ0eXAiOiJKV1QiLCJhbGc...

📋 Copy-paste ready JSON:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "expires_at": 1704110400,
  "expires_at_iso": "2024-01-01T12:00:00.000Z",
  "user": {
    "id": "12345678-1234-1234-1234-123456789abc",
    "email": "user@example.com",
    "email_confirmed_at": "2023-12-01T10:00:00.000Z",
    "last_sign_in_at": "2024-01-01T11:00:00.000Z"
  }
}

💾 Tokens saved to: /path/to/project/tokens.json
🔧 Environment format saved to: /path/to/project/tokens.env

🧪 Testing access token...
✅ Access token is valid and working!

🚀 Ready to use tokens for API testing!

Example curl with access token:
curl -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..." \
     -H "Content-Type: application/json" \
     "https://your-project.supabase.co/rest/v1/your-table"
```

### Using the Tokens

#### With curl
```bash
# Using the access token directly
curl -H "Authorization: Bearer $(cat tokens.json | jq -r .access_token)" \
     -H "Content-Type: application/json" \
     "https://your-api.com/v1/fax/send"

# Or source the environment file
source tokens.env
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     "https://your-api.com/v1/fax/send"
```

#### In Tests
```javascript
import fs from 'fs';

const tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));

// Use tokens.access_token for authenticated requests
const response = await fetch('/api/protected-endpoint', {
  headers: {
    'Authorization': `Bearer ${tokens.access_token}`,
    'Content-Type': 'application/json'
  }
});
```

### Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit tokens to version control** - The `tokens.json` and `tokens.env` files are already in `.gitignore`
2. **Tokens expire** - Access tokens typically expire in 1 hour, use refresh tokens to get new ones
3. **Use for development only** - This script is for development/testing, not production
4. **Protect your credentials** - Don't share or expose your email/password or tokens

### Troubleshooting

#### Authentication Failed
- ✅ Check your email and password are correct
- ✅ Verify the user exists in your Supabase project
- ✅ Ensure email is confirmed if required

#### Configuration Errors
- ✅ Verify `SUPABASE_URL` is set correctly
- ✅ Check `SUPABASE_ANON_KEY` or `SUPABASE_KEY` is valid
- ✅ Ensure the anon key has the right permissions

#### Token Issues
- ✅ Check token expiration time
- ✅ Try refreshing the token
- ✅ Re-authenticate if refresh fails 
