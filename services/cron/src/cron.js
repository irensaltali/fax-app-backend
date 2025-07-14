/**
 * SendFax Pro - Cron Service
 * Handles scheduled tasks for fax status polling, cleanup, and maintenance
 */

import { Logger, NotifyreApiUtils, NOTIFYRE_STATUS_MAP, DatabaseUtils, mapNotifyreStatus } from './utils.js';

export default {
	/**
	 * Handle scheduled events (cron triggers)
	 * @param {Event} event - Scheduled event
	 * @param {object} env - Environment variables  
	 * @param {object} ctx - Execution context
	 */
	async scheduled(event, env, ctx) {
		const logger = new Logger(env);
		
		try {
			logger.log('INFO', 'Scheduled cron job triggered', {
				scheduledTime: event.scheduledTime,
				cron: event.cron,
				type: event.type
			});

			// Determine which task to run based on cron schedule
			const cronExpression = event.cron;
			
			if (cronExpression === '* * * * *') {
				// Every minute - fetch faxes from last 12 hours and update Supabase
				// Note: Consider changing to "* * * * *" (every minute) to avoid rate limiting
				await handleFaxStatusPolling(env, logger);
			} else {
				logger.log('WARN', 'Unknown cron schedule', { cronExpression });
			}

			logger.log('INFO', 'Scheduled cron job completed successfully');

		} catch (error) {
			logger.log('ERROR', 'Error in scheduled cron job', {
				error: error.message,
				stack: error.stack,
				scheduledTime: event.scheduledTime,
				cron: event.cron
			});
		}
	},

	/**
	 * Handle fetch requests (for health checks or manual triggers)
	 * @param {Request} request - Incoming request
	 * @param {object} env - Environment variables
	 * @param {object} ctx - Execution context
	 */
	async fetch(request, env, ctx) {
		const logger = new Logger(env);
		const url = new URL(request.url);

		try {
			if (url.pathname === '/health') {
				return new Response(JSON.stringify({
					status: 'healthy',
					service: 'cron',
					timestamp: new Date().toISOString(),
					version: '1.0.0'
				}), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (url.pathname === '/trigger/fax-polling') {
				// Manual trigger for fax status polling
				logger.log('INFO', 'Manual fax polling trigger received');
				await handleFaxStatusPolling(env, logger);
				return new Response(JSON.stringify({
					message: 'Fax status polling completed',
					timestamp: new Date().toISOString()
				}), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (url.pathname === '/trigger/cleanup') {
				// Manual trigger for cleanup
				logger.log('INFO', 'Manual cleanup trigger received');
				await handleDailyCleanup(env, logger);
				return new Response(JSON.stringify({
					message: 'Cleanup completed',
					timestamp: new Date().toISOString()
				}), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			return new Response('SendFax Pro - Cron Service', {
				headers: { 'Content-Type': 'text/plain' }
			});

		} catch (error) {
			logger.log('ERROR', 'Error handling fetch request', {
				error: error.message,
				path: url.pathname,
				method: request.method
			});

			return new Response(JSON.stringify({
				error: 'Internal server error',
				message: error.message
			}), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}
};
/**
 * Handle fax status polling - get faxes from last 12 hours and update Supabase
 * @param {object} env - Environment variables
 * @param {Logger} logger - Logger instance
 */
async function handleFaxStatusPolling(env, logger) {
	logger.log('INFO', 'Starting fax status polling for last 12 hours');

	try {
		// Get API key
		const apiKey = env.NOTIFYRE_API_KEY;
		if (!apiKey) {
			logger.log('ERROR', 'NOTIFYRE_API_KEY not configured');
			return;
		}

		// Get faxes from last 12 hours from Notifyre API
		const faxesFromNotifyre = await NotifyreApiUtils.getFaxesFromLast12Hours(apiKey, logger);
		
		if (faxesFromNotifyre.length === 0) {
			logger.log('INFO', 'No faxes found from last 12 hours');
			return;
		}

		logger.log('INFO', 'Processing fax status updates from Notifyre', {
			faxCount: faxesFromNotifyre.length
		});

		let updated = 0;
		let errors = 0;

		// Process each fax from Notifyre
		for (const faxDetails of faxesFromNotifyre) {
			try {
							// Map status and prepare update data
			const mappedStatus = mapNotifyreStatus(faxDetails.status, logger);
				
				const updateData = {
					status: mappedStatus,
					original_status: faxDetails.status,
					pages: faxDetails.pages || 1,
					cost: faxDetails.cost || null,
					error_message: faxDetails.failedMessage || faxDetails.errorMessage || null,
					completed_at: faxDetails.completedAt || null,
					metadata: {
						...faxDetails,
						pollingTimestamp: new Date().toISOString(),
						source: 'cron-polling'
					}
				};

				// Update in database by notifyre_fax_id
				const updatedRecord = await DatabaseUtils.updateFaxRecord(
					faxDetails.id, 
					updateData, 
					env, 
					logger
				);

				if (updatedRecord) {
					updated++;
					logger.log('DEBUG', 'Updated fax status', {
						faxId: faxDetails.id,
						newStatus: mappedStatus,
						pages: faxDetails.pages,
						cost: faxDetails.cost
					});
				}

			} catch (error) {
				errors++;
				logger.log('ERROR', 'Failed to update fax status', {
					faxId: faxDetails.id,
					error: error.message
				});
			}

			// Add small delay to avoid rate limiting
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		logger.log('INFO', 'Fax status polling completed', {
			totalProcessed: faxesFromNotifyre.length,
			updated,
			errors
		});

	} catch (error) {
		logger.log('ERROR', 'Error in fax status polling', {
			error: error.message,
			stack: error.stack
		});
	}
}

/**
 * Handle daily cleanup tasks
 * @param {object} env - Environment variables
 * @param {Logger} logger - Logger instance
 */
async function handleDailyCleanup(env, logger) {
	logger.log('INFO', 'Starting daily cleanup tasks');

	try {
		// Add cleanup logic here if needed
		// For now, just log that the cleanup was called
		logger.log('INFO', 'Daily cleanup completed - no tasks implemented yet');

	} catch (error) {
		logger.log('ERROR', 'Error in daily cleanup', {
			error: error.message,
			stack: error.stack
		});
	}
}

