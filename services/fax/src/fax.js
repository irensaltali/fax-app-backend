/**
 * Fax Service - Compatible with Serverless API Gateway
 * Service binding handlers that receive (request, caller_env, sagContext) parameters
 * Currently using Notifyre API with multi-provider architecture support
 */

import { env, WorkerEntrypoint } from "cloudflare:workers";
import { Logger, FileUtils, ApiUtils } from './utils.js';
import { DatabaseUtils } from './database.js';
import { NotifyreProvider } from './providers/notifyre-provider.js';
import { TelnyxProvider } from './providers/telnyx-provider.js';
import { R2Utils } from './r2-utils.js';

export default class extends WorkerEntrypoint {
	constructor(ctx, env) {
		super(ctx, env);
		this.logger = null;
		this.env = env; // Store the service's own environment
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
	 * Back-compat overload: if only an env object is passed (legacy calls), treat it
	 * as the old signature and derive the provider name from env.FAX_PROVIDER.
	 */
	async createFaxProvider(apiProviderName, env) {
		// Handle legacy signature: createFaxProvider(env)
		if (typeof apiProviderName === 'object' && apiProviderName !== null && !env) {
			env = apiProviderName;
			apiProviderName = env.FAX_PROVIDER || 'notifyre';
		}

		if (typeof apiProviderName !== 'string') {
			throw new Error('Invalid API provider name');
		}

		let apiKey;
		let options = {};

		switch (apiProviderName.toLowerCase()) {
			case 'notifyre':
				apiKey = env.NOTIFYRE_API_KEY;
				break;
			case 'telnyx':
				apiKey = env.TELNYX_API_KEY;
				options = {
					connectionId: env.TELNYX_CONNECTION_ID,
					r2Utils: new R2Utils(this.logger),
					env: env
				};
				break;
			default:
				throw new Error(`Unsupported API provider: ${apiProviderName}`);
		}

		if (!apiKey) {
			throw new Error(`API key not found for ${apiProviderName} provider`);
		}

		// Validate provider-specific configuration
		if (apiProviderName.toLowerCase() === 'telnyx') {
			if (!options.connectionId) {
				throw new Error('TELNYX_CONNECTION_ID is required for Telnyx provider');
			}
			if (!options.r2Utils.validateConfiguration()) {
				throw new Error('R2 configuration is invalid for Telnyx provider');
			}
		}

		this.logger.log('DEBUG', 'Creating fax API provider', { 
			apiProvider: apiProviderName,
			hasApiKey: !!apiKey,
			hasOptions: Object.keys(options).length > 0
		});

		// Instantiate provider directly (factory removed)
		if (apiProviderName.toLowerCase() === 'notifyre') {
			return new NotifyreProvider(apiKey, this.logger);
		}
		if (apiProviderName.toLowerCase() === 'telnyx') {
			return new TelnyxProvider(apiKey, this.logger, options);
		}
		throw new Error(`Unsupported API provider: ${apiProviderName}`);
	}

	/**
	 * Normalises various inputs (case/typos) to canonical provider keys.
	 */
	normaliseProviderName(raw) {
		if (!raw || typeof raw !== 'string') return null;
		const name = raw.trim().toLowerCase();
		if (name === 'telynx') return 'telnyx'; // common typo in wrangler file
		return name;
	}


	/**
	 * Send a fax via configured provider (Notifyre or Telnyx)
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async sendFax(request, caller_env, sagContext) {
		try {
			// Initialize environment and logger
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

			// Step 1: Parse request body first to detect provider parameter
			const requestBody = await this.parseRequestBody(request);

			// Determine provider from query param or body; fallback to env
			let apiProviderName = null;
			const urlObj = new URL(request.url);
			apiProviderName = urlObj.searchParams.get('provider');

			if (!apiProviderName) {
				if (requestBody instanceof FormData) {
					apiProviderName = requestBody.get('provider') || requestBody.get('apiProvider');
				} else if (typeof requestBody === 'object' && requestBody !== null) {
					apiProviderName = requestBody.provider || requestBody.apiProvider;
				}
			}

			if (!apiProviderName) {
				apiProviderName = this.env.FAX_PROVIDER || 'notifyre';
			}

			apiProviderName = this.normaliseProviderName(apiProviderName) || 'notifyre';

			// Step 2: Create and validate fax provider client
			const faxProvider = await this.createFaxProvider(apiProviderName, this.env);

			// Step 3: Prepare fax request from parsed body
			const faxRequest = await this.prepareFaxRequest(requestBody);

			// Step 4: Send fax using provider-specific workflow
			const userId = context.jwtPayload?.sub || context.jwtPayload?.user_id || context.user?.id || null;
			let faxResult;

			if (faxProvider.getProviderName() === 'telnyx') {
				// Telnyx custom workflow: Save to Supabase → Upload to R2 → Send fax
				this.logger.log('INFO', 'Using Telnyx custom workflow', {
					apiProvider: faxProvider.getProviderName(),
					recipientCount: faxRequest.recipients ? faxRequest.recipients.length : 0,
					fileCount: faxRequest.files ? faxRequest.files.length : 0
				});

				faxResult = await faxProvider.sendFaxWithCustomWorkflow(faxRequest, userId);

			} else {
				// Standard workflow for Notifyre and other providers
				this.logger.log('INFO', 'Using standard provider workflow', {
					apiProvider: faxProvider.getProviderName(),
					recipientCount: faxRequest.recipients ? faxRequest.recipients.length : 0,
					fileCount: faxRequest.files ? faxRequest.files.length : 0
				});

				// Build provider payload
				const providerPayload = await faxProvider.buildPayload(faxRequest);

				// Submit via provider API
				faxResult = await faxProvider.sendFax(providerPayload);

				// Save fax record to database for non-Telnyx providers
				await this.saveFaxRecordForStandardWorkflow(faxResult, faxRequest, userId, faxProvider.getProviderName());
			}

			// Validate fax result has required ID
			if (!faxResult.id) {
				this.logger.log('ERROR', 'Fax provider did not return a valid fax ID', {
					apiProvider: faxProvider.getProviderName(),
					result: faxResult
				});
				throw new Error('Fax provider did not return a valid fax ID');
			}

			this.logger.log('INFO', 'Fax submitted successfully', { 
				faxId: faxResult.id, 
				friendlyId: faxResult.friendlyId,
				apiProvider: faxProvider.getProviderName()
			});

			// Step 5: Return success response
			const responseData = {
				statusCode: 200,
				message: "Fax submitted successfully",
				data: {
					id: faxResult.id,
					friendlyId: faxResult.friendlyId,
					status: faxResult.status || 'queued',
					originalStatus: faxResult.originalStatus || 'Submitted',
					message: "Fax is now queued for processing",
					timestamp: new Date().toISOString(),
					recipient: faxRequest.recipients?.[0] || 'unknown',
					pages: 1,
					cost: null,
					apiProvider: faxProvider.getProviderName(),
					providerResponse: faxResult.providerResponse
				}
			};

			this.logger.log('INFO', 'Returning successful fax response', {
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
	 * debug()
	 * Mirrors the Env-Test service debug handler to help troubleshoot
	 * Serverless API Gateway context and environment propagation for the
	 * Fax service.
	 *
	 * @param {Request} request         Fetch Request object
	 * @param {string} caller_env       Stringified environment object from the API Gateway
	 * @param {string} sagContext       Stringified SAG context containing auth data, path params, etc.
	 * @returns {object}                Standard JSON response with parsed debug information
	 */
	async debug(request, caller_env = "{}", sagContext = "{}") {
		// Attempt to parse the incoming JSON strings – fall back to raw strings on failure.
		let callerEnvObj;
		let sagObj;

		try {
			callerEnvObj = JSON.parse(caller_env);
		} catch (err) {
			callerEnvObj = { parseError: err?.message || "Unable to parse caller_env", raw: caller_env };
		}

		try {
			sagObj = JSON.parse(sagContext);
		} catch (err) {
			sagObj = { parseError: err?.message || "Unable to parse sagContext", raw: sagContext };
		}

		// Log both structures for easier debugging in Cloudflare logs.
		console.log("[FAX-SERVICE][DEBUG] Caller Environment:", callerEnvObj);
		console.log("[FAX-SERVICE][DEBUG] SAG Context:", sagObj);
		console.log("[FAX-SERVICE][DEBUG] Service Environment:", this.env);

		// Standard JSON response expected by the gateway → plain object is serialised.
		return {
			statusCode: 200,
			message: "Debug information logged successfully",
			data: {
				callerEnvObj: callerEnvObj,
				sagContext: sagObj,
				env: this.env,
				timestamp: new Date().toISOString()
			}
		};
	}

	/**
	 * Health check (unauthenticated)
	 * @param {Request} request
	 * @param {string} caller_env
	 * @param {string} sagContext
	 */
	async health(request, caller_env, sagContext) {
		try {
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
			const context = JSON.parse(sagContext || '{}');
			this.initializeLogger(this.env);
			this.logger.log('INFO', 'Protected health check request received');

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
						"webhooks",
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

	/**
	 * uploadFilesToR2()
	 * Debug helper endpoint – behaves like sendFax but only uploads the provided
	 * files to the configured R2 bucket and returns their presigned URLs.
	 *
	 * @param {Request} request        Incoming Fetch Request
	 * @param {string} caller_env      Stringified caller environment (from SAG)
	 * @param {string} sagContext      Stringified SAG context (unused, but logged)
	 * @returns {object}               Standard JSON response with uploaded file URLs
	 */
	async uploadFilesToR2(request, caller_env, sagContext) {
		try {
			// Parse and initialise runtime context
			this.initializeLogger(this.env);

			this.logger.log('INFO', 'Upload-to-R2 debug endpoint called', {
				method: request.method,
				url: request.url,
				contentType: request.headers.get('content-type')
			});

			// Step 1: Parse body
			const requestBody = await this.parseRequestBody(request);

			// Step 2: Re-use prepareFaxRequest to leverage existing file extraction logic
			const faxRequest = await this.prepareFaxRequest(requestBody);

			if (!faxRequest.files || faxRequest.files.length === 0) {
				throw new Error('No files provided in request');
			}

			// Step 3: Instantiate R2 utilities
			const r2Utils = new R2Utils(this.logger);

			if (!r2Utils.validateConfiguration()) {
				throw new Error('R2 configuration invalid – check FAX_FILES_BUCKET binding');
			}

			// Step 4: Upload each file and collect URLs
			const uploaded = [];
			for (let i = 0; i < faxRequest.files.length; i++) {
				const file = faxRequest.files[i];
				let buffer;
				let contentType = 'application/pdf';

				if (file instanceof Blob || (file && typeof file.arrayBuffer === 'function')) {
					buffer = await file.arrayBuffer();
					contentType = file.type || contentType;
				} else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
					buffer = file;
				} else {
					this.logger.log('WARN', 'Unsupported file format, attempting to stringify', { index: i });
					buffer = new TextEncoder().encode(String(file));
					contentType = 'text/plain';
				}

				const timestamp = Date.now();
				const filename = `debug/${timestamp}_${i + 1}` + (contentType === 'application/pdf' ? '.pdf' : '');

				const url = await r2Utils.uploadFile(filename, buffer, contentType);
				uploaded.push({ filename, url });
			}

			this.logger.log('INFO', 'Files uploaded to R2 via debug endpoint', { count: uploaded.length });

			return {
				statusCode: 200,
				message: 'Files uploaded successfully',
				data: {
					fileCount: uploaded.length,
					files: uploaded,
					timestamp: new Date().toISOString()
				}
			};

		} catch (error) {
			if (this.logger) {
				this.logger.log('ERROR', 'Upload-to-R2 debug endpoint failed', {
					error: error.message,
					stack: error.stack
				});
			}

			return {
				statusCode: 500,
				error: 'File upload failed',
				message: error.message
			};
		}
	}

	/**
	 * Save fax record for standard workflow (non-Telnyx providers)
	 * @param {object} faxResult - Result from provider
	 * @param {object} faxRequest - Original fax request
	 * @param {string|null} userId - User ID
	 * @param {string} providerName - Provider name
	 * @returns {object} Saved fax record
	 */
	async saveFaxRecordForStandardWorkflow(faxResult, faxRequest, userId, providerName) {
		try {
			this.logger.log('DEBUG', 'Saving fax record for standard workflow', {
				userId: userId || 'anonymous',
				providerName
			});

			// Prepare fax data for database save
			const faxDataForSave = {
				id: faxResult.id,
				status: faxResult.status || 'queued',
				originalStatus: faxResult.originalStatus || 'Submitted',
				recipients: faxRequest.recipients || [],
				senderId: faxRequest.senderId,
				subject: faxRequest.subject || faxRequest.message,
				pages: 1, // Default to 1 page for new submissions
				cost: null, // Cost will be updated via polling
				clientReference: faxRequest.clientReference || 'SendFaxPro',
				sentAt: new Date().toISOString(),
				completedAt: null,
				errorMessage: null,
				providerResponse: faxResult.providerResponse,
				friendlyId: faxResult.friendlyId,
				apiProvider: providerName
			};

			// Save fax record for both authenticated and anonymous users
			const savedFaxRecord = await DatabaseUtils.saveFaxRecord(faxDataForSave, userId, this.env, this.logger);

			this.logger.log('DEBUG', 'Fax record saved successfully', {
				faxId: savedFaxRecord?.id,
				providerName
			});

			return savedFaxRecord;

		} catch (error) {
			this.logger.log('ERROR', 'Failed to save fax record', {
				error: error.message,
				providerName
			});
			// Don't throw error - we don't want to fail the fax submission if database save fails
			return null;
		}
	}

}
