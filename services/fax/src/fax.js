/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

/**
 * Fax Service - Compatible with Serverless API Gateway
 * Service binding handlers that receive (request, caller_env, sagContext) parameters
 * Full Notifyre API Integration
 */

import { createClient } from '@supabase/supabase-js';
import { WorkerEntrypoint } from "cloudflare:workers";

// Initialize logger
const logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

// Notifyre API configuration
const NOTIFYRE_API_BASE_URL = 'https://api.notifyre.com';

// Notifyre fax status mapping
const NOTIFYRE_STATUS_MAP = {
	'Preparing': 'preparing',
	'In Progress': 'in_progress',
	'Successful': 'sent',
	'Failed': 'failed',
	'Failed - Busy': 'failed_busy',
	'Failed - No Answer': 'failed_no_answer',
	'Failed - Check number and try again': 'failed_invalid_number',
	'Failed - Connection not a Fax Machine': 'failed_not_fax_machine',
	'Cancelled': 'cancelled'
};

export default class extends WorkerEntrypoint {
	async fetch(request, env) {
		this.log('INFO', 'Fetch request received');
		return new Response("Hello from Notifyre Fax Service");
	}

	getLogLevel() {
		let level = logLevels[this.env.LOG_LEVEL] || logLevels.DEBUG;
		return level;
	}

	log(level, message, data = '') {
		const currentLogLevel = this.getLogLevel();
		if (logLevels[level] >= currentLogLevel) {
			const timestamp = new Date().toISOString();
			try {
				// Safely log data, handling potential circular references
				if (data && typeof data === 'object') {
					// Create a safe representation of the data
					const safeData = this.createSafeLogData(data);
					console.log(`[${timestamp}] [${level}] ${message}`, safeData);
				} else {
					console.log(`[${timestamp}] [${level}] ${message}`, data);
				}
			} catch (logError) {
				console.log(`[${timestamp}] [${level}] ${message} [LOGGING_ERROR: ${logError.message}]`);
			}
		}
	}

	createSafeLogData(obj, depth = 0, maxDepth = 5) {
		if (depth >= maxDepth) {
			return '[MAX_DEPTH_REACHED]';
		}

		if (obj === null || obj === undefined) {
			return obj;
		}

		if (typeof obj !== 'object') {
			return obj;
		}

		if (obj instanceof Date) {
			return obj.toISOString();
		}

		if (obj instanceof Error) {
			return {
				name: obj.name,
				message: obj.message,
				stack: obj.stack
			};
		}

		if (Array.isArray(obj)) {
			return obj.slice(0, 10).map(item => this.createSafeLogData(item, depth + 1, maxDepth));
		}

		const result = {};
		let count = 0;
		for (const key in obj) {
			if (count >= 20) { // Limit number of properties
				result['...'] = '[MORE_PROPERTIES]';
				break;
			}
			try {
				result[key] = this.createSafeLogData(obj[key], depth + 1, maxDepth);
				count++;
			} catch (error) {
				result[key] = '[CIRCULAR_OR_ERROR]';
			}
		}
		return result;
	}

	/**
	 * Safely convert array buffer to base64 without stack overflow
	 * @param {Uint8Array} uint8Array - The array to convert
	 * @returns {string} Base64 string
	 */
	arrayBufferToBase64(uint8Array) {
		const CHUNK_SIZE = 8192; // Process in chunks to avoid stack overflow
		let binary = '';
		
		for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
			const chunk = uint8Array.slice(i, i + CHUNK_SIZE);
			binary += String.fromCharCode.apply(null, chunk);
		}
		
		return btoa(binary);
	}

	/**
	 * Get Notifyre API headers
	 * @param {string} apiKey - Notifyre API key
	 * @returns {object} Headers for API requests
	 */
	getNotifyreHeaders(apiKey) {
		return {
			'x-api-token': apiKey,
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'User-Agent': 'Notifyre-Fax-Service/2.0.0'
		};
	}

	/**
	 * Make API request to Notifyre
	 * @param {string} endpoint - API endpoint
	 * @param {string} method - HTTP method
	 * @param {object} data - Request data
	 * @param {string} apiKey - API key
	 * @returns {object} API response
	 */
	async makeNotifyreRequest(endpoint, method = 'GET', data = null, apiKey) {
		const url = `${NOTIFYRE_API_BASE_URL}${endpoint}`;
		const options = {
			method,
			headers: this.getNotifyreHeaders(apiKey)
		};

		if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
			if (data instanceof FormData) {
				// Remove Content-Type header for FormData to let browser set it with boundary
				delete options.headers['Content-Type'];
				options.body = data;
			} else {
				// Ensure Content-Type is application/json for JSON payloads
				options.headers['Content-Type'] = 'application/json';
				try {
					options.body = JSON.stringify(data);
				} catch (stringifyError) {
					this.log('ERROR', 'Failed to stringify request data', { error: stringifyError.message });
					throw new Error('Request data serialization failed');
				}
			}
		}

		this.log('DEBUG', 'Making Notifyre API request', { 
			url, 
			method, 
			hasData: !!data,
			hasApiKey: !!apiKey,
			apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
			headers: {
				'x-api-token': apiKey ? apiKey.substring(0, 8) + '...' : 'none',
				'Content-Type': options.headers['Content-Type'],
				'User-Agent': options.headers['User-Agent']
			}
		});

		try {
			const response = await fetch(url, options);
			const responseData = await response.json();

			if (!response.ok) {
				this.log('ERROR', 'Notifyre API error', {
					url,
					status: response.status,
					statusText: response.statusText,
					response: responseData
				});
				throw new Error(`Notifyre API error: ${response.status} ${response.statusText} - URL: ${url}`);
			}

			return responseData;
		} catch (error) {
			this.log('ERROR', 'Notifyre API request failed', { url, error: error.message });
			throw error;
		}
	}

	/**
	 * Send a fax via Notifyre API
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async sendFax(request, caller_env, sagContext) {
		let requestBody = null; // Declare at function scope for error handling access
		
		try {
			this.log('INFO', 'Send fax request received', {
				method: request.method,
				url: request.url,
				hasBody: !!request.body,
				contentType: request.headers.get('content-type'),
				userAgent: request.headers.get('user-agent'),
				authorization: request.headers.get('authorization') ? 'Bearer [REDACTED]' : 'none'
			});
			
			// Parse the stringified parameters back to objects
			this.log('DEBUG', 'Parsing environment and context parameters');
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			this.log('DEBUG', 'Environment and context parsed successfully', {
				hasEnv: !!this.env,
				hasContext: !!context,
				envKeys: this.env ? Object.keys(this.env).filter(key => !key.includes('KEY') && !key.includes('SECRET')) : [],
				contextKeys: context ? Object.keys(context) : []
			});
			
			const apiKey = this.env.NOTIFYRE_API_KEY;
			if (!apiKey) {
				this.log('ERROR', 'NOTIFYRE_API_KEY not configured');
				throw new Error('Service configuration error');
			}
			
			this.log('DEBUG', 'API Key configured for sendFax', { 
				hasApiKey: !!apiKey,
				apiKeyLength: apiKey ? apiKey.length : 0,
				apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'none'
			});

		// Get request body
		this.log('DEBUG', 'Starting request body processing');
		if (request.body) {
			const contentType = request.headers.get('content-type') || '';
			this.log('DEBUG', 'Processing request body', { 
				contentType,
				hasContentLength: !!request.headers.get('content-length'),
				contentLength: request.headers.get('content-length')
			});
			
			if (contentType.includes('multipart/form-data')) {
				this.log('DEBUG', 'Parsing multipart/form-data request');
				requestBody = await request.formData();
				this.log('DEBUG', 'Received FormData request', { 
					formDataKeys: Array.from(requestBody.keys()),
					formDataSize: requestBody.entries ? Array.from(requestBody.entries()).length : 'unknown'
				});
			} else if (contentType.includes('application/json')) {
				this.log('DEBUG', 'Parsing application/json request');
				requestBody = await request.json();
				this.log('DEBUG', 'Received JSON request', { 
					hasRecipient: !!requestBody.recipient,
					hasRecipients: !!requestBody.recipients,
					hasFiles: !!requestBody.files,
					recipientCount: requestBody.recipients ? requestBody.recipients.length : (requestBody.recipient ? 1 : 0),
					fileCount: requestBody.files ? requestBody.files.length : 0,
					hasMessage: !!requestBody.message,
					hasCoverPage: !!requestBody.coverPage,
					coverPageValue: requestBody.coverPage || 'none',
					hasSenderId: !!requestBody.senderId,
					senderIdValue: requestBody.senderId || 'none',
					hasSubject: !!requestBody.subject,
					subjectValue: requestBody.subject || 'none'
				});
			} else {
				this.log('DEBUG', 'Parsing text/plain request');
				requestBody = await request.text();
				this.log('DEBUG', 'Received text request', { bodyLength: requestBody.length });
			}
		} else {
			this.log('DEBUG', 'No request body provided');
		}

		// Prepare fax submission data for SDK
		this.log('DEBUG', 'Starting fax request preparation');
		let faxRequest = {};
		
		// Handle different input formats
		if (requestBody instanceof FormData) {
			this.log('DEBUG', 'Converting FormData to fax request object');
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
			this.log('DEBUG', 'FormData conversion completed', {
				convertedKeys: Object.keys(faxRequest),
				recipientCount: faxRequest.recipients ? faxRequest.recipients.length : 0,
				fileCount: faxRequest.files ? faxRequest.files.length : 0
			});
		} else if (typeof requestBody === 'object' && requestBody !== null) {
			this.log('DEBUG', 'Processing JSON object request body');
			// Handle JSON payload
			const {
				recipient,
				recipients,
				message,
				coverPage,
				files,
				senderId,
				...otherFields
			} = requestBody;

			this.log('DEBUG', 'Extracted JSON payload fields', {
				hasRecipient: !!recipient,
				hasRecipients: !!recipients,
				recipientsType: Array.isArray(recipients) ? 'array' : typeof recipients,
				recipientsLength: Array.isArray(recipients) ? recipients.length : 'not_array',
				hasMessage: !!message,
				messageLength: message ? message.length : 0,
				hasCoverPage: !!coverPage,
				coverPageValue: coverPage,
				hasFiles: !!files,
				filesType: Array.isArray(files) ? 'array' : typeof files,
				filesLength: Array.isArray(files) ? files.length : 'not_array',
				hasSenderId: !!senderId,
				senderIdValue: senderId,
				otherFieldsKeys: Object.keys(otherFields)
			});

			// Add recipient(s)
			if (recipients && Array.isArray(recipients)) {
				faxRequest.recipients = recipients;
				this.log('DEBUG', 'Set recipients from array', { count: recipients.length });
			} else if (recipient) {
				faxRequest.recipients = [recipient];
				this.log('DEBUG', 'Set recipients from single recipient', { recipient: recipient.replace(/\d/g, '*') });
			} else {
				this.log('WARN', 'No recipients provided in request');
			}

			// Add optional fields
			if (message) {
				faxRequest.message = message;
				this.log('DEBUG', 'Set message field', { messageLength: message.length });
			}
			if (coverPage) {
				faxRequest.coverPage = coverPage;
				this.log('DEBUG', 'Set cover page field', { coverPage });
			}
			if (senderId) {
				faxRequest.senderId = senderId;
				this.log('DEBUG', 'Set sender ID field', { senderId: senderId.replace(/\d/g, '*') });
			}

			// Add other fields
			if (Object.keys(otherFields).length > 0) {
				Object.assign(faxRequest, otherFields);
				this.log('DEBUG', 'Added other fields', { otherFieldsKeys: Object.keys(otherFields) });
			}

			// Handle file data (base64 or file paths)
			if (files && Array.isArray(files)) {
				this.log('DEBUG', 'Processing files from JSON payload', { fileCount: files.length });
				faxRequest.files = files.map((file, index) => {
					this.log('DEBUG', `Processing file ${index}`, {
						hasData: !!file.data,
						dataLength: file.data ? file.data.length : 0,
						filename: file.filename || file.name || 'unknown',
						mimeType: file.mimeType || 'unknown'
					});
					
					if (file.data) {
						// Handle base64 data
						try {
							const buffer = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
							const blob = new Blob([buffer], { type: file.mimeType || 'application/pdf' });
							this.log('DEBUG', `File ${index} converted to Blob`, { 
								blobSize: blob.size,
								blobType: blob.type 
							});
							return blob;
						} catch (base64Error) {
							this.log('ERROR', `Failed to decode base64 for file ${index}`, {
								error: base64Error.message,
								dataPreview: file.data ? file.data.substring(0, 50) + '...' : 'none'
							});
							throw new Error(`Invalid base64 data for file ${index}`);
						}
					}
					this.log('DEBUG', `File ${index} used as-is (no data field)`);
					return file;
				});
				this.log('DEBUG', 'All files processed successfully', { processedCount: faxRequest.files.length });
			}
		} else {
			this.log('DEBUG', 'Request body is not a JSON object', { 
				bodyType: typeof requestBody,
				bodyConstructor: requestBody ? requestBody.constructor.name : 'null'
			});
		}
		
		// Log the prepared fax request data (without sensitive content)
		this.log('INFO', 'Prepared fax request for SDK', {
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
		
		// Submit fax via manual API
		this.log('DEBUG', 'Submitting fax request to Notifyre API');
		
		// Prepare Notifyre API payload structure
		this.log('DEBUG', 'Building Notifyre API payload structure');
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
		
		this.log('DEBUG', 'Base payload structure created', {
			sendFrom: notifyrePayload.Faxes.SendFrom,
			clientReference: notifyrePayload.Faxes.ClientReference,
			subject: notifyrePayload.Faxes.Subject,
			isHighQuality: notifyrePayload.Faxes.IsHighQuality
		});
		
		// Add template if cover page is specified
		if (faxRequest.coverPage) {
			notifyrePayload.TemplateName = faxRequest.coverPage;
			this.log('DEBUG', 'Added cover page template to payload', { templateName: faxRequest.coverPage });
		} else {
			this.log('DEBUG', 'No cover page specified, proceeding without template');
		}
		
		// Convert recipients to Notifyre format
		this.log('DEBUG', 'Converting recipients to Notifyre format');
		if (faxRequest.recipients && Array.isArray(faxRequest.recipients)) {
			this.log('DEBUG', 'Processing recipients array', { 
				recipientCount: faxRequest.recipients.length,
				recipients: faxRequest.recipients.map(r => r.replace(/\d/g, '*'))
			});
			
			faxRequest.recipients.forEach((recipient, index) => {
				// Assume all recipients are fax numbers for now
				// Could be enhanced to detect contact IDs vs phone numbers
				notifyrePayload.Faxes.Recipients.push({
					Type: "fax_number",
					Value: recipient
				});
				this.log('DEBUG', `Added recipient ${index}`, { 
					type: "fax_number",
					value: recipient.replace(/\d/g, '*')
				});
			});
			
			this.log('DEBUG', 'All recipients processed', { 
				totalRecipients: notifyrePayload.Faxes.Recipients.length 
			});
		} else {
			this.log('WARN', 'No valid recipients array found', {
				hasRecipients: !!faxRequest.recipients,
				recipientsType: typeof faxRequest.recipients,
				isArray: Array.isArray(faxRequest.recipients)
			});
		}
		
		// Convert files to Notifyre format
		if (faxRequest.files && Array.isArray(faxRequest.files)) {
			this.log('DEBUG', 'Processing files for conversion', { fileCount: faxRequest.files.length });
			
			for (let i = 0; i < faxRequest.files.length; i++) {
				const file = faxRequest.files[i];
				let fileData = null;
				let filename = `document_${i + 1}.pdf`;
				
				try {
					if (file instanceof Blob || file instanceof File) {
						this.log('DEBUG', 'Converting Blob/File to base64', { 
							filename: file.name || filename, 
							size: file.size,
							type: file.type 
						});
						
						// Check file size limit (100MB)
						if (file.size > 100 * 1024 * 1024) {
							this.log('WARN', 'File size exceeds limit', { size: file.size, filename: file.name });
							continue; // Skip this file
						}
						
						// Convert file to base64 safely (avoiding stack overflow)
						const arrayBuffer = await file.arrayBuffer();
						const uint8Array = new Uint8Array(arrayBuffer);
						
						this.log('DEBUG', 'Converting to base64', { arraySize: uint8Array.length });
						
						// Use safer base64 conversion for large files
						fileData = this.arrayBufferToBase64(uint8Array);
						filename = file.name || filename;
						
						this.log('DEBUG', 'Base64 conversion completed', { 
							originalSize: uint8Array.length,
							base64Length: fileData.length 
						});
						
					} else if (file.data) {
						// Already base64 data
						this.log('DEBUG', 'Using existing base64 data', { 
							filename: file.filename || file.name || filename,
							dataLength: file.data.length 
						});
						fileData = file.data;
						filename = file.filename || file.name || filename;
					}
					
					if (fileData) {
						notifyrePayload.Faxes.Documents.push({
							Filename: filename,
							Data: fileData
						});
						this.log('DEBUG', 'Added document to payload', { filename });
					}
				} catch (fileError) {
					this.log('ERROR', 'Error processing file', { 
						fileIndex: i,
						filename: filename,
						error: fileError.message 
					});
					// Continue with other files
				}
			}
		}
		
		this.log('DEBUG', 'Prepared Notifyre payload structure', {
			recipientCount: notifyrePayload.Faxes.Recipients.length,
			documentCount: notifyrePayload.Faxes.Documents.length,
			subject: notifyrePayload.Faxes.Subject,
			hasTemplate: !!notifyrePayload.TemplateName,
			clientReference: notifyrePayload.Faxes.ClientReference
		});
		
		// Log the actual JSON payload (with redacted document data)
		try {
			const payloadForLogging = {
				Faxes: {
					Recipients: notifyrePayload.Faxes.Recipients.map(r => ({
						Type: r.Type,
						Value: r.Value ? r.Value.replace(/\d/g, '*') : r.Value
					})),
					SendFrom: notifyrePayload.Faxes.SendFrom,
					ClientReference: notifyrePayload.Faxes.ClientReference,
					Subject: notifyrePayload.Faxes.Subject,
					IsHighQuality: notifyrePayload.Faxes.IsHighQuality,
					Documents: notifyrePayload.Faxes.Documents.map(doc => ({
						Filename: doc.Filename,
						Data: doc.Data ? `[BASE64_DATA_${doc.Data.length}_CHARS]` : null
					}))
				}
			};
			
			if (notifyrePayload.TemplateName) {
				payloadForLogging.TemplateName = notifyrePayload.TemplateName;
			}
			
			this.log('DEBUG', 'Notifyre API payload', { payload: payloadForLogging });
		} catch (loggingError) {
			this.log('WARN', 'Failed to log payload details', { error: loggingError.message });
		}
		
		this.log('INFO', 'Sending request to Notifyre API', {
			endpoint: '/fax/send',
			method: 'POST',
			hasPayload: !!notifyrePayload,
			recipientCount: notifyrePayload.Faxes.Recipients.length,
			documentCount: notifyrePayload.Faxes.Documents.length,
			hasTemplate: !!notifyrePayload.TemplateName
		});
		
		const faxResult = await this.makeNotifyreRequest('/fax/send', 'POST', notifyrePayload, apiKey);
		
		// Log the API response
		this.log('INFO', 'Received response from Notifyre API', {
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
			
		this.log('INFO', 'Fax submitted successfully', { faxId: faxResult.id });
			
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
			
			this.log('INFO', 'Returning successful fax response', {
				faxId: responseData.data.id,
				status: responseData.data.status,
				recipient: responseData.data.recipient ? responseData.data.recipient.replace(/\d/g, '*') : 'unknown',
				pages: responseData.data.pages,
				cost: responseData.data.cost
			});
			
			return responseData;
			
		} catch (error) {
			this.log('ERROR', 'Error in sendFax', {
				errorMessage: error.message,
				errorStack: error.stack,
				errorName: error.name,
				errorCode: error.code,
				hasRequestBody: !!requestBody,
				requestBodyType: typeof requestBody,
				requestBodyKeys: requestBody && typeof requestBody === 'object' ? Object.keys(requestBody) : 'not_object',
				faxRequestKeys: typeof faxRequest === 'object' ? Object.keys(faxRequest || {}) : 'not_available',
				timestamp: new Date().toISOString()
			});
			
			// Log additional context if available
			if (this.env) {
				this.log('ERROR', 'Environment context during error', {
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
			this.log('INFO', 'Get fax status request received');
			
			// Parse the stringified parameters back to objects
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

		this.log('INFO', 'Checking status for fax', { faxId });
		
		// Get fax details via manual API
		const faxDetails = await this.makeNotifyreRequest(`/fax/sent/${faxId}`, 'GET', null, apiKey);
		
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
			
			this.log('INFO', 'Status retrieved successfully', { faxId, status: statusResult.status });
			
			return {
				statusCode: 200,
				message: "Status retrieved successfully",
				data: statusResult
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in getFaxStatus:', error);
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
			this.log('INFO', 'List sent faxes request received');
			
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

		const response = await this.makeNotifyreRequest(`/fax/sent?${params.toString()}`, 'GET', null, apiKey);
			
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
			this.log('ERROR', 'Error in listSentFaxes:', error);
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
			this.log('INFO', 'Notifyre webhook received');
			
			// Parse the stringified parameters back to objects
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			// Validate webhook secret/signature if configured
			const webhookSecret = this.env.NOTIFYRE_WEBHOOK_SECRET;
			if (webhookSecret) {
				const signature = request.headers.get('X-Notifyre-Signature');
				if (!this.verifyNotifyreWebhookSignature(request, webhookSecret, signature)) {
					this.log('WARN', 'Invalid webhook signature from Notifyre');
					return { error: 'Invalid webhook signature', statusCode: 401 };
				}
			}
			
			// Get webhook payload
			const webhookPayload = await request.json();
			this.log('INFO', 'Processing Notifyre webhook', { 
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
					this.log('WARN', 'Unknown webhook event type', { event: webhookPayload.event });
					break;
			}
			
			// Store webhook data in Supabase if needed
			if (processedData && this.env.SUPABASE_URL && this.env.SUPABASE_KEY) {
				try {
					const supabase = this.getSupabaseClient(this.env);
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
						this.log('ERROR', 'Failed to store webhook event', { error });
					}
				} catch (dbError) {
					this.log('ERROR', 'Database error storing webhook', { error: dbError.message });
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
			
			this.log('INFO', 'Webhook processed successfully', { webhookId: result.id, event: webhookPayload.event });
			
			return {
				statusCode: 200,
				message: "Webhook processed successfully",
				data: result
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in handleNotifyreWebhook:', error);
			return {
				statusCode: 500,
				error: "Webhook processing failed",
				message: error.message,
				details: error.stack
			};
		}
	}

	/**
	 * Verify Notifyre webhook signature
	 * @param {Request} request 
	 * @param {string} webhookSecret 
	 * @param {string} signature 
	 * @returns {boolean}
	 */
	async verifyNotifyreWebhookSignature(request, webhookSecret, signature) {
		if (!signature || !webhookSecret) {
			return false;
		}

		try {
			// Implementation depends on Notifyre's signature method
			// This is a placeholder - check Notifyre docs for exact implementation
			const body = await request.clone().text();
			
			// Typically HMAC-SHA256 based verification
			const encoder = new TextEncoder();
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(webhookSecret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign']
			);
			
			const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
			const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
			
			return signature === expectedSignature;
		} catch (error) {
			this.log('ERROR', 'Error verifying webhook signature', { error: error.message });
			return false;
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
			this.log('INFO', 'Supabase user created webhook received');
			
			// Parse the stringified parameters back to objects
			this.env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			// Validate webhook secret
			if (this.validateSupabaseWebhookSecret(request, caller_env) !== true) {
				this.log('WARN', 'Invalid webhook secret in Supabase user creation');
				return { error: 'Invalid webhook secret', statusCode: 401 };
			}
			
			// Get webhook payload
			const webhookPayload = await request.json();
			this.log('INFO', 'Processing user creation webhook', { user: webhookPayload.record });
			
			// Process user creation webhook
			const result = {
				id: `webhook_${Date.now()}`,
				status: "processed",
				message: "User creation webhook processed successfully",
				timestamp: new Date().toISOString(),
				user: webhookPayload.record || webhookPayload.user || webhookPayload,
				event: webhookPayload.type || "user.created"
			};
			
			this.log('INFO', 'Webhook processed successfully', { webhookId: result.id });
			
			return {
				statusCode: 200,
				message: "Webhook processed successfully",
				data: result
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in handleSupabaseWebhookPostUserCreated:', error);
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
			this.log('INFO', 'Health check request received');
			
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
			this.log('ERROR', 'Error in health check:', error);
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
			this.log('INFO', 'Protected health check request received');
			
			// Parse sagContext to extract user info if available
			const context = JSON.parse(sagContext || '{}');
			
			this.log('INFO', 'Authenticated health check', { user: context.jwtPayload?.sub });

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
			this.log('ERROR', 'Error in healthProtected:', error);
			return {
				statusCode: 500,
				error: "Authenticated health check failed",
				message: error.message
			};
		}
	}

	/**
	 * Validate Supabase webhook secret
	 * @param {Request} request 
	 * @param {string} caller_env 
	 * @returns {boolean}
	 */
	validateSupabaseWebhookSecret(request, caller_env) {
		if (request.headers.get('X-Supabase-Event-Secret') === this.env.SUPABASE_WEBHOOK_SECRET) {
			return true;
		}
		return false;
	}

	/**
	 * Get Supabase client
	 * @param {object} env - Environment variables
	 * @returns {SupabaseClient}
	 */
	getSupabaseClient(env) {
		return createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
	}
}
