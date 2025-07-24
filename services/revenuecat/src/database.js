/**
 * Database utilities for RevenueCat service
 */

import { createClient } from '@supabase/supabase-js';

export class DatabaseUtils {
	constructor(logger, callerEnvironment) {
		this.logger = logger;
		this.callerEnvironment = callerEnvironment;
	}

	static getSupabaseAdminClient(env) {
		if (!env.SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for backend operations');
		}
		
		console.log(`[DatabaseUtils] Creating Supabase admin client - Using SERVICE_ROLE key (RLS BYPASSED - Admin Access)`);
		
		return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
	}

	/**
	 * Store RevenueCat webhook event in database
	 * @param {Object} webhookData - The webhook data to store
	 * @returns {Promise<Object|null>} - The stored webhook event or null if failed
	 */
	async storeRevenueCatWebhookEvent(webhookData) {
		try {
			if (!this.callerEnvironment.SUPABASE_URL || !this.callerEnvironment.SUPABASE_SERVICE_ROLE_KEY) {
				this.logger.log('WARN', 'Supabase not configured, skipping webhook event storage');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(this.callerEnvironment);

			// Extract relevant information from webhook data
			const event = webhookData.event || {};
			const user = webhookData.user || {};
			const product = webhookData.product || {};

			const webhookRecord = {
				event_type: event.type,
				event_id: event.id,
				user_id: event.app_user_id || event.original_app_user_id,
				product_id: event.product_id,
				subscription_id: event.subscription_id,
				entitlement_id: event.entitlement_id,
				period_type: event.period_type,
				purchased_at: event.purchased_at_ms ? new Date(parseInt(event.purchased_at_ms)).toISOString() : null,
				expires_at: event.expires_at_ms ? new Date(parseInt(event.expires_at_ms)).toISOString() : null,
				environment: event.environment,
				store: event.store,
				is_trial_conversion: event.is_trial_conversion || false,
				price: event.price,
				currency: event.currency,
				country_code: event.country_code,
				app_id: event.app_id,
				original_app_user_id: event.original_app_user_id,
				aliases: user.aliases || [],
				attributes: user.attributes || {},
				product_identifier: product.product_identifier,
				product_title: product.title,
				product_description: product.description,
				raw_data: webhookData,
				processed_at: new Date().toISOString()
			};

			this.logger.log('DEBUG', 'Storing RevenueCat webhook event', {
				eventType: webhookRecord.event_type,
				userId: webhookRecord.user_id,
				productId: webhookRecord.product_id
			});

			const { data: storedEvent, error } = await supabase
				.from('revenuecat_webhook_events')
				.insert(webhookRecord)
				.select()
				.single();

			if (error) {
				this.logger.log('ERROR', 'Failed to store RevenueCat webhook event', {
					error: error.message,
					code: error.code,
					eventType: webhookRecord.event_type
				});
				throw error;
			}

			this.logger.log('INFO', 'RevenueCat webhook event stored successfully', {
				eventId: storedEvent.id,
				eventType: storedEvent.event_type,
				userId: storedEvent.user_id
			});

			return storedEvent;
		} catch (error) {
			this.logger.log('ERROR', 'Error storing RevenueCat webhook event', {
				error: error.message,
				eventType: webhookData?.event?.type
			});
			return null;
		}
	}

	/**
	 * Update user subscription status based on webhook event
	 * @param {Object} webhookData - The webhook data
	 * @returns {Promise<Object|null>} - The updated user record or null if failed
	 */
	async updateUserSubscriptionStatus(webhookData) {
		try {
			if (!this.callerEnvironment.SUPABASE_URL || !this.callerEnvironment.SUPABASE_SERVICE_ROLE_KEY) {
				this.logger.log('WARN', 'Supabase not configured, skipping user subscription update');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(this.callerEnvironment);
			const event = webhookData.event || {};

			if (!event.app_user_id) {
				this.logger.log('WARN', 'No user ID in webhook data, skipping subscription update');
				return null;
			}

			// Determine subscription status based on event type
			let subscriptionStatus = 'unknown';
			switch (event.type) {
				case 'INITIAL_PURCHASE':
				case 'RENEWAL':
				case 'UNCANCELLATION':
					subscriptionStatus = 'active';
					break;
				case 'CANCELLATION':
					subscriptionStatus = 'cancelled';
					break;
				case 'EXPIRATION':
					subscriptionStatus = 'expired';
					break;
				case 'BILLING_ISSUE':
					subscriptionStatus = 'billing_issue';
					break;
			}

			const updateData = {
				subscription_status: subscriptionStatus,
				subscription_product_id: event.product_id,
				subscription_expires_at: event.expires_at_ms ? new Date(parseInt(event.expires_at_ms)).toISOString() : null,
				subscription_purchased_at: event.purchased_at_ms ? new Date(parseInt(event.purchased_at_ms)).toISOString() : null,
				subscription_store: event.store,
				subscription_environment: event.environment,
				updated_at: new Date().toISOString()
			};

			this.logger.log('DEBUG', 'Updating user subscription status', {
				userId: event.app_user_id,
				status: subscriptionStatus,
				productId: event.product_id
			});

			const { data: updatedUser, error } = await supabase
				.from('profiles')
				.update(updateData)
				.eq('id', event.app_user_id)
				.select()
				.single();

			if (error) {
				this.logger.log('ERROR', 'Failed to update user subscription status', {
					error: error.message,
					userId: event.app_user_id
				});
				throw error;
			}

			this.logger.log('INFO', 'User subscription status updated successfully', {
				userId: updatedUser.id,
				status: updatedUser.subscription_status
			});

			return updatedUser;
		} catch (error) {
			this.logger.log('ERROR', 'Error updating user subscription status', {
				error: error.message,
				userId: webhookData?.event?.app_user_id
			});
			return null;
		}
	}

	/**
	 * Get user subscription information
	 * @param {string} userId - The user ID
	 * @returns {Promise<Object|null>} - The user subscription data or null if not found
	 */
	async getUserSubscription(userId) {
		try {
			if (!this.callerEnvironment.SUPABASE_URL || !this.callerEnvironment.SUPABASE_SERVICE_ROLE_KEY) {
				this.logger.log('WARN', 'Supabase not configured, cannot get user subscription');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(this.callerEnvironment);

			const { data: user, error } = await supabase
				.from('profiles')
				.select('subscription_status, subscription_product_id, subscription_expires_at, subscription_purchased_at, subscription_store, subscription_environment')
				.eq('id', userId)
				.single();

			if (error) {
				this.logger.log('ERROR', 'Failed to get user subscription', {
					error: error.message,
					userId: userId
				});
				return null;
			}

			return user;
		} catch (error) {
			this.logger.log('ERROR', 'Error getting user subscription', {
				error: error.message,
				userId: userId
			});
			return null;
		}
	}

	/**
	 * Get webhook events for a user
	 * @param {string} userId - The user ID
	 * @param {Object} options - Query options
	 * @returns {Promise<Array>} - Array of webhook events
	 */
	async getUserWebhookEvents(userId, options = {}) {
		try {
			if (!this.callerEnvironment.SUPABASE_URL || !this.callerEnvironment.SUPABASE_SERVICE_ROLE_KEY) {
				this.logger.log('WARN', 'Supabase not configured, cannot get user webhook events');
				return [];
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(this.callerEnvironment);
			const { limit = 50, offset = 0, eventType = null } = options;

			let query = supabase
				.from('revenuecat_webhook_events')
				.select('*')
				.eq('user_id', userId)
				.order('processed_at', { ascending: false })
				.range(offset, offset + limit - 1);

			if (eventType) {
				query = query.eq('event_type', eventType);
			}

			const { data: events, error } = await query;

			if (error) {
				this.logger.log('ERROR', 'Failed to get user webhook events', {
					error: error.message,
					userId: userId
				});
				return [];
			}

			return events || [];
		} catch (error) {
			this.logger.log('ERROR', 'Error getting user webhook events', {
				error: error.message,
				userId: userId
			});
			return [];
		}
	}
} 
