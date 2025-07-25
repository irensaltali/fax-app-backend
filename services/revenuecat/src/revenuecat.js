/**
 * RevenueCat Service - Compatible with Serverless API Gateway
 */

import { env, WorkerEntrypoint } from "cloudflare:workers";
import { Logger } from './utils.js';
import { DatabaseUtils } from './database.js';

export default class extends WorkerEntrypoint {
	constructor(ctx, env) {
		super(ctx, env);
		this.logger = null;
		this.env = env;
		this.initializeLogger(this.env);
	}

	async fetch(request, env) {
		return new Response("Hello from RevenueCat Service");
	}

	initializeLogger(env) {
		if (!this.logger) {
			this.logger = new Logger(env);
		}
	}

	async parseRequestBody(request) {
		this.logger.log('DEBUG', 'Starting request body processing');

		if (!request.body) {
			return null;
		}

		const contentType = request.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			const jsonData = await request.json();
			return jsonData;
		} else {
			const textData = await request.text();
			return textData;
		}
	}

	/**
	 * Handle RevenueCat webhooks
	 * @param {Request} request - The incoming request
	 * @param {string} caller_env - Environment variables from the caller
	 * @param {string} sagContext - Serverless API Gateway context
	 * @returns {Promise<Response>}
	 */
	async webhook(request, caller_env, sagContext) {
		try {
			this.logger.log('INFO', 'RevenueCat webhook received');
			// Ensure we have usable objects regardless of whether inputs are strings
			const callerEnvObj = typeof caller_env === 'string' ? JSON.parse(caller_env || '{}') : (caller_env || {});
			const sagContextObj = typeof sagContext === 'string' ? JSON.parse(sagContext || '{}') : (sagContext || {});

			// Parse request body
			const webhookData = await this.parseRequestBody(request);
			if (!webhookData) {
				this.logger.log('ERROR', 'No webhook data received');
				return new Response(JSON.stringify({ error: 'No webhook data received' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			this.logger.log('DEBUG', 'Webhook data received', webhookData);

			// Verify webhook signature if secret is provided
			const webhookSecret = callerEnvObj.REVENUECAT_WEBHOOK_SECRET;
			if (webhookSecret) {
				const authorization = request.headers.get('authorization');
				if (!authorization) {
					this.logger.log('ERROR', 'No authorization header provided');
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				// Direct comparison of webhook secret and authorization header
				if (authorization !== webhookSecret) {
					this.logger.log('ERROR', 'Invalid webhook secret');
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					});
				}
			}

			// Process webhook based on event type
			const eventType = webhookData.event?.type;
			if (!eventType) {
				this.logger.log('ERROR', 'No event type in webhook data');
				return new Response(JSON.stringify({ error: 'Invalid webhook data' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			this.logger.log('INFO', `Processing webhook event: ${eventType}`);

			// Handle different event types
			switch (eventType) {
				case 'INITIAL_PURCHASE':
					await this.handleInitialPurchase(webhookData, callerEnvObj);
					break;
				case 'RENEWAL':
					await this.handleRenewal(webhookData, callerEnvObj);
					break;
				case 'CANCELLATION':
					await this.handleCancellation(webhookData, callerEnvObj);
					break;
				case 'UNCANCELLATION':
					await this.handleUncancellation(webhookData, callerEnvObj);
					break;
				case 'NON_RENEWING_PURCHASE':
					await this.handleNonRenewingPurchase(webhookData, callerEnvObj);
					break;
				case 'EXPIRATION':
					await this.handleExpiration(webhookData, callerEnvObj);
					break;
				case 'BILLING_ISSUE':
					await this.handleBillingIssue(webhookData, callerEnvObj);
					break;
				case 'PRODUCT_CHANGE':
					await this.handleProductChange(webhookData, callerEnvObj);
					break;
				default:
					this.logger.log('WARN', `Unhandled event type: ${eventType}`);
			}

			// Store webhook event in database
			await DatabaseUtils.storeRevenueCatWebhookEvent(webhookData, callerEnvObj, this.logger);

			// Update user subscription status if applicable
			await this.updateUserSubscriptionStatus(webhookData, callerEnvObj);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});

		} catch (error) {
			this.logger.log('ERROR', 'Error processing RevenueCat webhook', error);
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}



	/**
	 * Handle initial purchase events
	 */
	async handleInitialPurchase(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling initial purchase', webhookData.event);
		// Implement initial purchase logic
		// Update user subscription status, grant access to premium features, etc.
	}

	/**
	 * Handle renewal events
	 */
	async handleRenewal(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling renewal', webhookData.event);
		// Implement renewal logic
	}

	/**
	 * Handle cancellation events
	 */
	async handleCancellation(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling cancellation', webhookData.event);
		// Implement cancellation logic
		// Revoke access to premium features, etc.
	}

	/**
	 * Handle uncancellation events
	 */
		async handleUncancellation(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling uncancellation', webhookData.event);
		// Implement uncancellation logic
	}

	/**
	 * Handle non-renewing purchase events
	 */
	async handleNonRenewingPurchase(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling non-renewing purchase', webhookData.event);
		// Implement non-renewing purchase logic
	}

	/**
	 * Handle expiration events
	 */
	async handleExpiration(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling expiration', webhookData.event);
		// Implement expiration logic
	}

	/**
	 * Handle billing issue events
	 */
	async handleBillingIssue(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling billing issue', webhookData.event);
		// Implement billing issue logic
	}

	/**
	 * Handle product change events
	 */
	async handleProductChange(webhookData, callerEnvObj) {
		this.logger.log('INFO', 'Handling product change', webhookData.event);
		// Implement product change logic
	}

	/**
	 * Update user subscription status based on webhook event
	 */
	async updateUserSubscriptionStatus(webhookData, callerEnvObj) {
		try {
			await DatabaseUtils.updateUserSubscriptionStatus(webhookData, callerEnvObj, this.logger);
			this.logger.log('INFO', 'User subscription status updated');
		} catch (error) {
			this.logger.log('ERROR', 'Error updating user subscription status', error);
		}
	}

	/**
	 * Health check endpoint
	 */
	async health(request, caller_env, sagContext) {
		try {
			this.logger.log('INFO', 'Health check requested');

			return new Response(JSON.stringify({
				status: 'healthy',
				service: 'revenuecat',
				callerEnv: JSON.stringify(caller_env),
				sagContext: JSON.stringify(sagContext),
				env: JSON.stringify(this.env),
				timestamp: new Date().toISOString()
			}), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		} catch (error) {
			this.logger.log('ERROR', 'Error in health check', error);
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				error: error.message,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}
} 
