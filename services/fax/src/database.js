/**
 * Database utilities for Supabase integration
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

	static async saveFaxRecord(faxData, userId, env, logger) {
		try {
			const supabase = this.getSupabaseAdminClient(env);

			const metadata = {
				...(faxData.providerResponse || faxData.notifyreResponse || {}),
				friendlyId: faxData.friendlyId || null
			};

			const faxRecord = {
				user_id: userId,
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
				metadata: metadata,
				provider_fax_id: faxData.providerFaxId || faxData.id || null
			};

			const { data: recordedFaxData, error } = await supabase
				.from('faxes')
				.insert(faxRecord)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to save fax record to database', {
					error: error.message,
					code: error.code,
					faxId: faxRecord.provider_fax_id
				});
				throw error;
			}

			
			logger.log('INFO', 'Fax record saved successfully to database', {
				recordId: recordedFaxData.id,
				providerFaxId: recordedFaxData.provider_fax_id,
				userId: recordedFaxData.user_id,
			});

			return recordedFaxData;
		} catch (error) {
			logger.log('ERROR', 'Error saving fax record to database', {
				error: error.message,
				faxId: faxData?.id,
				userId: userId
			});
			return null;
		}
	}

	static async updateFaxRecord(faxId, updateData, env, logger, idType = 'provider_fax_id') {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, skipping fax record update');
				return null;
			}

			const supabase = this.getSupabaseAdminClient(env);

			logger.log('DEBUG', 'Updating fax record in database', {
				faxId,
				idType,
				updateFields: Object.keys(updateData)
			});

			const dataToUpdate = {
				...updateData,
				updated_at: new Date().toISOString()
			};

			const { data, error } = await supabase
				.from('faxes')
				.update(dataToUpdate)
				.eq(idType, faxId)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to update fax record in database', {
					error: error.message,
					code: error.code,
					faxId,
					idType
				});
				return null;
			}

			if (!data) {
				logger.log('WARN', 'Fax record not found in database, skipping update', {
					faxId,
					idType,
					message: 'This fax may not have been sent through our system'
				});
				return null;
			}

			logger.log('INFO', 'Fax record updated successfully in database', {
				recordId: data.id,
				faxId: data.provider_fax_id || data.id,
				idType
			});

			return data;
		} catch (error) {
			logger.log('ERROR', 'Error updating fax record in database', {
				error: error.message,
				faxId,
				idType
			});
			return null;
		}
	}

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

			let query = supabase
				.from('faxes')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.range(offset, offset + limit - 1);

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

	static async recordUsage(usageData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, skipping usage recording');
				return null;
			}

			const supabase = this.getSupabaseAdminClient(env);

			const usageRecord = {
				user_id: usageData.userId,
				type: usageData.type,
				unit_type: usageData.unitType,
				usage_amount: usageData.usageAmount,
				timestamp: usageData.timestamp || new Date().toISOString(),
				metadata: usageData.metadata || {}
			};

			logger.log('DEBUG', 'Recording usage', {
				userId: usageData.userId,
				type: usageData.type,
				unitType: usageData.unitType,
				usageAmount: usageData.usageAmount
			});

			const { data, error } = await supabase
				.from('usage')
				.insert(usageRecord)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to record usage', {
					error: error.message,
					usageData
				});
				return null;
			}

			logger.log('INFO', 'Usage recorded successfully', {
				usageId: data.id,
				userId: data.user_id,
				type: data.type,
				usageAmount: data.usage_amount
			});

			return data;
		} catch (error) {
			logger.log('ERROR', 'Error recording usage', {
				error: error.message,
				usageData
			});
			return null;
		}
	}


} 
