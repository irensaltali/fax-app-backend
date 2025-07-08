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
	WebhookUtils, 
	DatabaseUtils,
	NOTIFYRE_STATUS_MAP 
} from './utils.js';

export default class extends WorkerEntrypoint {
	constructor() {
		super();
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
				Documents: []
			}
		};
		
		this.logger.log('DEBUG', 'Base payload structure created', {
			sendFrom: notifyrePayload.Faxes.SendFrom,
			clientReference: notifyrePayload.Faxes.ClientReference,
			subject: notifyrePayload.Faxes.Subject,
			isHighQuality: notifyrePayload.Faxes.IsHighQuality
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
			clientReference: notifyrePayload.Faxes.ClientReference
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
			
			// Validate API key
			const apiKey = this.env.NOTIFYRE_API_KEY;
			if (!apiKey) {
				this.logger.log('ERROR', 'NOTIFYRE_API_KEY not configured');
				throw new Error('Service configuration error');
			}
			
			this.logger.log('DEBUG', 'API Key configured for sendFax', { 
				hasApiKey: !!apiKey,
				apiKeyLength: apiKey ? apiKey.length : 0,
				apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'none'
			});

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
			
			// Log the API response
			this.logger.log('INFO', 'Received response from Notifyre API', {
				faxId: faxResult.id,
				status: faxResult.status,
				recipientCount: faxResult.recipients ? faxResult.recipients.length : 0,
				pages: faxResult.pages,
				cost: faxResult.cost,
				hasError: !!faxResult.error,
				errorMessage: faxResult.error || faxResult.errorMessage,
				responseKeys: Object.keys(faxResult),
				fullResponse: faxResult
			});

			this.logger.log('INFO', 'Fax submitted successfully', { faxId: faxResult.id });
			
			// Step 5: Return success response
			const responseData = {
				statusCode: 200,
				message: "Fax submitted successfully",
				data: {
					id: faxResult.id,
					status: NOTIFYRE_STATUS_MAP[faxResult.status] || 'unknown',
					originalStatus: faxResult.status,
					message: "Fax has been queued for sending",
					timestamp: new Date().toISOString(),
					recipient: faxResult.recipients?.[0] || 'unknown',
					pages: faxResult.pages || 1,
					cost: faxResult.cost || null,
					notifyreResponse: faxResult
				}
			};
			
			this.logger.log('INFO', 'Returning successful fax response', {
				faxId: responseData.data.id,
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
			
			const apiKey = this.env.NOTIFYRE_API_KEY;
			if (!apiKey) {
				this.logger.log('ERROR', 'NOTIFYRE_API_KEY not configured');
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
				status: NOTIFYRE_STATUS_MAP[faxDetails.status] || 'unknown',
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
	 * List sent faxes
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async listSentFaxes(request, caller_env, sagContext) {
		try {
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			this.initializeLogger(this.env);
			
			this.logger.log('INFO', 'List sent faxes request received');
			
			const apiKey = this.env.NOTIFYRE_API_KEY;
			if (!apiKey) {
				this.logger.log('ERROR', 'NOTIFYRE_API_KEY not configured');
				throw new Error('Service configuration error');
			}

			const url = new URL(request.url);
			const limit = parseInt(url.searchParams.get('limit') || '50');
			const offset = parseInt(url.searchParams.get('offset') || '0');
			const fromDate = url.searchParams.get('fromDate');
			const toDate = url.searchParams.get('toDate');

			// Build request parameters for API
			const params = new URLSearchParams({
				limit: limit.toString(),
				offset: offset.toString()
			});

			if (fromDate) params.append('fromDate', fromDate);
			if (toDate) params.append('toDate', toDate);

			const response = await NotifyreApiUtils.makeRequest(`/fax/sent?${params.toString()}`, 'GET', null, apiKey, this.logger);
			
			// Transform response data
			const transformedData = response.data?.map(fax => ({
				id: fax.id,
				status: NOTIFYRE_STATUS_MAP[fax.status] || 'unknown',
				originalStatus: fax.status,
				recipient: fax.recipients?.[0] || 'unknown',
				pages: fax.pages || 0,
				cost: fax.cost || null,
				sentAt: fax.sentAt || null,
				completedAt: fax.completedAt || null,
				errorMessage: fax.errorMessage || null
			})) || [];
			
			return {
				statusCode: 200,
				message: "Sent faxes retrieved successfully",
				data: {
					faxes: transformedData,
					total: response.total || transformedData.length,
					limit: parseInt(limit),
					offset: parseInt(offset)
				}
			};
			
		} catch (error) {
			this.logger.log('ERROR', 'Error in listSentFaxes:', error);
			return {
				statusCode: 500,
				error: "Failed to retrieve sent faxes",
				message: error.message
			};
		}
	}

	/**
	 * List received faxes
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async listReceivedFaxes(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'List received faxes request received');
			
					this.env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		const apiKey = this.env.NOTIFYRE_API_KEY;
		if (!apiKey) {
			this.log('ERROR', 'NOTIFYRE_API_KEY not configured');
			throw new Error('Service configuration error');
		}

		const url = new URL(request.url);
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const fromDate = url.searchParams.get('fromDate');
		const toDate = url.searchParams.get('toDate');

		// Build request parameters for API
		const params = new URLSearchParams({
			limit: limit.toString(),
			offset: offset.toString()
		});

		if (fromDate) params.append('fromDate', fromDate);
		if (toDate) params.append('toDate', toDate);

		const response = await this.makeNotifyreRequest(`/fax/received?${params.toString()}`, 'GET', null, apiKey);
			
			// Transform response data
			const transformedData = response.data?.map(fax => ({
				id: fax.id,
				sender: fax.sender || 'unknown',
				pages: fax.pages || 0,
				receivedAt: fax.receivedAt || null,
				faxNumber: fax.faxNumber || null,
				fileUrl: fax.fileUrl || null
			})) || [];
			
			return {
				statusCode: 200,
				message: "Received faxes retrieved successfully",
				data: {
					faxes: transformedData,
					total: response.total || transformedData.length,
					limit: parseInt(limit),
					offset: parseInt(offset)
				}
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in listReceivedFaxes:', error);
			return {
				statusCode: 500,
				error: "Failed to retrieve received faxes",
				message: error.message
			};
		}
	}

	/**
	 * Download sent fax
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async downloadSentFax(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Download sent fax request received');
			
					this.env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		const apiKey = this.env.NOTIFYRE_API_KEY;
		if (!apiKey) {
			this.log('ERROR', 'NOTIFYRE_API_KEY not configured');
			throw new Error('Service configuration error');
		}

		const url = new URL(request.url);
		const faxId = url.searchParams.get('id');
		
		if (!faxId) {
			throw new Error('Fax ID is required');
		}

		this.log('INFO', 'Downloading sent fax', { faxId });
		
		// Get fax download via manual API
		const response = await this.makeNotifyreRequest(`/fax/sent/${faxId}/download`, 'GET', null, apiKey);
			
			return {
				statusCode: 200,
				message: "Fax downloaded successfully",
				data: {
					id: faxId,
					fileData: response.fileData, // base64 encoded data
					filename: response.filename || `fax_${faxId}.pdf`,
					mimeType: response.mimeType || 'application/pdf'
				}
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in downloadSentFax:', error);
			return {
				statusCode: 500,
				error: "Failed to download sent fax",
				message: error.message
			};
		}
	}

	/**
	 * Download received fax
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async downloadReceivedFax(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Download received fax request received');
			
					this.env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		const apiKey = this.env.NOTIFYRE_API_KEY;
		if (!apiKey) {
			this.log('ERROR', 'NOTIFYRE_API_KEY not configured');
			throw new Error('Service configuration error');
		}

		const url = new URL(request.url);
		const faxId = url.searchParams.get('id');
		
		if (!faxId) {
			throw new Error('Fax ID is required');
		}

		this.log('INFO', 'Downloading received fax', { faxId });
		
		// Get fax download via manual API
		const response = await this.makeNotifyreRequest(`/fax/received/${faxId}/download`, 'GET', null, apiKey);
			
			return {
				statusCode: 200,
				message: "Received fax downloaded successfully",
				data: {
					id: faxId,
					fileData: response.fileData, // base64 encoded data
					filename: response.filename || `received_fax_${faxId}.pdf`,
					mimeType: response.mimeType || 'application/pdf'
				}
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in downloadReceivedFax:', error);
			return {
				statusCode: 500,
				error: "Failed to download received fax",
				message: error.message
			};
		}
	}

	/**
	 * List fax numbers
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async listFaxNumbers(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'List fax numbers request received');
			
					this.env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		const apiKey = this.env.NOTIFYRE_API_KEY;
		if (!apiKey) {
			this.log('ERROR', 'NOTIFYRE_API_KEY not configured');
			throw new Error('Service configuration error');
		}

		const response = await this.makeNotifyreRequest('/fax/numbers', 'GET', null, apiKey);
			
			return {
				statusCode: 200,
				message: "Fax numbers retrieved successfully",
				data: {
					faxNumbers: response.data || []
				}
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in listFaxNumbers:', error);
			return {
				statusCode: 500,
				error: "Failed to retrieve fax numbers",
				message: error.message
			};
		}
	}

	/**
	 * List cover pages
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async listCoverPages(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'List cover pages request received');
			
					this.env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		const apiKey = this.env.NOTIFYRE_API_KEY;
		if (!apiKey) {
			this.log('ERROR', 'NOTIFYRE_API_KEY not configured');
			throw new Error('Service configuration error');
		}

		const response = await this.makeNotifyreRequest('/fax/cover-pages', 'GET', null, apiKey);
			
			return {
				statusCode: 200,
				message: "Cover pages retrieved successfully",
				data: {
					coverPages: response.data || []
				}
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in listCoverPages:', error);
			return {
				statusCode: 500,
				error: "Failed to retrieve cover pages",
				message: error.message
			};
		}
	}

	/**
	 * Handle Notifyre webhook for fax status updates
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async handleNotifyreWebhook(request, caller_env, sagContext) {
		try {
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			this.initializeLogger(this.env);
			
			this.logger.log('INFO', 'Notifyre webhook received');
			
			// Validate webhook secret/signature if configured
			const webhookSecret = this.env.NOTIFYRE_WEBHOOK_SECRET;
			if (webhookSecret) {
				const signature = request.headers.get('X-Notifyre-Signature');
				if (!await WebhookUtils.verifyNotifyreSignature(request, webhookSecret, signature, this.logger)) {
					this.logger.log('WARN', 'Invalid webhook signature from Notifyre');
					return { error: 'Invalid webhook signature', statusCode: 401 };
				}
			}
			
			// Get webhook payload
			const webhookPayload = await request.json();
			this.logger.log('INFO', 'Processing Notifyre webhook', { 
				event: webhookPayload.event,
				faxId: webhookPayload.data?.id 
			});
			
			// Process the webhook based on event type
			let processedData = null;
			switch (webhookPayload.event) {
				case 'fax.sent':
				case 'fax.delivered':
				case 'fax.failed':
					processedData = {
						id: webhookPayload.data.id,
						status: NOTIFYRE_STATUS_MAP[webhookPayload.data.status] || 'unknown',
						originalStatus: webhookPayload.data.status,
						recipient: webhookPayload.data.recipients?.[0] || 'unknown',
						pages: webhookPayload.data.pages || 0,
						cost: webhookPayload.data.cost || null,
						completedAt: webhookPayload.data.completedAt || new Date().toISOString(),
						errorMessage: webhookPayload.data.errorMessage || null
					};
					break;
					
				case 'fax.received':
					processedData = {
						id: webhookPayload.data.id,
						sender: webhookPayload.data.sender || 'unknown',
						pages: webhookPayload.data.pages || 0,
						receivedAt: webhookPayload.data.receivedAt || new Date().toISOString(),
						faxNumber: webhookPayload.data.faxNumber || null
					};
					break;
					
				default:
					this.logger.log('WARN', 'Unknown webhook event type', { event: webhookPayload.event });
					break;
			}
			
			// Store webhook data in Supabase if needed
			if (processedData && this.env.SUPABASE_URL && this.env.SUPABASE_KEY) {
				try {
					const supabase = DatabaseUtils.getSupabaseClient(this.env);
					const { error } = await supabase
						.from('fax_webhook_events')
						.insert({
							event_type: webhookPayload.event,
							fax_id: processedData.id,
							data: processedData,
							raw_payload: webhookPayload,
							processed_at: new Date().toISOString()
						});
						
					if (error) {
						this.logger.log('ERROR', 'Failed to store webhook event', { error });
					}
				} catch (dbError) {
					this.logger.log('ERROR', 'Database error storing webhook', { error: dbError.message });
				}
			}
			
			const result = {
				id: `webhook_${Date.now()}`,
				status: "processed",
				message: "Notifyre webhook processed successfully",
				timestamp: new Date().toISOString(),
				event: webhookPayload.event,
				data: processedData,
				rawPayload: webhookPayload
			};
			
			this.logger.log('INFO', 'Webhook processed successfully', { webhookId: result.id, event: webhookPayload.event });
			
			return {
				statusCode: 200,
				message: "Webhook processed successfully",
				data: result
			};
			
		} catch (error) {
			this.logger.log('ERROR', 'Error in handleNotifyreWebhook:', error);
			return {
				statusCode: 500,
				error: "Webhook processing failed",
				message: error.message,
				details: error.stack
			};
		}
	}

	/**
	 * Handle Supabase webhook for user creation
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async handleSupabaseWebhookPostUserCreated(request, caller_env, sagContext) {
		try {
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			this.initializeLogger(this.env);
			
			this.logger.log('INFO', 'Supabase user created webhook received');
			
			// Validate webhook secret
			if (!WebhookUtils.validateSupabaseWebhookSecret(request, this.env)) {
				this.logger.log('WARN', 'Invalid webhook secret in Supabase user creation');
				return { error: 'Invalid webhook secret', statusCode: 401 };
			}
			
			// Get webhook payload
			const webhookPayload = await request.json();
			this.logger.log('INFO', 'Processing user creation webhook', { user: webhookPayload.record });
			
			// Process user creation webhook
			const result = {
				id: `webhook_${Date.now()}`,
				status: "processed",
				message: "User creation webhook processed successfully",
				timestamp: new Date().toISOString(),
				user: webhookPayload.record || webhookPayload.user || webhookPayload,
				event: webhookPayload.type || "user.created"
			};
			
			this.logger.log('INFO', 'Webhook processed successfully', { webhookId: result.id });
			
			return {
				statusCode: 200,
				message: "Webhook processed successfully",
				data: result
			};
			
		} catch (error) {
			this.logger.log('ERROR', 'Error in handleSupabaseWebhookPostUserCreated:', error);
			return {
				statusCode: 500,
				error: "Webhook processing failed",
				message: error.message,
				details: error.stack
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
						"list-sent-faxes",
						"list-received-faxes",
						"download-faxes",
						"fax-numbers",
						"cover-pages",
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
						"list-sent-faxes",
						"list-received-faxes",
						"download-faxes",
						"fax-numbers",
						"cover-pages",
						"webhooks"
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
