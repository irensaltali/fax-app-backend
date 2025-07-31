/**
 * Utility functions for the Management Service
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
 * API utilities
 */
export class ApiUtils {
	/**
	 * Sanitize data for logging (remove sensitive information)
	 * @param {Object} data - Data to sanitize
	 * @returns {Object} Sanitized data
	 */
	static sanitizeForLogging(data) {
		if (!data || typeof data !== 'object') {
			return data;
		}

		const sensitiveKeys = ['password', 'token', 'key', 'secret', 'api_key', 'apiKey'];
		const sanitized = { ...data };

		for (const key of sensitiveKeys) {
			if (sanitized[key]) {
				sanitized[key] = '[REDACTED]';
			}
		}

		return sanitized;
	}

	/**
	 * Validate API response
	 * @param {Response} response - Fetch response
	 * @param {string} service - Service name for logging
	 * @param {Logger} logger - Logger instance
	 * @returns {boolean} Whether response is valid
	 */
	static validateApiResponse(response, service, logger) {
		if (!response.ok) {
			logger.log('ERROR', `${service} API request failed`, {
				status: response.status,
				statusText: response.statusText
			});
			return false;
		}
		return true;
	}
}

/**
 * Management utilities
 */
export class ManagementUtils {
	/**
	 * Validate user permissions
	 * @param {Object} user - User object
	 * @param {string} requiredRole - Required role
	 * @returns {boolean} Whether user has permission
	 */
	static hasPermission(user, requiredRole) {
		if (!user || !user.role) {
			return false;
		}
		return user.role === requiredRole || user.role === 'admin';
	}

	/**
	 * Format management response
	 * @param {boolean} success - Whether operation was successful
	 * @param {any} data - Response data
	 * @param {string} message - Response message
	 * @returns {Object} Formatted response
	 */
	static formatResponse(success, data = null, message = '') {
		return {
			success,
			data,
			message,
			timestamp: new Date().toISOString()
		};
	}
} 
