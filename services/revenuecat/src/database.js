/**
 * Database utilities for RevenueCat service
 */

import { createClient } from '@supabase/supabase-js';

export class DatabaseUtils {

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
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The stored webhook event or null if failed
	 */
	static async storeRevenueCatWebhookEvent(webhookData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, skipping webhook event storage');
				logger.log('WARN', 'Supabase URL:', env.SUPABASE_URL);
				logger.log('WARN', 'Supabase SERVICE_ROLE_KEY:', env.SUPABASE_SERVICE_ROLE_KEY);
				throw new Error('Supabase not configured');
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);

			// Extract relevant information from webhook data
			const event = webhookData.event || {};

			// Use original_app_user_id as the user_id for foreign key connection to auth.users
			let userId = event.original_app_user_id;

			// Handle entitlement_id - check both single value and array
			let entitlementId = null;
			if (event.entitlement_id) {
				entitlementId = event.entitlement_id;
			} else if (event.entitlement_ids && Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0) {
				entitlementId = event.entitlement_ids[0]; // Use first entitlement_id from array
			}

			// Sanitize and validate data before insertion
			const webhookRecord = {
				event_type: event.type || 'UNKNOWN',
				event_id: event.id || null,
				user_id: userId,
				product_id: event.product_id || null,
				entitlement_id: entitlementId,
				period_type: event.period_type || null,
				purchased_at: event.purchased_at_ms ? new Date(parseInt(event.purchased_at_ms)).toISOString() : null,
				expires_at: event.expires_at_ms ? new Date(parseInt(event.expires_at_ms)).toISOString() : null,
				environment: event.environment || null,
				store: event.store || null,
				is_trial_conversion: Boolean(event.is_trial_conversion) || false,
				price: event.price ? parseFloat(event.price) : null,
				currency: event.currency || null,
				country_code: event.country_code || null,
				app_id: event.app_id || null,
				raw_data: webhookData,
				processed_at: new Date().toISOString()
			};

			logger.log('DEBUG', 'Storing RevenueCat webhook event', {
				eventType: webhookRecord.event_type,
				userId: webhookRecord.user_id,
				productId: webhookRecord.product_id
			});

			let { data: storedEvent, error } = await supabase
				.from('revenuecat_webhook_events')
				.insert(webhookRecord)
				.select()
				.single();

			// If we get a foreign key constraint error, try again with user_id set to null
			if (error && error.code === '23503' && error.message.includes('user_id_fkey') && userId !== null) {
				logger.log('WARN', 'Foreign key constraint error for user_id, retrying with null', {
					userId: userId,
					eventType: webhookRecord.event_type
				});

				webhookRecord.user_id = null;
				const retryResult = await supabase
					.from('revenuecat_webhook_events')
					.insert(webhookRecord)
					.select()
					.single();

				storedEvent = retryResult.data;
				error = retryResult.error;
			}

			if (error) {
				logger.log('ERROR', 'Failed to store RevenueCat webhook event', {
					error: error.message,
					code: error.code,
					details: error.details,
					hint: error.hint,
					eventType: webhookRecord.event_type,
					userId: webhookRecord.user_id
				});
				throw error;
			}

			logger.log('INFO', 'RevenueCat webhook event stored successfully', {
				eventId: storedEvent.id,
				eventType: storedEvent.event_type,
				userId: storedEvent.user_id
			});

			return storedEvent;
		} catch (error) {
			logger.log('ERROR', 'Error storing RevenueCat webhook event', {
				error: error.message,
				stack: error.stack,
				eventType: webhookData?.event?.type
			});
			return null;
		}
	}

	/**
	 * Update user subscription status based on webhook event
	 * @param {Object} webhookData - The webhook data
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The updated user record or null if failed
	 */
			static async updateUserSubscriptionStatus(webhookData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, skipping user subscription update');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);
			const event = webhookData.event || {};

			// Use original_app_user_id for user identification
			const userId = event.original_app_user_id;
			if (!userId) {
				logger.log('WARN', 'No original_app_user_id in webhook data, skipping subscription update');
				return null;
			}

			// Skip subscription updates for TEST events
			if (event.type === 'TEST') {
				logger.log('INFO', 'Skipping subscription update for TEST event', {
					userId: userId,
					eventType: event.type
				});
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

			logger.log('DEBUG', 'Updating user subscription status', {
				userId: userId,
				status: subscriptionStatus,
				productId: event.product_id
			});

			const { data: updatedUser, error } = await supabase
				.from('profiles')
				.update(updateData)
				.eq('id', userId)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to update user subscription status', {
					error: error.message,
					userId: userId
				});
				throw error;
			}

			logger.log('INFO', 'User subscription status updated successfully', {
				userId: updatedUser.id,
				status: updatedUser.subscription_status
			});

			return updatedUser;
		} catch (error) {
			logger.log('ERROR', 'Error updating user subscription status', {
				error: error.message,
				userId: webhookData?.event?.original_app_user_id
			});
			return null;
		}
	}

	/**
	 * Get user subscription information
	 * @param {string} userId - The user ID
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The user subscription data or null if not found
	 */
	static async getUserSubscription(userId, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get user subscription');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);

			const { data: user, error } = await supabase
				.from('profiles')
				.select('subscription_status, subscription_product_id, subscription_expires_at, subscription_purchased_at, subscription_store, subscription_environment')
				.eq('id', userId)
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to get user subscription', {
					error: error.message,
					userId: userId
				});
				return null;
			}

			return user;
		} catch (error) {
			logger.log('ERROR', 'Error getting user subscription', {
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
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Array>} - Array of webhook events
	 */
	static async getUserWebhookEvents(userId, options = {}, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get user webhook events');
				return [];
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);
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
				logger.log('ERROR', 'Failed to get user webhook events', {
					error: error.message,
					userId: userId
				});
				return [];
			}

			return events || [];
		} catch (error) {
			logger.log('ERROR', 'Error getting user webhook events', {
				error: error.message,
				userId: userId
			});
			return [];
		}
	}
} 
