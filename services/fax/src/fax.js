/**
 * Fax Service - Compatible with Serverless API Gateway
 * Service binding handlers that receive (request, caller_env, sagContext) parameters
 * Full Notifyre API Integration
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import {
	Logger,
	FileUtils,
	NotifyreApiUtils,
	NOTIFYRE_STATUS_MAP,
	mapNotifyreStatus
} from './utils.js';
import { DatabaseUtils } from './database.js';

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
	 * Build Notifyre API payload structure
	 * @param {object} faxRequest - Prepared fax request
	 * @returns {object} Notifyre API payload
	 */
	async buildNotifyrePayload(faxRequest) {
		this.logger.log('DEBUG', 'Building Notifyre API payload structure');

		const notifyrePayload = {
			Faxes: {
				Recipients: [],
				SendFrom: faxRequest.senderId || "",
				ClientReference: faxRequest.clientReference || "SendFaxPro",
				Subject: faxRequest.subject || faxRequest.message || "Fax Document",
				IsHighQuality: faxRequest.isHighQuality || false,
				CoverPage: false,
				Documents: []
			}
		};

		this.logger.log('DEBUG', 'Base payload structure created', {
			sendFrom: notifyrePayload.Faxes.SendFrom,
			clientReference: notifyrePayload.Faxes.ClientReference,
			subject: notifyrePayload.Faxes.Subject,
			isHighQuality: notifyrePayload.Faxes.IsHighQuality,
			coverPage: notifyrePayload.Faxes.CoverPage
		});

		// Always add TestCoverPage template to every fax request
		notifyrePayload.TemplateName = "TestCoverPage";
		this.logger.log('DEBUG', 'Added default cover page template to payload', { templateName: "TestCoverPage" });

		// Override with custom template if cover page is specified
		if (faxRequest.coverPage) {
			notifyrePayload.TemplateName = faxRequest.coverPage;
			this.logger.log('DEBUG', 'Overrode with custom cover page template', { templateName: faxRequest.coverPage });
		}

		// Convert recipients to Notifyre format
		if (faxRequest.recipients && Array.isArray(faxRequest.recipients)) {
			faxRequest.recipients.forEach((recipient, index) => {
				notifyrePayload.Faxes.Recipients.push({
					Type: "fax_number",
					Value: recipient
				});
				this.logger.log('DEBUG', `Added recipient ${index}`, {
					type: "fax_number",
					value: recipient.replace(/\d/g, '*')
				});
			});
		}

		// Convert files to Notifyre format
		if (faxRequest.files && Array.isArray(faxRequest.files)) {
			this.logger.log('DEBUG', 'Processing files for conversion', { fileCount: faxRequest.files.length });

			for (let i = 0; i < faxRequest.files.length; i++) {
				const file = faxRequest.files[i];
				let filename = `document_${i + 1}.pdf`;

				try {
					if (file instanceof Blob || file instanceof File) {
						// Check file size limit (100MB)
						if (file.size > 100 * 1024 * 1024) {
							this.logger.log('WARN', 'File size exceeds limit', { size: file.size, filename: file.name });
							continue;
						}

						// Convert file to base64 safely
						const arrayBuffer = await file.arrayBuffer();
						const uint8Array = new Uint8Array(arrayBuffer);
						const fileData = FileUtils.arrayBufferToBase64(uint8Array);
						filename = file.name || filename;

						notifyrePayload.Faxes.Documents.push({
							Filename: filename,
							Data: fileData
						});

						this.logger.log('DEBUG', 'Added document to payload', { filename });
					} else if (file.data) {
						// Already base64 data
						notifyrePayload.Faxes.Documents.push({
							Filename: file.filename || file.name || filename,
							Data: file.data
						});

						this.logger.log('DEBUG', 'Added base64 document to payload', { filename });
					}
				} catch (fileError) {
					this.logger.log('ERROR', 'Error processing file', {
						fileIndex: i,
						filename: filename,
						error: fileError.message
					});
				}
			}
		}

		this.logger.log('DEBUG', 'Prepared Notifyre payload structure', {
			recipientCount: notifyrePayload.Faxes.Recipients.length,
			documentCount: notifyrePayload.Faxes.Documents.length,
			subject: notifyrePayload.Faxes.Subject,
			hasTemplate: !!notifyrePayload.TemplateName,
			clientReference: notifyrePayload.Faxes.ClientReference,
			coverPage: notifyrePayload.Faxes.CoverPage
		});

		return notifyrePayload;
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

			// Validate API key from Secrets Store
			const apiKey = await this.env.NOTIFYRE_API_KEY;
			if (!apiKey) {
				this.logger.log('ERROR', 'NOTIFYRE_API_KEY not configured in secrets store or environment');
				throw new Error('Service configuration error');
			}

			// Step 1: Parse request body  
			const requestBody = await this.parseRequestBody(request);

			// Step 2: Prepare fax request from parsed body
			const faxRequest = await this.prepareFaxRequest(requestBody);

			// Step 3: Build Notifyre API payload
			const notifyrePayload = await this.buildNotifyrePayload(faxRequest);

			// Step 4: Submit to Notifyre API
			this.logger.log('INFO', 'Sending request to Notifyre API', {
				endpoint: '/fax/send',
				method: 'POST',
				hasPayload: !!notifyrePayload,
				recipientCount: notifyrePayload.Faxes.Recipients.length,
				documentCount: notifyrePayload.Faxes.Documents.length,
				hasTemplate: !!notifyrePayload.TemplateName
			});

			const faxResult = await NotifyreApiUtils.makeRequest('/fax/send', 'POST', notifyrePayload, apiKey, this.logger);

			// Extract fax ID from the actual API response structure
			const faxId = faxResult?.payload?.faxID || faxResult?.id;
			const friendlyId = faxResult?.payload?.friendlyID;

			// Log the API response
			this.logger.log('INFO', 'Received response from Notifyre API', {
				faxId: faxId,
				friendlyId: friendlyId,
				success: faxResult?.success,
				statusCode: faxResult?.statusCode,
				message: faxResult?.message,
				hasErrors: faxResult?.errors?.length > 0,
				responseKeys: Object.keys(faxResult || {}),
				fullResponse: faxResult
			});

			// Validate fax result has required ID
			if (!faxId) {
				this.logger.log('ERROR', 'Notifyre API response missing fax ID', {
					faxResult: faxResult,
					hasId: !!faxId,
					hasPayload: !!faxResult?.payload,
					payloadKeys: faxResult?.payload ? Object.keys(faxResult.payload) : [],
					responseKeys: Object.keys(faxResult || {})
				});
				throw new Error('Notifyre API did not return a valid fax ID');
			}

			this.logger.log('INFO', 'Fax submitted successfully', { faxId: faxId, friendlyId: friendlyId });

			// Step 5: Save fax record to database
			let savedFaxRecord = null;
			const userId = context.jwtPayload?.sub || context.jwtPayload?.user_id || context.user?.id || null;
			const isAnonymous = !userId;

			this.logger.log('DEBUG', 'Processing fax record save', {
				userId: userId || 'anonymous',
				isAnonymous
			});

			// Prepare fax data for database save (for both authenticated and anonymous users)
			const faxDataForSave = {
				id: faxId,
				status: 'queued', // Fax is queued for processing after successful submission
				originalStatus: 'Submitted',
				recipients: faxRequest.recipients || [],
				senderId: faxRequest.senderId,
				subject: faxRequest.subject || faxRequest.message,
				pages: 1, // Default to 1 page for new submissions
				cost: null, // Cost will be updated via polling
				clientReference: faxRequest.clientReference || 'SendFaxPro',
				sentAt: new Date().toISOString(),
				completedAt: null,
				errorMessage: faxResult?.errors?.length > 0 ? faxResult.errors.join(', ') : null,
				notifyreResponse: faxResult,
				friendlyId: friendlyId
			};

			// Save fax record for both authenticated and anonymous users
			savedFaxRecord = await DatabaseUtils.saveFaxRecord(faxDataForSave, userId, this.env, this.logger);

			// Step 6: Return success response
			const responseData = {
				statusCode: 200,
				message: "Fax submitted successfully",
				data: {
					id: faxId,
					friendlyId: friendlyId,
					status: 'queued',
					originalStatus: 'Submitted',
					message: "Fax is now queued for processing",
					timestamp: new Date().toISOString(),
					recipient: faxRequest.recipients?.[0] || 'unknown',
					pages: 1,
					cost: null,
					notifyreResponse: faxResult
				}
			};

			this.logger.log('INFO', 'Returning successful fax response', {
				faxId: responseData.data.id,
				friendlyId: responseData.data.friendlyId,
				status: responseData.data.status,
				recipient: responseData.data.recipient ? responseData.data.recipient.replace(/\d/g, '*') : 'unknown',
				pages: responseData.data.pages,
				cost: responseData.data.cost
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
					hasNotifyreApiKey: !!this.env.NOTIFYRE_API_KEY,
					logLevel: this.env.LOG_LEVEL || 'not_set',
					envKeys: Object.keys(this.env).filter(key => !key.includes('KEY') && !key.includes('SECRET'))
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
	 * Get fax status from Notifyre
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

			const apiKey = await this.env.NOTIFYRE_API_KEY;
			if (!apiKey) {
				this.logger.log('ERROR', 'NOTIFYRE_API_KEY not configured in secrets store or environment');
				throw new Error('Service configuration error');
			}

			const url = new URL(request.url);
			const faxId = url.searchParams.get('id');

			if (!faxId) {
				throw new Error('Fax ID is required');
			}

			this.logger.log('INFO', 'Checking status for fax', { faxId });

			// Get fax details via Notifyre API
			const faxDetails = await NotifyreApiUtils.makeRequest(`/fax/sent/${faxId}`, 'GET', null, apiKey, this.logger);

			if (!faxDetails) {
				throw new Error('Fax not found');
			}

			const statusResult = {
				id: faxDetails.id,
				status: mapNotifyreStatus(faxDetails.status, this.logger),
				originalStatus: faxDetails.status,
				message: "Fax status retrieved",
				timestamp: new Date().toISOString(),
				recipient: faxDetails.recipients?.[0] || 'unknown',
				pages: faxDetails.pages || 0,
				cost: faxDetails.cost || null,
				sentAt: faxDetails.sentAt || null,
				completedAt: faxDetails.completedAt || null,
				errorMessage: faxDetails.errorMessage || null,
				notifyreResponse: faxDetails
			};

			this.logger.log('INFO', 'Status retrieved successfully', { faxId, status: statusResult.status });

			return {
				statusCode: 200,
				message: "Status retrieved successfully",
				data: statusResult
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
					features: [
						"send-fax",
						"get-status",
						"webhooks"
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
					features: [
						"send-fax",
						"get-status",
						"polling"
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
