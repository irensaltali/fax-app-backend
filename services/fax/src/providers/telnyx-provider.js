/**
 * Telnyx Fax Provider
 * Implementation of BaseFaxProvider for Telnyx API
 * Special workflow: Save to Supabase → Upload to R2 → Send to Telnyx using R2 public URL
 */

import { BaseFaxProvider } from './base-provider.js';
import { FileUtils } from '../utils.js';
import { DatabaseUtils } from '../database.js';

export class TelnyxProvider extends BaseFaxProvider {
	constructor(apiKey, logger, options = {}) {
		super(apiKey, logger);
		this.baseUrl = 'https://api.telnyx.com';
		this.connectionId = options.connectionId;
		this.r2Utils = options.r2Utils;
		this.env = options.env;
	}

	getProviderName() {
		return 'telnyx';
	}

	/**
	 * Build Telnyx-specific payload from standardized fax request
	 * @param {object} faxRequest - Standardized fax request
	 * @returns {object} Telnyx API payload
	 */
	async buildPayload(faxRequest) {
		this.logger.log('DEBUG', 'Building Telnyx API payload structure');

		if (!this.connectionId) {
			throw new Error('Telnyx connection_id is required');
		}

		// For Telnyx, we need a single recipient (not an array)
		if (!faxRequest.recipients || faxRequest.recipients.length === 0) {
			throw new Error('At least one recipient is required for Telnyx');
		}

		const recipient = faxRequest.recipients[0]; // Telnyx sends to one recipient per request
		this.logger.log('DEBUG', 'Using first recipient for Telnyx', {
			recipient: '+***'
		});

		// The actual media_url will be set after file upload to R2
		const telnyxPayload = {
			connection_id: this.connectionId,
			to: recipient,
			from: faxRequest.senderId || "",
			// media_url will be set after R2 upload
		};

		this.logger.log('DEBUG', 'Base Telnyx payload created', {
			connection_id: telnyxPayload.connection_id,
			to: telnyxPayload.to.replace(/\d/g, '*'),
			from: telnyxPayload.from.replace(/\d/g, '*')
		});

		return telnyxPayload;
	}

	/**
	 * Custom workflow for Telnyx: Save to Supabase → Upload to R2 → Send fax
	 * @param {object} faxRequest - Standardized fax request
	 * @param {string|null} userId - User ID from auth context
	 * @returns {object} Standardized response
	 */
	async sendFaxWithCustomWorkflow(faxRequest, userId) {
		try {
			this.logger.log('INFO', 'Starting Telnyx custom workflow: Save to Supabase → Upload to R2 → Send fax');

			// Step 1: Create initial fax record in Supabase
			const faxRecord = await this.createInitialFaxRecord(faxRequest, userId);
			this.logger.log('INFO', 'Step 1 complete: Fax record saved to Supabase', { faxId: faxRecord.id });

			// Step 2: Upload files to R2 and get public URLs
			const mediaUrls = await this.uploadFilesToR2(faxRequest.files, faxRecord.id);
			this.logger.log('INFO', 'Step 2 complete: Files uploaded to R2', { urlCount: mediaUrls.length });

			// Step 3: Update fax record with R2 URLs
			await this.updateFaxRecordWithR2Urls(faxRecord.id, mediaUrls);
			this.logger.log('INFO', 'Step 3 complete: Fax record updated with R2 URLs');

			// Step 4: Send fax via Telnyx API using first R2 URL
			const telnyxResponse = await this.sendToTelnyx(faxRequest, mediaUrls[0]);
			this.logger.log('INFO', 'Step 4 complete: Fax sent to Telnyx', { telnyxFaxId: telnyxResponse.id });

			// Step 5: Update fax record with Telnyx response
			await this.updateFaxRecordWithTelnyxResponse(faxRecord.id, telnyxResponse);
			this.logger.log('INFO', 'Step 5 complete: Fax record updated with Telnyx response');

			return this.mapTelnyxResponse(telnyxResponse);

		} catch (error) {
			this.logger.log('ERROR', 'Telnyx custom workflow failed', {
				error: error.message,
				stack: error.stack
			});
			throw error;
		}
	}

	/**
	 * Create initial fax record in Supabase
	 * @param {object} faxRequest - Standardized fax request
	 * @param {string|null} userId - User ID
	 * @returns {object} Created fax record
	 */
	async createInitialFaxRecord(faxRequest, userId) {
		const faxData = {
			id: this.generateFaxId(),
			user_id: userId,
			recipient: faxRequest.recipients[0],
			sender_id: faxRequest.senderId,
			subject: faxRequest.subject || faxRequest.message || 'Fax Document',
			message: faxRequest.message,
			provider: 'telnyx',
			status: 'preparing',
			created_at: new Date().toISOString(),
			file_count: faxRequest.files ? faxRequest.files.length : 0
		};

		return await DatabaseUtils.saveFaxRecord(faxData, userId, this.env, this.logger);
	}

	/**
	 * Upload files to R2 and return public URLs
	 * @param {array} files - Files to upload
	 * @param {string} faxId - Fax ID for naming
	 * @returns {array} Array of R2 public URLs
	 */
	async uploadFilesToR2(files, faxId) {
		if (!this.r2Utils) {
			throw new Error('R2 utilities not configured');
		}

		if (!files || files.length === 0) {
			throw new Error('No files to upload');
		}

		const mediaUrls = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			this.logger.log('DEBUG', `Uploading file ${i + 1} to R2`, { 
				fileIndex: i, 
				hasFile: !!file 
			});

			try {
				// Generate unique filename
				const timestamp = Date.now();
				const filename = `fax/${faxId}/document_${i + 1}_${timestamp}.pdf`;

				// Convert file to buffer if needed
				let fileBuffer;
				if (file instanceof Blob || file instanceof File || (file && typeof file.arrayBuffer === 'function')) {
					fileBuffer = await file.arrayBuffer();
				} else if (file.data) {
					// Base64 encoded data
					fileBuffer = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
				} else {
					throw new Error(`Unsupported file format for file ${i + 1}`);
				}

				// Upload to R2
				const publicUrl = await this.r2Utils.uploadFile(filename, fileBuffer, 'application/pdf');
				mediaUrls.push(publicUrl);

				this.logger.log('DEBUG', `File ${i + 1} uploaded successfully`, {
					filename,
					url: publicUrl
				});

			} catch (error) {
				this.logger.log('ERROR', `Failed to upload file ${i + 1} to R2`, {
					error: error.message,
					fileIndex: i
				});
				throw error;
			}
		}

		return mediaUrls;
	}

	/**
	 * Update fax record with R2 URLs
	 * @param {string} faxId - Fax ID
	 * @param {array} mediaUrls - R2 URLs
	 */
	async updateFaxRecordWithR2Urls(faxId, mediaUrls) {
		const updateData = {
			r2_urls: mediaUrls,
			status: 'uploading_complete',
			updated_at: new Date().toISOString()
		};

		await DatabaseUtils.updateFaxRecord(faxId, updateData, this.env, this.logger);
	}

	/**
	 * Send fax to Telnyx API
	 * @param {object} faxRequest - Original fax request
	 * @param {string} mediaUrl - R2 public URL
	 * @returns {object} Telnyx API response
	 */
	async sendToTelnyx(faxRequest, mediaUrl) {
		const payload = await this.buildPayload(faxRequest);
		payload.media_url = mediaUrl;

		this.logger.log('DEBUG', 'Sending fax to Telnyx', {
			endpoint: `${this.baseUrl}/v2/faxes`,
			to: payload.to.replace(/\d/g, '*'),
			from: payload.from.replace(/\d/g, '*'),
			hasMediaUrl: !!payload.media_url
		});

		const response = await fetch(`${this.baseUrl}/v2/faxes`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errorText = await response.text();
			this.logger.log('ERROR', 'Telnyx API request failed', {
				status: response.status,
				statusText: response.statusText,
				error: errorText
			});
			throw new Error(`Telnyx API error: ${response.status} ${response.statusText} - ${errorText}`);
		}

		const responseData = await response.json();
		this.logger.log('DEBUG', 'Telnyx API response received', {
			faxId: responseData.data?.id,
			status: responseData.data?.status
		});

		return responseData.data;
	}

	/**
	 * Update fax record with Telnyx response
	 * @param {string} faxId - Internal fax ID
	 * @param {object} telnyxResponse - Telnyx API response
	 */
	async updateFaxRecordWithTelnyxResponse(faxId, telnyxResponse) {
		const updateData = {
			telnyx_fax_id: telnyxResponse.id,
			status: this.mapStatus(telnyxResponse.status),
			telnyx_response: telnyxResponse,
			sent_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		await DatabaseUtils.updateFaxRecord(faxId, updateData, this.env, this.logger);
	}

	/**
	 * Send fax via Telnyx API (standard interface method)
	 * @param {object} payload - Telnyx-specific payload
	 * @returns {object} Standardized response
	 */
	async sendFax(payload) {
		// This method is kept for interface compliance but shouldn't be used directly
		// Use sendFaxWithCustomWorkflow instead
		throw new Error('Use sendFaxWithCustomWorkflow method for Telnyx provider');
	}

	/**
	 * Get fax status via Telnyx API
	 * @param {string} faxId - Telnyx fax ID
	 * @returns {object} Standardized status response
	 */
	async getFaxStatus(faxId) {
		this.logger.log('DEBUG', 'Getting fax status from Telnyx', { faxId });

		const response = await fetch(`${this.baseUrl}/v2/faxes/${faxId}`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			this.logger.log('ERROR', 'Telnyx status check failed', {
				faxId,
				status: response.status,
				error: errorText
			});
			throw new Error(`Telnyx status check error: ${response.status} - ${errorText}`);
		}

		const responseData = await response.json();
		return this.mapTelnyxResponse(responseData.data);
	}

	/**
	 * Map Telnyx-specific status to standardized status
	 * @param {string} telnyxStatus - Status from Telnyx
	 * @returns {string} Standardized status
	 */
	mapStatus(telnyxStatus) {
		const statusMap = {
			'queued': 'pending',
			'sending': 'sending',
			'delivered': 'completed',
			'failed': 'failed',
			'canceled': 'failed'
		};

		return statusMap[telnyxStatus] || 'unknown';
	}

	/**
	 * Map Telnyx response to standardized format
	 * @param {object} telnyxResponse - Telnyx API response
	 * @returns {object} Standardized response
	 */
	mapTelnyxResponse(telnyxResponse) {
		return {
			id: telnyxResponse.id,
			status: this.mapStatus(telnyxResponse.status),
			originalStatus: telnyxResponse.status,
			message: 'Fax submitted to Telnyx successfully',
			timestamp: new Date().toISOString(),
			friendlyId: telnyxResponse.id,
			providerResponse: telnyxResponse
		};
	}

	/**
	 * Generate unique fax ID
	 * @returns {string} Unique fax ID
	 */
	generateFaxId() {
		return `telnyx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Validate Telnyx provider configuration
	 * @returns {boolean} True if configuration is valid
	 */
	validateConfig() {
		const hasApiKey = !!this.apiKey;
		const hasConnectionId = !!this.connectionId;
		const hasR2Utils = !!this.r2Utils;

		if (!hasApiKey) {
			this.logger.log('ERROR', 'Telnyx API key is missing');
		}
		if (!hasConnectionId) {
			this.logger.log('ERROR', 'Telnyx connection_id is missing');
		}
		if (!hasR2Utils) {
			this.logger.log('ERROR', 'R2 utilities are missing');
		}

		// Check R2Utils validation if available
		const r2UtilsValid = hasR2Utils && this.r2Utils.validateConfiguration ? this.r2Utils.validateConfiguration() : hasR2Utils;

		return hasApiKey && hasConnectionId && r2UtilsValid;
	}
}
