/**
 * Utility functions for the Fax Service
 */

// Logger configuration
const logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

/**
 * Logging utilities
 */
export class Logger {
	constructor(env) {
		this.env = env;
	}

	getLogLevel() {
		let level = logLevels[this.env?.LOG_LEVEL] || logLevels.DEBUG;
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
}

/**
 * File and encoding utilities
 */
export class FileUtils {
	/**
	 * Safely convert array buffer to base64 without stack overflow
	 * @param {Uint8Array} uint8Array - The array to convert
	 * @returns {string} Base64 string
	 */
	static arrayBufferToBase64(uint8Array) {
		const CHUNK_SIZE = 8192; // Process in chunks to avoid stack overflow
		let binary = '';
		
		for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
			const chunk = uint8Array.slice(i, i + CHUNK_SIZE);
			binary += String.fromCharCode.apply(null, chunk);
		}
		
		return btoa(binary);
	}

	/**
	 * Process file for fax submission
	 * @param {File|Blob|Object} file - File to process
	 * @param {number} index - File index for logging
	 * @param {Logger} logger - Logger instance
	 * @returns {Blob|Object} Processed file
	 */
	static async processFileForFax(file, index, logger) {
		let fileData = null;
		let filename = `document_${index + 1}.pdf`;
		
		try {
			if (file instanceof Blob || file instanceof File) {
				logger.log('DEBUG', 'Converting Blob/File to base64', { 
					filename: file.name || filename, 
					size: file.size,
					type: file.type 
				});
				
				// Check file size limit (100MB)
				if (file.size > 100 * 1024 * 1024) {
					logger.log('WARN', 'File size exceeds limit', { size: file.size, filename: file.name });
					return null; // Skip this file
				}
				
				// Convert file to base64 safely (avoiding stack overflow)
				const arrayBuffer = await file.arrayBuffer();
				const uint8Array = new Uint8Array(arrayBuffer);
				
				logger.log('DEBUG', 'Converting to base64', { arraySize: uint8Array.length });
				
				// Use safer base64 conversion for large files
				fileData = this.arrayBufferToBase64(uint8Array);
				filename = file.name || filename;
				
				logger.log('DEBUG', 'Base64 conversion completed', { 
					originalSize: uint8Array.length,
					base64Length: fileData.length 
				});
				
				const blob = new Blob([uint8Array], { type: file.type || 'application/pdf' });
				logger.log('DEBUG', `File ${index} converted to Blob`, { 
					blobSize: blob.size,
					blobType: blob.type 
				});
				return blob;
				
			} else if (file.data) {
				// Already base64 data
				logger.log('DEBUG', 'Using existing base64 data', { 
					filename: file.filename || file.name || filename,
					dataLength: file.data.length 
				});
				fileData = file.data;
				filename = file.filename || file.name || filename;
			}
			
			logger.log('DEBUG', `File ${index} used as-is (no data field)`);
			return file;
		} catch (fileError) {
			logger.log('ERROR', 'Error processing file', { 
				fileIndex: index,
				filename: filename,
				error: fileError.message 
			});
			return null;
		}
	}
}

/**
 * Notifyre API utilities
 */
export class NotifyreApiUtils {
	/**
	 * Get Notifyre API headers
	 * @param {string} apiKey - Notifyre API key
	 * @returns {object} Headers for API requests
	 */
	static getHeaders(apiKey) {
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
	 * @param {Logger} logger - Logger instance
	 * @returns {object} API response
	 */
	static async makeRequest(endpoint, method = 'GET', data = null, apiKey, logger) {
		const NOTIFYRE_API_BASE_URL = 'https://api.notifyre.com';
		const url = `${NOTIFYRE_API_BASE_URL}${endpoint}`;
		const options = {
			method,
			headers: this.getHeaders(apiKey)
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
					logger.log('ERROR', 'Failed to stringify request data', { error: stringifyError.message });
					throw new Error('Request data serialization failed');
				}
			}
		}

		// Log request details with full body (sanitized for sensitive data)
		let requestBodyLog = null;
		if (options.body) {
			if (data instanceof FormData) {
				requestBodyLog = 'FormData object (not logged due to binary content)';
			} else if (typeof data === 'object' && data !== null) {
				// Create a deep copy and sanitize sensitive data
				const sanitizedData = JSON.parse(JSON.stringify(data));
				if (sanitizedData.Faxes?.Documents) {
					sanitizedData.Faxes.Documents = sanitizedData.Faxes.Documents.map((doc, index) => ({
						Filename: doc.Filename,
						Data: doc.Data ? `[BASE64_DATA_${doc.Data.length}_CHARS]` : null
					}));
				}
				requestBodyLog = sanitizedData;
			} else {
				requestBodyLog = options.body;
			}
		}

		logger.log('DEBUG', 'Making Notifyre API request', { 
			url, 
			method, 
			hasData: !!data,
			hasApiKey: !!apiKey,
			apiKeyPrefix: apiKey && typeof apiKey === 'string' ? apiKey.substring(0, 8) + '...' : 'none',
			headers: {
				'x-api-token': apiKey && typeof apiKey === 'string' ? apiKey.substring(0, 8) + '...' : 'none',
				'Content-Type': options.headers['Content-Type'],
				'User-Agent': options.headers['User-Agent']
			},
			requestBody: requestBodyLog
		});

		try {
			const response = await fetch(url, options);
			const responseData = await response.json();

			// Log full response body
			logger.log('DEBUG', 'Notifyre API response received', {
				url,
				status: response.status,
				statusText: response.statusText,
				ok: response.ok,
				headers: {
					'content-type': response.headers?.get ? response.headers.get('content-type') : 'unknown',
					'content-length': response.headers?.get ? response.headers.get('content-length') : 'unknown'
				},
				responseBody: responseData
			});

			if (!response.ok) {
				logger.log('ERROR', 'Notifyre API error', {
					url,
					status: response.status,
					statusText: response.statusText,
					response: responseData
				});
				throw new Error(`Notifyre API error: ${response.status} ${response.statusText} - URL: ${url}`);
			}

			return responseData;
		} catch (error) {
			logger.log('ERROR', 'Notifyre API request failed', { url, error: error.message });
			throw error;
		}
	}
}

/**
 * Webhook utilities
 */
export class WebhookUtils {
	/**
	 * Verify Notifyre webhook signature
	 * @param {Request} request 
	 * @param {string} webhookSecret 
	 * @param {string} signature 
	 * @param {Logger} logger
	 * @returns {boolean}
	 */
	static async verifyNotifyreSignature(request, webhookSecret, signature, logger) {
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
			logger.log('ERROR', 'Error verifying webhook signature', { error: error.message });
			return false;
		}
	}

	/**
	 * Validate Supabase webhook secret
	 * @param {Request} request 
	 * @param {object} env 
	 * @returns {boolean}
	 */
	static validateSupabaseWebhookSecret(request, env) {
		return request.headers.get('X-Supabase-Event-Secret') === env.SUPABASE_WEBHOOK_SECRET;
	}
}



/**
 * Constants and mappings
 */
export const NOTIFYRE_STATUS_MAP = {
	// Initial/Processing States
	'Preparing': 'queued',
	'preparing': 'queued',
	'Queued': 'queued',
	'queued': 'queued',
	'In Progress': 'processing',
	'in progress': 'processing',
	'Processing': 'processing',
	'processing': 'processing',
	'Sending': 'sending',
	'sending': 'sending',
	
	// Success States
	'Successful': 'delivered',
	'successful': 'delivered',
	'Delivered': 'delivered',
	'delivered': 'delivered',
	'Sent': 'delivered', // Additional mapping for fax.sent events
	'sent': 'delivered',
	
	// Receiving States
	'Receiving': 'receiving',
	'receiving': 'receiving',
	'Received': 'delivered', // For received faxes
	'received': 'delivered',
	
	// Failure States
	'Failed': 'failed',
	'failed': 'failed',
	'Failed - Busy': 'busy',
	'failed - busy': 'busy',
	'Failed - No Answer': 'no-answer',
	'failed - no answer': 'no-answer',
	'Failed - Check number and try again': 'failed',
	'failed - check number and try again': 'failed',
	'Failed - Connection not a Fax Machine': 'failed',
	'failed - connection not a fax machine': 'failed',
	
	// Cancellation
	'Cancelled': 'cancelled',
	'cancelled': 'cancelled',
	
	// Additional status codes that may appear in webhooks
	'Completed': 'delivered',
	'completed': 'delivered',
	'Error': 'failed',
	'error': 'failed',
	'Timeout': 'failed',
	'timeout': 'failed',
	'Rejected': 'failed',
	'rejected': 'failed',
	'Aborted': 'cancelled',
	'aborted': 'cancelled'
};

/**
 * Safely map Notifyre status to internal status with fallback
 * @param {string} notifyreStatus - Status from Notifyre API
 * @param {Logger} logger - Logger instance
 * @returns {string} Mapped internal status
 */
export function mapNotifyreStatus(notifyreStatus, logger) {
	if (!notifyreStatus) {
		logger.log('WARN', 'Empty status received from Notifyre API');
		return 'failed';
	}

	const mappedStatus = NOTIFYRE_STATUS_MAP[notifyreStatus];
	
	if (!mappedStatus) {
		logger.log('WARN', 'Unknown status from Notifyre API', {
			notifyreStatus,
			availableMappings: Object.keys(NOTIFYRE_STATUS_MAP)
		});
		// Default to 'failed' for unknown statuses to avoid database enum errors
		return 'failed';
	}

	logger.log('DEBUG', 'Mapped Notifyre status', {
		notifyreStatus,
		mappedStatus
	});

	return mappedStatus;
} 
