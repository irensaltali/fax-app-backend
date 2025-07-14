/**
 * Base Provider Interface
 * Abstract class that defines the interface for all fax API providers
 */
export class BaseFaxProvider {
	constructor(apiKey, logger) {
		if (new.target === BaseFaxProvider) {
			throw new Error('Cannot instantiate abstract class BaseFaxProvider');
		}
		this.apiKey = apiKey;
		this.logger = logger;
	}

	/**
	 * Build the provider-specific payload from fax request
	 * @param {object} faxRequest - Standardized fax request object
	 * @returns {object} Provider-specific payload
	 */
	async buildPayload(faxRequest) {
		throw new Error('buildPayload method must be implemented by provider');
	}

	/**
	 * Send fax via provider API
	 * @param {object} payload - Provider-specific payload
	 * @returns {object} Standardized response
	 */
	async sendFax(payload) {
		throw new Error('sendFax method must be implemented by provider');
	}

	/**
	 * Get fax status via provider API
	 * @param {string} faxId - Fax ID from provider
	 * @returns {object} Standardized status response
	 */
	async getFaxStatus(faxId) {
		throw new Error('getFaxStatus method must be implemented by provider');
	}

	/**
	 * Map provider-specific status to standardized status
	 * @param {string} providerStatus - Status from provider
	 * @returns {string} Standardized status
	 */
	mapStatus(providerStatus) {
		throw new Error('mapStatus method must be implemented by provider');
	}

	/**
	 * Validate provider configuration
	 * @returns {boolean} True if configuration is valid
	 */
	validateConfig() {
		return !!this.apiKey;
	}

	/**
	 * Get provider name
	 * @returns {string} Provider name
	 */
	getProviderName() {
		throw new Error('getProviderName method must be implemented by provider');
	}
}

/**
 * Standardized fax request structure
 * @typedef {object} StandardFaxRequest
 * @property {string[]} recipients - Array of fax numbers
 * @property {File[]|object[]} files - Array of files to send
 * @property {string} [senderId] - Sender ID/number
 * @property {string} [subject] - Fax subject
 * @property {string} [message] - Fax message
 * @property {string} [coverPage] - Cover page template
 * @property {string} [clientReference] - Client reference ID
 * @property {boolean} [isHighQuality] - High quality setting
 */

/**
 * Standardized fax response structure
 * @typedef {object} StandardFaxResponse
 * @property {string} id - Fax ID
 * @property {string} status - Standardized status
 * @property {string} originalStatus - Original provider status
 * @property {string} message - Response message
 * @property {string} timestamp - Response timestamp
 * @property {string} [friendlyId] - Human-readable ID
 * @property {object} [providerResponse] - Full provider response
 */ 
