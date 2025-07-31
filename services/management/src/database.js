/**
 * Database utilities for Management Service
 */

import { createClient } from '@supabase/supabase-js';

export class DatabaseUtils {
	/**
	 * Get Supabase admin client for direct database access
	 * @param {Object} env - Environment variables
	 * @returns {Object} Supabase client
	 */
	static getSupabaseAdminClient(env) {
		if (!env.SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for backend operations');
		}
		
		console.log(`[DatabaseUtils] Creating Supabase admin client - Using SERVICE_ROLE key (RLS BYPASSED - Admin Access)`);
		
		return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
	}

	/**
	 * Save webhook event to database
	 * @param {Object} webhookData - Webhook data to save
	 * @param {Object} env - Environment variables
	 * @param {Logger} logger - Logger instance
	 * @returns {Object|null} Saved webhook data or null
	 */
	static async saveWebhookEvent(webhookData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot save webhook event');
				return null;
			}

			const supabase = this.getSupabaseAdminClient(env);

			const webhookRecord = {
				type: webhookData.type,
				payload: webhookData.payload,
				headers: webhookData.headers,
				received_at: webhookData.received_at,
				processed: false,
				created_at: new Date().toISOString()
			};

			const { data: savedWebhook, error } = await supabase
				.from('webhook_events')
				.insert(webhookRecord)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to save webhook event to database', {
					error: error.message,
					code: error.code,
					type: webhookData.type
				});
				throw error;
			}

			logger.log('INFO', 'Webhook event saved successfully to database', {
				webhookId: savedWebhook.id,
				type: savedWebhook.type,
				receivedAt: savedWebhook.received_at
			});

			return savedWebhook;

		} catch (error) {
			logger.log('ERROR', 'Error saving webhook event to database', {
				error: error.message,
				type: webhookData?.type
			});
			return null;
		}
	}

	/**
	 * Get user information
	 * @param {string} userId - User ID
	 * @param {Object} env - Environment variables
	 * @param {Logger} logger - Logger instance
	 * @returns {Object|null} User data or null
	 */
	static async getUser(userId, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get user');
				return null;
			}

			const supabase = this.getSupabaseAdminClient(env);

			const { data: user, error } = await supabase
				.from('users')
				.select('*')
				.eq('id', userId)
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to get user from database', {
					error: error.message,
					code: error.code,
					userId
				});
				return null;
			}

			logger.log('INFO', 'User retrieved successfully', {
				userId: user.id
			});

			return user;

		} catch (error) {
			logger.log('ERROR', 'Error getting user from database', {
				error: error.message,
				userId
			});
			return null;
		}
	}

	/**
	 * Get system statistics
	 * @param {Object} env - Environment variables
	 * @param {Logger} logger - Logger instance
	 * @returns {Object} System statistics
	 */
	static async getSystemStats(env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get system stats');
				return null;
			}

			const supabase = this.getSupabaseAdminClient(env);

			// Get total users count
			const { count: totalUsers, error: usersError } = await supabase
				.from('users')
				.select('*', { count: 'exact', head: true });

			if (usersError) {
				logger.log('ERROR', 'Failed to get users count', {
					error: usersError.message
				});
			}

			// Get total faxes count
			const { count: totalFaxes, error: faxesError } = await supabase
				.from('faxes')
				.select('*', { count: 'exact', head: true });

			if (faxesError) {
				logger.log('ERROR', 'Failed to get faxes count', {
					error: faxesError.message
				});
			}

			// Get total webhook events count
			const { count: totalWebhooks, error: webhooksError } = await supabase
				.from('webhook_events')
				.select('*', { count: 'exact', head: true });

			if (webhooksError) {
				logger.log('ERROR', 'Failed to get webhook events count', {
					error: webhooksError.message
				});
			}

			const stats = {
				totalUsers: totalUsers || 0,
				totalFaxes: totalFaxes || 0,
				totalWebhooks: totalWebhooks || 0,
				timestamp: new Date().toISOString()
			};

			logger.log('INFO', 'System statistics retrieved successfully', stats);

			return stats;

		} catch (error) {
			logger.log('ERROR', 'Error getting system statistics', {
				error: error.message
			});
			return null;
		}
	}

	/**
	 * Get recent activity
	 * @param {Object} options - Query options
	 * @param {Object} env - Environment variables
	 * @param {Logger} logger - Logger instance
	 * @returns {Array} Recent activity data
	 */
	static async getRecentActivity(options = {}, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get recent activity');
				return [];
			}

			const supabase = this.getSupabaseAdminClient(env);
			const limit = options.limit || 50;

			// Get recent faxes
			const { data: recentFaxes, error: faxesError } = await supabase
				.from('faxes')
				.select('*')
				.order('sent_at', { ascending: false })
				.limit(limit);

			if (faxesError) {
				logger.log('ERROR', 'Failed to get recent faxes', {
					error: faxesError.message
				});
			}

			// Get recent webhook events
			const { data: recentWebhooks, error: webhooksError } = await supabase
				.from('webhook_events')
				.select('*')
				.order('received_at', { ascending: false })
				.limit(limit);

			if (webhooksError) {
				logger.log('ERROR', 'Failed to get recent webhook events', {
					error: webhooksError.message
				});
			}

			const faxActivity = (recentFaxes || []).map(fax => ({
				type: 'fax',
				id: fax.id,
				userId: fax.user_id,
				status: fax.status,
				timestamp: fax.sent_at,
				recipients: fax.recipients
			}));

			const webhookActivity = (recentWebhooks || []).map(webhook => ({
				type: 'webhook',
				id: webhook.id,
				webhookType: webhook.type,
				timestamp: webhook.received_at,
				processed: webhook.processed
			}));

			// Combine and sort by timestamp
			const allActivity = [...faxActivity, ...webhookActivity]
				.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
				.slice(0, limit);

			logger.log('INFO', 'Recent activity retrieved successfully', {
				count: allActivity.length
			});

			return allActivity;

		} catch (error) {
			logger.log('ERROR', 'Error getting recent activity', {
				error: error.message
			});
			return [];
		}
	}
} 
