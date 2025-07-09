/**
 * Database utilities for Supabase integration
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Database utilities
 */
export class DatabaseUtils {
	/**
	 * Get Supabase admin client with service role key (bypasses RLS)
	 * Always use service role for backend operations
	 * @param {object} env - Environment variables
	 * @returns {SupabaseClient}
	 */
	static getSupabaseAdminClient(env) {
		if (!env.SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for backend operations');
		}
		
		console.log(`[DatabaseUtils] Creating Supabase admin client - Using SERVICE_ROLE key (RLS BYPASSED - Admin Access)`);
		
		return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
	}

	/**
	 * Save fax record to Supabase database
	 * @param {object} faxData - Fax data to save
	 * @param {string|null} userId - User ID from auth context (null for anonymous users)
	 * @param {object} env - Environment variables
	 * @param {object} logger - Logger instance
	 * @returns {object} Saved fax record
	 */
	static async saveFaxRecord(faxData, userId, env, logger) {
		try {
			// Debug environment variables
			logger.log('DEBUG', 'Supabase environment check', {
				hasUrl: !!env.SUPABASE_URL,
				hasServiceRoleKey: !!env.SUPABASE_SERVICE_ROLE_KEY,
				hasUserId: !!userId,
				urlPrefix: env.SUPABASE_URL ? env.SUPABASE_URL.substring(0, 30) + '...' : 'none'
			});

			// Validate required fields
			if (!faxData.id) {
				logger.log('ERROR', 'Cannot save fax record: missing notifyre_fax_id', {
					faxData: faxData,
					hasId: !!faxData.id,
					userId: userId
				});
				return null;
			}

			const supabase = this.getSupabaseAdminClient(env);

			// Prepare fax record data
			const metadata = {
				...(faxData.notifyreResponse || {}),
				friendlyId: faxData.friendlyId || null
			};

			const faxRecord = {
				user_id: userId,
				notifyre_fax_id: faxData.id,
				status: faxData.status || 'queued',
				original_status: faxData.originalStatus || faxData.status || 'queued',
				recipients: faxData.recipients || [],
				sender_id: faxData.senderId || null,
				subject: faxData.subject || null,
				pages: faxData.pages || 0,
				cost: faxData.cost || null,
				client_reference: faxData.clientReference || 'SendFaxPro',
				sent_at: faxData.sentAt || new Date().toISOString(),
				completed_at: faxData.completedAt || null,
				error_message: faxData.errorMessage || null,
				metadata: metadata
			};

			logger.log('DEBUG', 'Saving fax record to database', {
				userId: userId,
				faxId: faxRecord.notifyre_fax_id,
				status: faxRecord.status,
				recipientCount: Array.isArray(faxRecord.recipients) ? faxRecord.recipients.length : 0,
				isAnonymous: !userId
			});

			const { data, error } = await supabase
				.from('faxes')
				.insert(faxRecord)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to save fax record to database', {
					error: error.message,
					code: error.code,
					faxId: faxRecord.notifyre_fax_id
				});
				throw error;
			}

			logger.log('INFO', 'Fax record saved successfully to database', {
				recordId: data.id,
				faxId: data.notifyre_fax_id,
				userId: data.user_id,
				isAnonymous: !data.user_id
			});

			return data;
		} catch (error) {
			logger.log('ERROR', 'Error saving fax record to database', {
				error: error.message,
				faxId: faxData?.id,
				userId: userId,
				isAnonymous: !userId
			});
			// Don't throw error - we don't want to fail the entire fax operation if database save fails
			return null;
		}
	}

	/**
	 * Update fax record status in Supabase database
	 * @param {string} notifyreFaxId - Notifyre fax ID
	 * @param {object} updateData - Data to update
	 * @param {object} env - Environment variables
	 * @param {object} logger - Logger instance
	 * @returns {object} Updated fax record
	 */
	static async updateFaxRecord(notifyreFaxId, updateData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, skipping fax record update');
				return null;
			}

			const supabase = this.getSupabaseAdminClient(env);

			logger.log('DEBUG', 'Updating fax record in database', {
				faxId: notifyreFaxId,
				updateFields: Object.keys(updateData)
			});

			const { data, error } = await supabase
				.from('faxes')
				.update(updateData)
				.eq('notifyre_fax_id', notifyreFaxId)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to update fax record in database', {
					error: error.message,
					code: error.code,
					faxId: notifyreFaxId
				});
				throw error;
			}

			logger.log('INFO', 'Fax record updated successfully in database', {
				recordId: data.id,
				faxId: data.notifyre_fax_id
			});

			return data;
		} catch (error) {
			logger.log('ERROR', 'Error updating fax record in database', {
				error: error.message,
				faxId: notifyreFaxId
			});
			return null;
		}
	}

	/**
	 * List user's fax records from database
	 * @param {string} userId - User ID to filter by
	 * @param {object} options - Query options (limit, offset, status, fromDate, toDate)
	 * @param {object} env - Environment variables
	 * @param {object} logger - Logger instance
	 * @returns {object} Query result with faxes and metadata
	 */
	static async listUserFaxes(userId, options, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('ERROR', 'Supabase not configured');
				return {
					error: "Database not configured",
					message: "Unable to retrieve fax records"
				};
			}

			const { limit = 50, offset = 0, status, fromDate, toDate } = options;
			const supabase = this.getSupabaseAdminClient(env);

			// Build query
			let query = supabase
				.from('faxes')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.range(offset, offset + limit - 1);

			// Add filters
			if (status) {
				query = query.eq('status', status);
			}
			if (fromDate) {
				query = query.gte('created_at', fromDate);
			}
			if (toDate) {
				query = query.lte('created_at', toDate);
			}

			const { data: faxes, error, count } = await query;

			if (error) {
				logger.log('ERROR', 'Failed to retrieve user faxes', {
					error: error.message,
					userId
				});
				return {
					error: "Failed to retrieve fax records",
					message: error.message
				};
			}

			logger.log('INFO', 'User faxes retrieved successfully', {
				userId,
				count: faxes.length,
				limit,
				offset
			});

			return {
				faxes: faxes || [],
				total: count || faxes.length,
				limit: parseInt(limit),
				offset: parseInt(offset)
			};

		} catch (error) {
			logger.log('ERROR', 'Error in listUserFaxes:', error);
			return {
				error: "Failed to retrieve user fax records",
				message: error.message
			};
		}
	}

	/**
	 * Store webhook event for audit trail
	 * @param {object} webhookData - Webhook event data
	 * @param {object} env - Environment variables
	 * @param {object} logger - Logger instance
	 * @returns {object} Stored webhook record
	 */
	static async storeWebhookEvent(webhookData, env, logger) {
		try {
			const supabase = this.getSupabaseAdminClient(env);

			const { error } = await supabase
				.from('fax_webhook_events')
				.insert({
					event_type: webhookData.event,
					fax_id: webhookData.faxId,
					data: webhookData.processedData,
					raw_payload: webhookData.rawPayload,
					processed_at: new Date().toISOString()
				});

			if (error) {
				logger.log('ERROR', 'Failed to store webhook event', { error: error.message });
				return null;
			}

			logger.log('DEBUG', 'Webhook event stored successfully', { 
				event: webhookData.event,
				faxId: webhookData.faxId 
			});

			return true;
		} catch (error) {
			logger.log('ERROR', 'Error storing webhook event', { error: error.message });
			return null;
		}
	}
} 
