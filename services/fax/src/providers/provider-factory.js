/**
 * Provider Factory
 * Factory pattern for creating and managing different fax API providers
 */

import { NotifyreProvider } from './notifyre-provider.js';
import { TelnyxProvider } from './telnyx-provider.js';

export class ProviderFactory {
	/**
	 * Create a fax API provider instance
	 * @param {string} apiProviderName - Name of the API provider ('notifyre', 'telnyx', 'twilio', etc.)
	 * @param {string} apiKey - API key for the provider
	 * @param {Logger} logger - Logger instance
	 * @param {object} options - Additional provider options
	 * @returns {NotifyreProvider|TelnyxProvider} API provider instance
	 */
	static createProvider(apiProviderName, apiKey, logger, options = {}) {
		if (!apiProviderName) {
			throw new Error('API provider name is required');
		}

		if (!apiKey) {
			throw new Error('API key is required');
		}

		if (!logger) {
			throw new Error('Logger is required');
		}

		switch (apiProviderName.toLowerCase()) {
			case 'notifyre':
				return new NotifyreProvider(apiKey, logger);
			
			case 'telnyx':
				return new TelnyxProvider(apiKey, logger, options);
			
			// Add other API providers here as they're implemented
			// case 'twilio':
			//     return new TwilioProvider(apiKey, logger);
			// case 'clicksend':
			//     return new ClickSendProvider(apiKey, logger);
			
			default:
				throw new Error(`Unsupported API provider: ${apiProviderName}. Currently supported: notifyre, telnyx`);
		}
	}

	/**
	 * Get list of supported API providers
	 * @returns {string[]} Array of supported API provider names
	 */
	static getSupportedProviders() {
		return [
			'notifyre', // Original provider
			'telnyx'    // New provider with R2 integration
			// Add other API providers here as they're implemented
			// 'twilio',
			// 'clicksend'
		];
	}

	/**
	 * Validate API provider configuration
	 * @param {string} apiProviderName - API provider name
	 * @param {object} config - Provider configuration
	 * @returns {boolean} True if configuration is valid
	 */
	static validateProviderConfig(apiProviderName, config) {
		const supportedProviders = this.getSupportedProviders();
		
		if (!supportedProviders.includes(apiProviderName.toLowerCase())) {
			return false;
		}

		// Basic validation - all API providers need an API key
		if (!config.apiKey) {
			return false;
		}

		// Provider-specific validation can be added here
		switch (apiProviderName.toLowerCase()) {
			case 'notifyre':
				// Notifyre specific validation
				return typeof config.apiKey === 'string' && config.apiKey.length > 0;
			
			case 'telnyx':
				// Telnyx specific validation
				const hasApiKey = typeof config.apiKey === 'string' && config.apiKey.length > 0;
				const hasConnectionId = typeof config.connectionId === 'string' && config.connectionId.length > 0;
				return hasApiKey && hasConnectionId;
			
			default:
				return true;
		}
	}

	/**
	 * Get API provider-specific configuration requirements
	 * @param {string} apiProviderName - API provider name
	 * @returns {object} Configuration requirements
	 */
	static getProviderRequirements(apiProviderName) {
		switch (apiProviderName.toLowerCase()) {
			case 'notifyre':
				return {
					apiKey: {
						required: true,
						type: 'string',
						description: 'Notifyre API token'
					},
					baseUrl: {
						required: false,
						type: 'string',
						default: 'https://api.notifyre.com',
						description: 'Notifyre API base URL'
					}
				};
			
			case 'telnyx':
				return {
					apiKey: {
						required: true,
						type: 'string',
						description: 'Telnyx API token'
					},
					connectionId: {
						required: true,
						type: 'string',
						description: 'Telnyx connection ID (Programmable Fax Application ID)'
					},
					baseUrl: {
						required: false,
						type: 'string',
						default: 'https://api.telnyx.com',
						description: 'Telnyx API base URL'
					},
					r2BucketBinding: {
						required: true,
						type: 'string',
						description: 'Cloudflare R2 bucket binding name (FAX_FILES_BUCKET)'
					},
					r2PublicDomain: {
						required: true,
						type: 'string',
						description: 'R2 public domain for file access (R2_PUBLIC_DOMAIN)'
					}
				};
			
			// Add other API providers here as they're implemented
			// case 'twilio':
			//     return {
			//         accountSid: { required: true, type: 'string', description: 'Twilio Account SID' },
			//         authToken: { required: true, type: 'string', description: 'Twilio Auth Token' }
			//     };
			
			default:
				return {
					apiKey: {
						required: true,
						type: 'string',
						description: 'API key for the API provider'
					}
				};
		}
	}
} 
