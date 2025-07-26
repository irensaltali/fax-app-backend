/**
 * Utility functions for the RevenueCat Service
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
 * RevenueCat webhook utilities
 */
export class RevenueCatUtils {
	/**
	 * Validate RevenueCat webhook data structure
	 * @param {Object} webhookData - The webhook data to validate
	 * @returns {boolean} - Whether the data is valid
	 */
	static validateWebhookData(webhookData) {
		if (!webhookData || typeof webhookData !== 'object') {
			return false;
		}

		// Check for required fields
		if (!webhookData.event || typeof webhookData.event !== 'object') {
			return false;
		}

		if (!webhookData.event.type || typeof webhookData.event.type !== 'string') {
			return false;
		}

		return true;
	}

	/**
	 * Extract user information from webhook data
	 * @param {Object} webhookData - The webhook data
	 * @returns {Object|null} - User information or null if not found
	 */
	static extractUserInfo(webhookData) {
		if (!webhookData || !webhookData.event) {
			return null;
		}

		const event = webhookData.event;
		return {
			userId: event.original_app_user_id,
			productId: event.product_id,
			periodType: event.period_type,
			purchasedAt: event.purchased_at_ms,
			expiresAt: event.expires_at_ms,
			environment: event.environment,
			store: event.store
		};
	}

	/**
	 * Extract subscription information from webhook data
	 * @param {Object} webhookData - The webhook data
	 * @returns {Object|null} - Subscription information or null if not found
	 */
	static extractSubscriptionInfo(webhookData) {
		if (!webhookData || !webhookData.event) {
			return null;
		}

		const event = webhookData.event;
		
		// Handle entitlement_id - check both single value and array
		let entitlementId = null;
		if (event.entitlement_id) {
			entitlementId = event.entitlement_id;
		} else if (event.entitlement_ids && Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0) {
			entitlementId = event.entitlement_ids[0]; // Use first entitlement_id from array
		}

		return {
			entitlementId: entitlementId,
			productId: event.product_id,
			periodType: event.period_type,
			purchasedAt: event.purchased_at_ms,
			expiresAt: event.expires_at_ms,
			isTrialConversion: event.is_trial_conversion || false,
			store: event.store,
			environment: event.environment
		};
	}

	/**
	 * Get subscription status based on event type
	 * @param {string} eventType - The event type
	 * @returns {string} - The subscription status
	 */
	static getSubscriptionStatus(eventType) {
		switch (eventType) {
			case 'INITIAL_PURCHASE':
			case 'RENEWAL':
			case 'UNCANCELLATION':
				return 'active';
			case 'CANCELLATION':
				return 'cancelled';
			case 'EXPIRATION':
				return 'expired';
			case 'BILLING_ISSUE':
				return 'billing_issue';
			default:
				return 'unknown';
		}
	}

	/**
	 * Sanitize webhook data for logging
	 * @param {Object} webhookData - The webhook data to sanitize
	 * @returns {Object} - Sanitized webhook data
	 */
	static sanitizeForLogging(webhookData) {
		if (!webhookData) {
			return webhookData;
		}

		const sanitized = { ...webhookData };
		
		// Remove sensitive information
		if (sanitized.event) {
			const event = { ...sanitized.event };
			
			// Remove or mask sensitive fields
			if (event.app_user_id) {
				event.app_user_id = event.app_user_id.substring(0, 8) + '...';
			}
			
			if (event.original_app_user_id) {
				event.original_app_user_id = event.original_app_user_id.substring(0, 8) + '...';
			}

			sanitized.event = event;
		}

		return sanitized;
	}
}

/**
 * API utilities for RevenueCat service
 */
export class ApiUtils {
	/**
	 * Create a standardized API response
	 * @param {boolean} success - Whether the operation was successful
	 * @param {Object} data - Response data
	 * @param {string} message - Response message
	 * @param {number} statusCode - HTTP status code
	 * @returns {Response} - The API response
	 */
	static createResponse(success, data = null, message = '', statusCode = 200) {
		const response = {
			success,
			timestamp: new Date().toISOString()
		};

		if (data) {
			response.data = data;
		}

		if (message) {
			response.message = message;
		}

		return new Response(JSON.stringify(response), {
			status: statusCode,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	/**
	 * Create an error response
	 * @param {string} message - Error message
	 * @param {number} statusCode - HTTP status code
	 * @param {Object} details - Additional error details
	 * @returns {Response} - The error response
	 */
	static createErrorResponse(message, statusCode = 500, details = null) {
		const response = {
			success: false,
			error: message,
			timestamp: new Date().toISOString()
		};

		if (details) {
			response.details = details;
		}

		return new Response(JSON.stringify(response), {
			status: statusCode,
			headers: { 'Content-Type': 'application/json' }
		});
	}
} 
