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
 */

import { createClient } from '@supabase/supabase-js';
import { WorkerEntrypoint } from "cloudflare:workers";

// Initialize logger
const logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export default class extends WorkerEntrypoint {
	async fetch(request, env) {
		this.log('INFO', 'Fetch request received');
		return new Response("Hello from Fax Service");
	}

	getLogLevel() {
		let level = logLevels[this.env.LOG_LEVEL] || logLevels.DEBUG;
		return level;
	}

	log(level, message, data = '') {
		const currentLogLevel = this.getLogLevel();
		if (logLevels[level] >= currentLogLevel) {
			const timestamp = new Date().toISOString();
			console.log(`[${timestamp}] [${level}] ${message}`, data);
		}
	}

	/**
	 * Send a fax (dummy implementation)
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async sendFax(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Send fax request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			// Get request body if it exists
			let requestBody = null;
			if (request.body) {
				const clonedRequest = request.clone();
				try {
					requestBody = await request.json();
				} catch (e) {
					try {
						requestBody = await clonedRequest.text();
					} catch (textError) {
						requestBody = null;
					}
				}
			}
			
			// Extract URL parameters if any
			const url = new URL(request.url);
			const searchParams = Object.fromEntries(url.searchParams);
			
			// Dummy fax implementation
			const faxResult = {
				id: `fax_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				status: "queued",
				message: "Fax has been queued for sending",
				timestamp: new Date().toISOString(),
				recipient: requestBody?.recipient || "unknown",
				pages: requestBody?.pages || 1,
				requestData: {
					body: requestBody,
					query: searchParams,
					method: request.method,
					headers: Object.fromEntries(request.headers.entries())
				}
			};
			
			this.log('INFO', 'Fax queued successfully', { faxId: faxResult.id });
			
			return {
				statusCode: 200,
				message: "Fax queued successfully",
				data: faxResult
			};
			
		} catch (error) {
			this.log('ERROR', 'Error in sendFax:', error);
			return {
				statusCode: 500,
				error: "Internal server error",
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
			this.log('INFO', 'Supabase user created webhook received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
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
	 * Get fax status
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 */
	async getFaxStatus(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Get fax status request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const url = new URL(request.url);
			const faxId = url.searchParams.get('id') || 'unknown';
			
			this.log('INFO', 'Checking status for fax', { faxId });
			
			// Dummy status check
			const statusResult = {
				id: faxId,
				status: Math.random() > 0.5 ? "sent" : "pending",
				message: "Fax status retrieved",
				timestamp: new Date().toISOString(),
				sentAt: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 3600000).toISOString() : null
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
				message: "Fax service healthy",
				data: {
					service: "fax",
					timestamp: new Date().toISOString(),
					version: "1.0.0"
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
				message: "Fax service healthy (authenticated)",
				data: {
					service: "fax",
					user: context.jwtPayload || null,
					timestamp: new Date().toISOString(),
					version: "1.0.0"
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
		const env = JSON.parse(caller_env);
		if (request.headers.get('X-Supabase-Event-Secret') === env.SUPABASE_WEBHOOK_SECRET) {
			return true;
		}
		return false;
	}

	/**
	 * Get Supabase client
	 * @returns {SupabaseClient}
	 */
	getSupabaseClient() {
		return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_KEY);
	}
}
