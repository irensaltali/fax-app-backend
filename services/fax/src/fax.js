/**
 * Fax Service - Compatible with Serverless API Gateway
 * Service binding handlers that receive (request, caller_env, sagContext) parameters
 * Currently using Notifyre API with multi-provider architecture support
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import { Logger, FileUtils, ApiUtils, isValidFaxStatus } from './utils.js';
import { DatabaseUtils } from './database.js';
import { ProviderFactory } from './providers/provider-factory.js';

export default class extends WorkerEntrypoint {
	constructor(ctx, env) {
		super(ctx, env);
		this.logger = null;
	}

	async fetch(request, env) {
		this.initializeLogger(env);
		this.logger.log('INFO', 'Fetch request received');
		return new Response("Hello from Notifyre Fax Service");
	}

	initializeLogger(env) {
		if (!this.logger) {
			this.logger = new Logger(env);
		}
	}



	/**
	 * Parse and validate request body
	 * @param {Request} request - The incoming request
	 * @returns {object} Parsed request body
	 */
	async parseRequestBody(request) {
		this.logger.log('DEBUG', 'Starting request body processing');

		if (!request.body) {
			this.logger.log('DEBUG', 'No request body provided');
			return null;
		}

		const contentType = request.headers.get('content-type') || '';
		this.logger.log('DEBUG', 'Processing request body', {
			contentType,
			hasContentLength: !!request.headers.get('content-length'),
			contentLength: request.headers.get('content-length')
		});

		if (contentType.includes('multipart/form-data')) {
			this.logger.log('DEBUG', 'Parsing multipart/form-data request');
			const formData = await request.formData();
			this.logger.log('DEBUG', 'Received FormData request', {
				formDataKeys: Array.from(formData.keys()),
				formDataSize: formData.entries ? Array.from(formData.entries()).length : 'unknown'
			});
			return formData;
		} else if (contentType.includes('application/json')) {
			this.logger.log('DEBUG', 'Parsing application/json request');
			const jsonData = await request.json();
			this.logger.log('DEBUG', 'Received JSON request', {
				hasRecipient: !!jsonData.recipient,
				hasRecipients: !!jsonData.recipients,
				hasFiles: !!jsonData.files,
				recipientCount: jsonData.recipients ? jsonData.recipients.length : (jsonData.recipient ? 1 : 0),
				fileCount: jsonData.files ? jsonData.files.length : 0,
				hasMessage: !!jsonData.message,
				hasCoverPage: !!jsonData.coverPage,
				hasSenderId: !!jsonData.senderId,
				hasSubject: !!jsonData.subject
			});
			return jsonData;
		} else {
			this.logger.log('DEBUG', 'Parsing text/plain request');
			const textData = await request.text();
			this.logger.log('DEBUG', 'Received text request', { bodyLength: textData.length });
			return textData;
		}
	}

	/**
	 * Prepare fax request object from parsed input
	 * @param {FormData|object|string} requestBody - Parsed request body
	 * @returns {object} Fax request object
	 */
	async prepareFaxRequest(requestBody) {
		this.logger.log('DEBUG', 'Starting fax request preparation');
		let faxRequest = {};

		if (requestBody instanceof FormData) {
			this.logger.log('DEBUG', 'Converting FormData to fax request object');
			// Convert FormData to object for SDK
			for (const [key, value] of requestBody.entries()) {
				if (key === 'recipients[]') {
					if (!faxRequest.recipients) faxRequest.recipients = [];
					faxRequest.recipients.push(value);
				} else if (key === 'files[]') {
					if (!faxRequest.files) faxRequest.files = [];
					faxRequest.files.push(value);
				} else {
					faxRequest[key] = value;
				}
			}
			this.logger.log('DEBUG', 'FormData conversion completed', {
				convertedKeys: Object.keys(faxRequest),
				recipientCount: faxRequest.recipients ? faxRequest.recipients.length : 0,
				fileCount: faxRequest.files ? faxRequest.files.length : 0
			});
		} else if (typeof requestBody === 'object' && requestBody !== null) {
			this.logger.log('DEBUG', 'Processing JSON object request body');

			const {
				recipient,
				recipients,
				message,
				coverPage,
				files,
				senderId,
				...otherFields
			} = requestBody;

			// Add recipient(s)
			if (recipients && Array.isArray(recipients)) {
				faxRequest.recipients = recipients;
				this.logger.log('DEBUG', 'Set recipients from array', { count: recipients.length });
			} else if (recipient) {
				faxRequest.recipients = [recipient];
				this.logger.log('DEBUG', 'Set recipients from single recipient', { recipient: recipient.replace(/\d/g, '*') });
			} else {
				this.logger.log('WARN', 'No recipients provided in request');
			}

			// Add optional fields
			if (message) {
				faxRequest.message = message;
				this.logger.log('DEBUG', 'Set message field', { messageLength: message.length });
			}
			if (coverPage) {
				faxRequest.coverPage = coverPage;
				this.logger.log('DEBUG', 'Set cover page field', { coverPage });
			}
			if (senderId) {
				faxRequest.senderId = senderId;
				this.logger.log('DEBUG', 'Set sender ID field', { senderId: senderId.replace(/\d/g, '*') });
			}

			// Add other fields
			if (Object.keys(otherFields).length > 0) {
				Object.assign(faxRequest, otherFields);
				this.logger.log('DEBUG', 'Added other fields', { otherFieldsKeys: Object.keys(otherFields) });
			}

			// Handle file processing
			if (files && Array.isArray(files)) {
				this.logger.log('DEBUG', 'Processing files from JSON payload', { fileCount: files.length });
				faxRequest.files = await this.processJsonFiles(files);
				this.logger.log('DEBUG', 'All files processed successfully', { processedCount: faxRequest.files.length });
			}
		}

		// Log the prepared fax request data (without sensitive content)
		this.logger.log('INFO', 'Prepared fax request for SDK', {
			hasRecipients: !!faxRequest.recipients,
			recipientCount: faxRequest.recipients ? faxRequest.recipients.length : 0,
			recipients: faxRequest.recipients ? faxRequest.recipients.map(r => r.replace(/\d/g, '*')) : undefined,
			hasFiles: !!faxRequest.files,
			fileCount: faxRequest.files ? faxRequest.files.length : 0,
			fileTypes: faxRequest.files ? faxRequest.files.map(f => f.type || f.mimeType || 'unknown') : undefined,
			hasMessage: !!faxRequest.message,
			messageLength: faxRequest.message ? faxRequest.message.length : 0,
			hasCoverPage: !!faxRequest.coverPage,
			hasSenderId: !!faxRequest.senderId,
			otherFields: Object.keys(faxRequest).filter(key => !['recipients', 'files', 'message', 'coverPage', 'senderId'].includes(key))
		});

		return faxRequest;
	}

	/**
	 * Process JSON file data for fax submission
	 * @param {Array} files - Array of file objects
	 * @returns {Array} Processed files
	 */
	async processJsonFiles(files) {
		const processedFiles = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];

			if (file.data) {
				// Handle base64 data
				try {
					const buffer = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
					const blob = new Blob([buffer], { type: file.mimeType || 'application/pdf' });
					this.logger.log('DEBUG', `File ${i} converted to Blob`, {
						blobSize: blob.size,
						blobType: blob.type
					});
					processedFiles.push(blob);
				} catch (base64Error) {
					this.logger.log('ERROR', `Failed to decode base64 for file ${i}`, {
						error: base64Error.message,
						dataPreview: file.data ? file.data.substring(0, 50) + '...' : 'none'
					});
					throw new Error(`Invalid base64 data for file ${i}`);
				}
			} else {
				this.logger.log('DEBUG', `File ${i} used as-is (no data field)`);
				processedFiles.push(file);
			}
		}

		return processedFiles;
	}

	/**
	 * Create and configure Notifyre fax API client
	 * @param {object} env - Environment variables
	 * @returns {NotifyreProvider} Configured Notifyre provider instance
	 */
	async createFaxProvider(env) {
		// Get API provider name from environment, default to 'notifyre'
		const apiProviderName = env.FAX_PROVIDER || 'notifyre';
		
		// Get the appropriate API key based on the selected provider
		let apiKey;
		switch (apiProviderName.toLowerCase()) {
			case 'notifyre':
				apiKey = env.NOTIFYRE_API_KEY;
				break;
			// Add other API providers here as they're implemented
			// case 'twilio':
			//     apiKey = env.TWILIO_AUTH_TOKEN;
			//     break;
			default:
				throw new Error(`Unsupported API provider: ${apiProviderName}`);
		}

		if (!apiKey) {
			throw new Error(`API key not found for ${apiProviderName} provider`);
		}

		this.logger.log('DEBUG', 'Creating Notifyre API client', { 
			apiProvider: apiProviderName,
			hasApiKey: !!apiKey 
		});

		return ProviderFactory.createProvider(apiProviderName, apiKey, this.logger);
	}



	/**
	 * Send a fax via Notifyre API
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async sendFax(request, caller_env, sagContext) {
		try {
			// Initialize environment and logger
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			this.initializeLogger(this.env);

			this.logger.log('INFO', 'Send fax request received', {
				method: request.method,
				url: request.url,
				hasBody: !!request.body,
				contentType: request.headers.get('content-type'),
				userAgent: request.headers.get('user-agent'),
				authorization: request.headers.get('authorization') ? 'Bearer [REDACTED]' : 'none'
			});

			// Step 1: Create and validate Notifyre API client
			const notifyreClient = await this.createFaxProvider(this.env);

			// Step 2: Parse request body  
			const requestBody = await this.parseRequestBody(request);

			// Step 3: Prepare fax request from parsed body
			const faxRequest = await this.prepareFaxRequest(requestBody);

			// Step 4: Build Notifyre API payload
			const notifyrePayload = await notifyreClient.buildPayload(faxRequest);

			// Step 5: Submit via Notifyre API
			this.logger.log('INFO', 'Sending fax via Notifyre API', {
				apiProvider: notifyreClient.getProviderName(),
				hasPayload: !!notifyrePayload,
				recipientCount: faxRequest.recipients ? faxRequest.recipients.length : 0,
				fileCount: faxRequest.files ? faxRequest.files.length : 0
			});

			const notifyreResult = await notifyreClient.sendFax(notifyrePayload);

			// Validate Notifyre result has required ID
			if (!notifyreResult.id) {
				this.logger.log('ERROR', 'Notifyre API did not return a valid fax ID', {
					apiProvider: notifyreClient.getProviderName(),
					result: notifyreResult
				});
				throw new Error('Notifyre API did not return a valid fax ID');
			}

			this.logger.log('INFO', 'Fax submitted successfully via Notifyre', { 
				faxId: notifyreResult.id, 
				friendlyId: notifyreResult.friendlyId,
				apiProvider: notifyreClient.getProviderName()
			});

			// Step 6: Save fax record to database
			let savedFaxRecord = null;
			const userId = context.jwtPayload?.sub || context.jwtPayload?.user_id || context.user?.id || null;
			const isAnonymous = !userId;

			this.logger.log('DEBUG', 'Processing fax record save', {
				userId: userId || 'anonymous',
				isAnonymous
			});

			// Prepare fax data for database save (for both authenticated and anonymous users)
			const faxDataForSave = {
				id: notifyreResult.id,
				status: notifyreResult.status || 'queued',
				originalStatus: notifyreResult.originalStatus || 'Submitted',
				recipients: faxRequest.recipients || [],
				senderId: faxRequest.senderId,
				subject: faxRequest.subject || faxRequest.message,
				pages: 1, // Default to 1 page for new submissions
				cost: null, // Cost will be updated via polling
				clientReference: faxRequest.clientReference || 'SendFaxPro',
				sentAt: new Date().toISOString(),
				completedAt: null,
				errorMessage: null,
				notifyreResponse: notifyreResult.providerResponse,
				friendlyId: notifyreResult.friendlyId,
				apiProvider: notifyreClient.getProviderName()
			};

			// Save fax record for both authenticated and anonymous users
			savedFaxRecord = await DatabaseUtils.saveFaxRecord(faxDataForSave, userId, this.env, this.logger);

			// Step 7: Return success response
			const responseData = {
				statusCode: 200,
				message: "Fax submitted successfully",
				data: {
					id: notifyreResult.id,
					friendlyId: notifyreResult.friendlyId,
					status: notifyreResult.status || 'queued',
					originalStatus: notifyreResult.originalStatus || 'Submitted',
					message: "Fax is now queued for processing",
					timestamp: new Date().toISOString(),
					recipient: faxRequest.recipients?.[0] || 'unknown',
					pages: 1,
					cost: null,
					apiProvider: notifyreClient.getProviderName(),
					notifyreResponse: notifyreResult.providerResponse
				}
			};

			this.logger.log('INFO', 'Returning successful Notifyre fax response', {
				faxId: responseData.data.id,
				friendlyId: responseData.data.friendlyId,
				status: responseData.data.status,
				recipient: responseData.data.recipient ? responseData.data.recipient.replace(/\d/g, '*') : 'unknown',
				pages: responseData.data.pages,
				cost: responseData.data.cost,
				apiProvider: responseData.data.apiProvider
			});

			return responseData;

		} catch (error) {
			this.logger.log('ERROR', 'Error in sendFax', {
				errorMessage: error.message,
				errorStack: error.stack,
				errorName: error.name,
				errorCode: error.code,
				timestamp: new Date().toISOString()
			});

			// Log additional context if available
			if (this.env) {
				this.logger.log('ERROR', 'Environment context during error', {
					currentApiProvider: this.env.FAX_PROVIDER || 'notifyre',
					hasNotifyreApiKey: !!(this.env.NOTIFYRE_API_KEY), // Add other API keys as needed
					logLevel: this.env.LOG_LEVEL || 'not_set',
					envKeys: Object.keys(this.env).filter(key => !key.includes('KEY') && !key.includes('SECRET') && !key.includes('TOKEN'))
				});
			}

			return {
				statusCode: 500,
				error: "Fax sending failed",
				message: error.message,
				details: error.stack,
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Get fax status via Notifyre API
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async getFaxStatus(request, caller_env, sagContext) {
		try {
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			this.initializeLogger(this.env);

			this.logger.log('INFO', 'Get fax status request received');

			// Create Notifyre API client instance
			const notifyreClient = await this.createFaxProvider(this.env);

			const url = new URL(request.url);
			const faxId = url.searchParams.get('id');

			if (!faxId) {
				throw new Error('Fax ID is required');
			}

			this.logger.log('INFO', 'Checking fax status via Notifyre API', { 
				faxId, 
				apiProvider: notifyreClient.getProviderName() 
			});

			// Get fax status via Notifyre API
			const notifyreStatusResult = await notifyreClient.getFaxStatus(faxId);

			// Validate status is a known standard status
			if (!isValidFaxStatus(notifyreStatusResult.status)) {
				this.logger.log('WARN', 'Invalid status returned from Notifyre API', {
					status: notifyreStatusResult.status,
					apiProvider: notifyreClient.getProviderName()
				});
				// Don't throw error, just log warning
			}

			this.logger.log('INFO', 'Notifyre status retrieved successfully', { 
				faxId, 
				status: notifyreStatusResult.status,
				apiProvider: notifyreClient.getProviderName()
			});

			return {
				statusCode: 200,
				message: "Status retrieved successfully",
				data: {
					...notifyreStatusResult,
					apiProvider: notifyreClient.getProviderName()
				}
			};

		} catch (error) {
			this.logger.log('ERROR', 'Error in getFaxStatus:', error);
			return {
				statusCode: 500,
				error: "Status check failed",
				message: error.message
			};
		}
	}



















	/**
	 * Health check (unauthenticated)
	 * @param {Request} request
	 * @param {string} caller_env
	 * @param {string} sagContext
	 */
	async health(request, caller_env, sagContext) {
		try {
			this.env = JSON.parse(caller_env);
			this.initializeLogger(this.env);
			this.logger.log('INFO', 'Health check request received');

			return {
				statusCode: 200,
				message: "Notifyre Fax service healthy",
				data: {
					service: "notifyre-fax",
					timestamp: new Date().toISOString(),
					version: "2.0.0",
					currentApiProvider: this.env?.FAX_PROVIDER || 'notifyre',
					supportedApiProviders: ['notifyre'], // Will expand as more providers are added
					features: [
						"send-fax",
						"get-status",
						"webhooks",
						"multi-api-provider-support"
					]
				}
			};
		} catch (error) {
			// Fallback to console if logger isn't initialized
			if (this.logger) {
				this.logger.log('ERROR', 'Error in health check:', error);
			} else {
				console.error('Error in health check:', error);
			}
			return {
				statusCode: 500,
				error: "Health check failed",
				message: error.message
			};
		}
	}

	/**
	 * Health check (authenticated via Supabase)
	 * @param {Request} request
	 * @param {string} caller_env
	 * @param {string} sagContext
	 */
	async healthProtected(request, caller_env, sagContext) {
		try {
			this.env = JSON.parse(caller_env);
			this.initializeLogger(this.env);
			this.logger.log('INFO', 'Protected health check request received');

			// Parse sagContext to extract user info if available
			const context = JSON.parse(sagContext || '{}');

			this.logger.log('INFO', 'Authenticated health check', { user: context.jwtPayload?.sub });

			return {
				statusCode: 200,
				message: "Notifyre Fax service healthy (authenticated)",
				data: {
					service: "notifyre-fax",
					user: context.jwtPayload || null,
					timestamp: new Date().toISOString(),
					version: "2.0.0",
					authenticated: true,
					currentApiProvider: this.env?.FAX_PROVIDER || 'notifyre',
					supportedApiProviders: ['notifyre'], // Will expand as more providers are added
					features: [
						"send-fax",
						"get-status",
						"polling",
						"multi-api-provider-support"
					]
				}
			};
		} catch (error) {
			// Fallback to console if logger isn't initialized
			if (this.logger) {
				this.logger.log('ERROR', 'Error in healthProtected:', error);
			} else {
				console.error('Error in healthProtected:', error);
			}
			return {
				statusCode: 500,
				error: "Authenticated health check failed",
				message: error.message
			};
		}
	}




}
