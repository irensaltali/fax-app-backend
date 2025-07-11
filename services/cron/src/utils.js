/**
 * Logger utility for cron service
 */
export class Logger {
	constructor(env) {
		this.logLevel = env.LOG_LEVEL || 'INFO';
		this.environment = env.ENVIRONMENT || 'development';
	}

	log(level, message, data = {}) {
		const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
		const currentLevel = levels[this.logLevel] || 1;
		const messageLevel = levels[level] || 1;

		if (messageLevel >= currentLevel) {
			const timestamp = new Date().toISOString();
			const logEntry = {
				timestamp,
				level,
				message,
				data,
				environment: this.environment,
				service: 'cron'
			};
			console.log(JSON.stringify(logEntry));
		}
	}
}

/**
 * Notifyre API utilities for cron jobs
 */
export class NotifyreApiUtils {
	/**
	 * Make HTTP request to Notifyre API
	 * @param {string} endpoint - API endpoint
	 * @param {string} method - HTTP method
	 * @param {object|null} body - Request body
	 * @param {string} apiKey - Notifyre API key
	 * @param {Logger} logger - Logger instance
	 * @returns {Promise<object>} API response
	 */
	static async makeRequest(endpoint, method = 'GET', body = null, apiKey, logger) {
		const baseUrl = 'https://api.notifyre.com';
		const url = `${baseUrl}${endpoint}`;

		const options = {
			method,
			headers: {
				'x-api-token': apiKey,
				'Content-Type': 'application/json',
				'User-Agent': 'SendFaxPro-CronService/1.0'
			}
		};

		if (body && method !== 'GET') {
			options.body = JSON.stringify(body);
		}

		logger.log('DEBUG', 'Making Notifyre API request', {
			url: url.replace(apiKey, '[REDACTED]'),
			method,
			hasBody: !!body
		});

		try {
			const response = await fetch(url, options);
			const responseData = await response.json();

			if (!response.ok) {
				logger.log('ERROR', 'Notifyre API error', {
					status: response.status,
					statusText: response.statusText,
					error: responseData
				});
				throw new Error(`Notifyre API error: ${response.status} ${response.statusText}`);
			}

			logger.log('DEBUG', 'Notifyre API response received', {
				status: response.status,
				hasData: !!responseData
			});

			return responseData;
		} catch (error) {
			logger.log('ERROR', 'Failed to make Notifyre API request', {
				error: error.message,
				endpoint,
				method
			});
			throw error;
		}
	}

	/**
	 * Get faxes from Notifyre API for the last 12 hours
	 * @param {string} apiKey - Notifyre API key
	 * @param {Logger} logger - Logger instance
	 * @returns {Promise<Array>} Array of fax objects
	 */
	static async getFaxesFromLast12Hours(apiKey, logger) {
		try {
			// Calculate 12 hours ago and current time as Unix timestamps
			const now = new Date();
			const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));
			
			const fromDate = Math.floor(twelveHoursAgo.getTime() / 1000); // Unix timestamp
			const toDate = Math.floor(now.getTime() / 1000); // Unix timestamp

			logger.log('DEBUG', 'Getting faxes from Notifyre API', {
				fromDate,
				toDate,
				fromDateISO: twelveHoursAgo.toISOString(),
				toDateISO: now.toISOString(),
				timeRange: '12 hours'
			});

			// Call Notifyre API to get faxes from last 12 hours using the new format
			const endpoint = `/fax/send?sort=desc&fromDate=${fromDate}&toDate=${toDate}&skip=0&limit=1000`;
			const response = await this.makeRequest(endpoint, 'GET', null, apiKey, logger);

			// Handle different response formats
			let faxes = [];
			if (response.data && Array.isArray(response.data)) {
				faxes = response.data;
			} else if (Array.isArray(response)) {
				faxes = response;
			} else {
				logger.log('WARN', 'Unexpected response format from Notifyre API', {
					responseKeys: Object.keys(response || {}),
					hasData: !!response.data
				});
				faxes = [];
			}

			logger.log('INFO', 'Retrieved faxes from Notifyre API', {
				faxCount: faxes.length,
				fromDate,
				toDate,
				endpoint
			});

			return faxes;
		} catch (error) {
			logger.log('ERROR', 'Failed to get faxes from Notifyre API', {
				error: error.message,
				stack: error.stack
			});
			throw error;
		}
	}
}

/**
 * Status mapping from Notifyre to internal status
 */
export const NOTIFYRE_STATUS_MAP = {
	// Initial/Processing States
	'Preparing': 'queued',
	'Queued': 'queued',
	'In Progress': 'processing',
	'Processing': 'processing',
	'Sending': 'sending',
	
	// Success States
	'Successful': 'delivered',
	'Delivered': 'delivered',
	'Sent': 'delivered', // Additional mapping for fax.sent events
	
	// Receiving States
	'Receiving': 'receiving',
	'Received': 'delivered', // For received faxes
	
	// Failure States
	'Failed': 'failed',
	'Failed - Busy': 'busy',
	'Failed - No Answer': 'no-answer',
	'Failed - Check number and try again': 'failed',
	'Failed - Connection not a Fax Machine': 'failed',
	
	// Cancellation
	'Cancelled': 'cancelled',
	
	// Additional status codes that may appear in webhooks
	'Retry': 'retrying',
	'Completed': 'delivered',
	'Error': 'failed',
	'Timeout': 'failed',
	'Rejected': 'failed',
	'Aborted': 'cancelled'
};

/**
 * Database utilities for cron jobs
 */
export class DatabaseUtils {
	/**
	 * Create Supabase admin client
	 * @param {object} env - Environment variables
	 * @param {Logger} logger - Logger instance
	 * @returns {object} Supabase client
	 */
	static getSupabaseAdminClient(env, logger) {
		const { createClient } = require('@supabase/supabase-js');
		
		if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
			logger.log('ERROR', 'Missing Supabase configuration');
			throw new Error('Supabase configuration missing');
		}

		return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
	}

	/**
	 * Update fax record in database
	 * @param {string} faxId - Fax ID
	 * @param {object} updateData - Data to update
	 * @param {object} env - Environment variables
	 * @param {Logger} logger - Logger instance
	 * @returns {Promise<object|null>} Updated record or null
	 */
	static async updateFaxRecord(faxId, updateData, env, logger) {
		try {
			const supabase = DatabaseUtils.getSupabaseAdminClient(env, logger);

			logger.log('DEBUG', 'Updating fax record', {
				faxId,
				updateFields: Object.keys(updateData)
			});

			const { data, error } = await supabase
				.from('faxes')
				.update({
					...updateData,
					updated_at: new Date().toISOString()
				})
				.eq('notifyre_fax_id', faxId)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to update fax record', {
					faxId,
					error: error.message
				});
				return null;
			}

			logger.log('DEBUG', 'Successfully updated fax record', {
				faxId,
				recordId: data?.id
			});

			return data;
		} catch (error) {
			logger.log('ERROR', 'Error updating fax record', {
				faxId,
				error: error.message
			});
			return null;
		}
	}
} 
