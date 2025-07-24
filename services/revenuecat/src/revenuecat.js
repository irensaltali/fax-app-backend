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
	}

	async fetch(request, env) {
		this.initializeLogger(env);
		this.logger.log('INFO', 'Fetch request received');
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
	async webhook(request, caller_env = "{}", sagContext = "{}") {
		try {
			this.logger.log('INFO', 'RevenueCat webhook received');
			
			// Parse caller environment variables
			const callerEnvironment = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
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
			const webhookSecret = callerEnvironment.REVENUECAT_WEBHOOK_SECRET;
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
					await this.handleInitialPurchase(webhookData, callerEnvironment);
					break;
				case 'RENEWAL':
					await this.handleRenewal(webhookData, callerEnvironment);
					break;
				case 'CANCELLATION':
					await this.handleCancellation(webhookData, callerEnvironment);
					break;
				case 'UNCANCELLATION':
					await this.handleUncancellation(webhookData, callerEnvironment);
					break;
				case 'NON_RENEWING_PURCHASE':
					await this.handleNonRenewingPurchase(webhookData, callerEnvironment);
					break;
				case 'EXPIRATION':
					await this.handleExpiration(webhookData, callerEnvironment);
					break;
				case 'BILLING_ISSUE':
					await this.handleBillingIssue(webhookData, callerEnvironment);
					break;
				case 'PRODUCT_CHANGE':
					await this.handleProductChange(webhookData, callerEnvironment);
					break;
				default:
					this.logger.log('WARN', `Unhandled event type: ${eventType}`);
			}

			// Store webhook event in database
			await this.storeWebhookEvent(webhookData, callerEnvironment);

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
	async handleInitialPurchase(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling initial purchase', webhookData.event);
		// Implement initial purchase logic
		// Update user subscription status, grant access to premium features, etc.
	}

	/**
	 * Handle renewal events
	 */
	async handleRenewal(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling renewal', webhookData.event);
		// Implement renewal logic
	}

	/**
	 * Handle cancellation events
	 */
	async handleCancellation(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling cancellation', webhookData.event);
		// Implement cancellation logic
		// Revoke access to premium features, etc.
	}

	/**
	 * Handle uncancellation events
	 */
	async handleUncancellation(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling uncancellation', webhookData.event);
		// Implement uncancellation logic
	}

	/**
	 * Handle non-renewing purchase events
	 */
	async handleNonRenewingPurchase(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling non-renewing purchase', webhookData.event);
		// Implement non-renewing purchase logic
	}

	/**
	 * Handle expiration events
	 */
	async handleExpiration(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling expiration', webhookData.event);
		// Implement expiration logic
	}

	/**
	 * Handle billing issue events
	 */
	async handleBillingIssue(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling billing issue', webhookData.event);
		// Implement billing issue logic
	}

	/**
	 * Handle product change events
	 */
	async handleProductChange(webhookData, callerEnvironment) {
		this.logger.log('INFO', 'Handling product change', webhookData.event);
		// Implement product change logic
	}

	/**
	 * Store webhook event in database
	 */
	async storeWebhookEvent(webhookData, callerEnvironment) {
		try {
			const dbUtils = new DatabaseUtils(this.logger, callerEnvironment);
			await dbUtils.storeRevenueCatWebhookEvent(webhookData);
			this.logger.log('INFO', 'Webhook event stored in database');
		} catch (error) {
			this.logger.log('ERROR', 'Error storing webhook event', error);
		}
	}

	/**
	 * Health check endpoint
	 */
	async health(request, caller_env = "{}", sagContext = "{}") {
		this.initializeLogger(JSON.parse(caller_env));
		this.logger.log('INFO', 'Health check requested');
		
		return new Response(JSON.stringify({
			status: 'healthy',
			service: 'revenuecat',
			timestamp: new Date().toISOString()
		}), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	/**
	 * Protected health check endpoint
	 */
	async healthProtected(request, caller_env = "{}", sagContext = "{}") {
		this.initializeLogger(JSON.parse(caller_env));
		this.logger.log('INFO', 'Protected health check requested');
		
		return new Response(JSON.stringify({
			status: 'healthy',
			service: 'revenuecat',
			authenticated: true,
			timestamp: new Date().toISOString()
		}), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}
} 
