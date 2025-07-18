# Fax Provider Architecture

This directory contains the provider-specific implementations for different fax APIs. The architecture follows a factory pattern to support multiple fax service providers.

## Architecture Overview

### Base Provider (`base-provider.js`)
- Abstract base class that defines the interface for all fax providers
- Ensures consistent API across different providers
- Standardizes request/response formats

### Provider Factory (`provider-factory.js`)
- Creates and manages provider instances
- Validates provider configurations
- Returns appropriate provider based on configuration

### Current Providers

#### Notifyre Provider (`notifyre-provider.js`)
- Implementation for Notifyre API
- Handles Notifyre-specific payload formatting
- Maps Notifyre status codes to standard statuses

## Adding a New Provider

To add a new fax provider (e.g., Twilio, ClickSend), follow these steps:

### 1. Create Provider Implementation

Create a new file: `{provider-name}-provider.js`

```javascript
import { BaseFaxProvider } from './base-provider.js';

export class TwilioProvider extends BaseFaxProvider {
    constructor(apiKey, logger) {
        super(apiKey, logger);
        this.baseUrl = 'https://api.twilio.com';
        this.accountSid = apiKey; // Twilio uses Account SID
    }

    getProviderName() {
        return 'twilio';
    }

    async buildPayload(faxRequest) {
        // Convert standardized fax request to Twilio format
        return {
            // Twilio-specific payload structure
        };
    }

    async sendFax(payload) {
        // Send fax via Twilio API
        // Return standardized response
    }

    mapStatus(twilioStatus) {
        // Map Twilio status to standard status
        const statusMap = {
            'queued': 'queued',
            'sending': 'sending',
            'sent': 'delivered',
            'failed': 'failed'
            // Add more mappings
        };
        return statusMap[twilioStatus] || 'failed';
    }
}
```

### 2. Update Provider Factory

Add the new provider to `provider-factory.js`:

```javascript
import { TwilioProvider } from './twilio-provider.js';

// In createProvider method:
case 'twilio':
    return new TwilioProvider(apiKey, logger);

// In getSupportedProviders method:
return [
    'notifyre',
    'twilio'
];

// In getProviderRequirements method:
case 'twilio':
    return {
        accountSid: { required: true, type: 'string', description: 'Twilio Account SID' },
        authToken: { required: true, type: 'string', description: 'Twilio Auth Token' }
    };
```

### 3. Update Main Service

In `fax.js`, add environment variable handling:

```javascript
// In createFaxProvider method:
case 'twilio':
    apiKey = env.TWILIO_ACCOUNT_SID;
    // Additional config handling if needed
    break;
```

### 4. Environment Configuration

Add environment variables:
- `FAX_PROVIDER=twilio` - Sets the active provider
- `TWILIO_ACCOUNT_SID=your_account_sid`
- `TWILIO_AUTH_TOKEN=your_auth_token`

## Standardized Data Formats

### Fax Request (Input)
```javascript
{
    recipients: ['1234567890'],
    files: [File objects or base64 data],
    senderId: 'optional sender ID',
    subject: 'optional subject',
    message: 'optional message',
    coverPage: 'optional template name',
    clientReference: 'optional reference',
    isHighQuality: false
}
```

### Fax Response (Output)
```javascript
{
    id: 'provider_fax_id',
    friendlyId: 'human_readable_id', // optional
    status: 'queued|processing|sending|delivered|failed|cancelled',
    originalStatus: 'provider_specific_status',
    message: 'response message',
    timestamp: 'ISO timestamp',
    providerResponse: { /* full provider response */ }
}
```

### Status Response (Status Check)
```javascript
{
    id: 'fax_id',
    status: 'standardized_status',
    originalStatus: 'provider_status',
    message: 'status message',
    timestamp: 'ISO timestamp',
    recipient: 'fax_number',
    pages: 1,
    cost: 'cost_amount',
    sentAt: 'ISO timestamp',
    completedAt: 'ISO timestamp',
    errorMessage: 'error if failed',
    providerResponse: { /* full provider response */ }
}
```

## Standard Status Codes

The system uses these standardized status codes:
- `queued` - Fax is queued for processing
- `processing` - Fax is being processed
- `sending` - Fax is being sent
- `delivered` - Fax was successfully delivered
- `receiving` - Fax is being received (for incoming)
- `failed` - Fax failed to send
- `busy` - Recipient was busy
- `no-answer` - No answer from recipient
- `cancelled` - Fax was cancelled

## Configuration Requirements

Each provider should implement:
1. **API Authentication** - How to authenticate with the provider's API
2. **Payload Conversion** - Convert standard request to provider format
3. **Response Parsing** - Extract relevant data from provider response
4. **Status Mapping** - Map provider statuses to standard statuses
5. **Error Handling** - Handle provider-specific errors gracefully

## Testing New Providers

1. **Unit Tests**: Test payload conversion and status mapping
2. **Integration Tests**: Test with provider's sandbox/test environment
3. **Error Scenarios**: Test various failure conditions
4. **Status Polling**: Verify status updates work correctly

## Provider Selection

The active provider is determined by:
1. `FAX_PROVIDER` environment variable
2. Defaults to `'notifyre'` if not specified
3. Provider must be supported in `ProviderFactory.getSupportedProviders()`

## Best Practices

1. **Always validate** provider responses
2. **Log appropriately** but sanitize sensitive data
3. **Handle errors gracefully** with fallback behavior
4. **Map statuses consistently** to avoid database issues
5. **Document** provider-specific quirks and limitations
6. **Test thoroughly** with real provider sandbox environments 
