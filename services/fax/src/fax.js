/**
 * Fax Service - Compatible with Serverless API Gateway
 */

import { env, WorkerEntrypoint } from "cloudflare:workers";
import { Logger } from './utils.js';
import { DatabaseUtils } from './database.js';
import { NotifyreProvider } from './providers/notifyre-provider.js';
import { TelnyxProvider } from './providers/telnyx-provider.js';
import { R2Utils } from './r2-utils.js';

export default class extends WorkerEntrypoint {
	constructor(ctx, env) {
		super(ctx, env);
		this.logger = null;
		this.env = env;
		this.initializeLogger(env);
	}

	async fetch(request, env) {
		this.initializeLogger(env);
		this.logger.log('INFO', 'Fetch request received');
		return new Response("Hello from Fax Service");
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

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			return formData;
		} else if (contentType.includes('application/json')) {
			const jsonData = await request.json();
			return jsonData;
		} else {
			const textData = await request.text();
			return textData;
		}
	}



	async createFaxProvider(apiProviderName, caller_env) {
		let apiKey;
		let options = {};

		switch (apiProviderName) {
			case 'notifyre':
				// env parameter contains caller environment (passed from sendFax)
				apiKey = caller_env.NOTIFYRE_API_KEY;
				break;
			case 'telnyx':
				// env parameter contains caller environment (passed from sendFax)
				apiKey = caller_env.TELNYX_API_KEY;
				options = {
					connectionId: caller_env.TELNYX_CONNECTION_ID,
					senderId: caller_env.TELNYX_SENDER_ID,
					r2Utils: new R2Utils(this.logger, this.env), // Service-level binding
					env: caller_env
				};
				break;
			default:
				throw new Error(`Unsupported API provider: ${apiProviderName}`);
		}

		if (!apiKey) {
			throw new Error(`API key not found for ${apiProviderName} provider`);
		}

		if (apiProviderName=== 'telnyx') {
			if (!options.connectionId) {
				throw new Error('TELNYX_CONNECTION_ID is required for Telnyx provider');
			}
			if (!options.r2Utils.validateConfiguration()) {
				throw new Error('R2 configuration is invalid for Telnyx provider');
			}
		}

		if (apiProviderName === 'notifyre') {
			return new NotifyreProvider(apiKey, this.logger);
		}
		if (apiProviderName === 'telnyx') {
			return new TelnyxProvider(apiKey, this.logger, options);
		}
		throw new Error(`Unsupported API provider: ${apiProviderName}`);
	}

	normaliseProviderName(raw) {
		if (!raw || typeof raw !== 'string') return null;
		const name = raw.trim().toLowerCase();
		if (name === 'telynx') return 'telnyx';
		return name;
	}

	async getApiProviderName(request, requestBody, caller_env) {
		let apiProviderName = null;
		let source = null;

		// 1. Check URL search params first
		const urlObj = new URL(request.url);
		apiProviderName = urlObj.searchParams.get('provider');
		if (apiProviderName) {
			source = 'URL search parameter';
			this.logger.log('DEBUG', 'API provider name found in URL search params', { 
				provider: apiProviderName, 
				source 
			});

			return apiProviderName;
		}

		// 2. Check request body if not found in URL
		if (!apiProviderName) {
			if (requestBody instanceof FormData) {
				apiProviderName = requestBody.get('provider') || requestBody.get('apiProvider');
				if (apiProviderName) {
					source = requestBody.get('provider') ? 'FormData provider field' : 'FormData apiProvider field';
				}
			} else if (typeof requestBody === 'object' && requestBody !== null) {
				apiProviderName = requestBody.provider || requestBody.apiProvider;
				if (apiProviderName) {
					source = requestBody.provider ? 'JSON body provider field' : 'JSON body apiProvider field';
				}
			}

			if (apiProviderName) {
				this.logger.log('DEBUG', 'API provider name found in request body', { 
					provider: apiProviderName, 
					source 
				});
				return apiProviderName;
			}
		}

		// 3. Fall back to environment variable
		if (!apiProviderName) {
			apiProviderName = caller_env.FAX_PROVIDER || 'notifyre';
			source = caller_env.FAX_PROVIDER ? 'Environment variable FAX_PROVIDER' : 'Default fallback';
			this.logger.log('DEBUG', 'API provider name using fallback', { 
				provider: apiProviderName, 
				source 
			});
		}

		// 4. Normalize the provider name
		const normalizedProvider = this.normaliseProviderName(apiProviderName) || 'notifyre';
		if (normalizedProvider !== apiProviderName) {
			this.logger.log('DEBUG', 'API provider name normalized', { 
				original: apiProviderName,
				normalized: normalizedProvider,
				source: source + ' (normalized)'
			});
			source = source + ' (normalized)';
		}

		this.logger.log('INFO', 'Final API provider name determined', { 
			provider: normalizedProvider, 
			source 
		});

		return normalizedProvider;
	}

	async sendFax(request, caller_env, sagContext) {
		try {
			
			// Ensure we have usable objects regardless of whether inputs are strings
			const callerEnvObj = typeof caller_env === 'string' ? JSON.parse(caller_env || '{}') : (caller_env || {});
			const sagContextObj = typeof sagContext === 'string' ? JSON.parse(sagContext || '{}') : (sagContext || {});

			// Store for access in helper methods
			this.callerEnvObj = callerEnvObj;

			this.logger.log('INFO', 'Send fax request received', {
				method: request.method,
				url: request.url,
				hasBody: !!request.body,
				contentType: request.headers.get('content-type')
			});

			const requestBody = await this.parseRequestBody(request);

			const apiProviderName = await this.getApiProviderName(request, requestBody, callerEnvObj);

			const faxProvider = await this.createFaxProvider(apiProviderName, callerEnvObj);
			const faxRequest = await faxProvider.prepareFaxRequest(requestBody);

			const userId = sagContextObj.jwtPayload?.sub || sagContextObj.jwtPayload?.user_id || sagContextObj.user?.id || null;
			let faxResult;

			if (faxProvider.getProviderName() === 'telnyx') {
				this.logger.log('INFO', 'Using Telnyx custom workflow');
				faxResult = await faxProvider.sendFaxWithCustomWorkflow(faxRequest, userId);
			} else {
				this.logger.log('INFO', 'Using standard provider workflow');
				const providerPayload = await faxProvider.buildPayload(faxRequest);
				faxResult = await faxProvider.sendFax(providerPayload);
				await this.saveFaxRecordForStandardWorkflow(faxResult, faxRequest, userId, faxProvider.getProviderName());
			}

			if (!faxResult.id) {
				this.logger.log('ERROR', 'Fax provider did not return a valid fax ID');
				throw new Error('Fax provider did not return a valid fax ID');
			}

			this.logger.log('INFO', 'Fax submitted successfully', { 
				faxId: faxResult.id, 
				friendlyId: faxResult.friendlyId,
				apiProvider: faxProvider.getProviderName()
			});

			return {
				statusCode: 200,
				message: "Fax submitted successfully",
				data: {
					id: faxResult.id,
					friendlyId: faxResult.friendlyId,
					status: faxResult.status || 'queued',
					originalStatus: faxResult.originalStatus || 'Submitted',
					message: "Fax is now queued for processing",
					timestamp: new Date().toISOString(),
					recipient: faxRequest.recipients?.[0] || 'unknown',
					pages: 1,
					cost: null,
					apiProvider: faxProvider.getProviderName(),
					providerResponse: faxResult.providerResponse
				}
			};

		} catch (error) {
			this.logger.log('ERROR', 'Error in sendFax', {
				errorMessage: error.message,
				errorStack: error.stack
			});

			return {
				statusCode: 500,
				error: "Fax sending failed",
				message: error.message,
				details: error.stack,
				timestamp: new Date().toISOString()
			};
		}
	}

	async debug(request, caller_env = "{}", sagContext = "{}") {
		console.log("[FAX-SERVICE][DEBUG] Caller Environment:", callerEnvObj);
		console.log("[FAX-SERVICE][DEBUG] SAG Context:", sagObj);
		console.log("[FAX-SERVICE][DEBUG] Service Environment:", this.env);

		return {
			statusCode: 200,
			message: "Debug information logged successfully",
			data: {
				callerEnvObj: caller_env,
				sagContext: sagContext,
				env: this.env,
				timestamp: new Date().toISOString()
			}
		};
	}

	async health(request, caller_env, sagContext) {
		try {
			
			this.logger.log('INFO', 'Health check request received');

			return {
				statusCode: 200,
				message: "Fax service healthy",
				data: {
					service: "fax",
					timestamp: new Date().toISOString(),
					version: "2.0.0",
					currentApiProvider: caller_env?.FAX_PROVIDER || 'notifyre',
					supportedApiProviders: ['notifyre', 'telnyx'],
					features: [
						"send-fax",
						"webhooks",
						"multi-api-provider-support"
					]
				}
			};
		} catch (error) {
			if (this.logger) {
				this.logger.log('ERROR', 'Error in health check:', error);
			} else {
				console.error('Error in health check:', error);
			}
			return {
				statusCode: 500,
				error: "Health check failed",
				message: error.message
			};
		}
	}

	async healthProtected(request, caller_env, sagContext) {
		try {
			
			this.logger.log('INFO', 'Protected health check request received');

			return {
				statusCode: 200,
				message: "Fax service healthy (authenticated)",
				data: {
					service: "fax",
					user: sagContext.jwtPayload || null,
					timestamp: new Date().toISOString(),
					version: "2.0.0",
					authenticated: true,
					currentApiProvider: caller_env?.FAX_PROVIDER || 'notifyre',
					supportedApiProviders: ['notifyre', 'telnyx'],
					features: [
						"send-fax",
						"webhooks",
						"multi-api-provider-support"
					]
				}
			};
		} catch (error) {
			if (this.logger) {
				this.logger.log('ERROR', 'Error in healthProtected:', error);
			} else {
				console.error('Error in healthProtected:', error);
			}
			return {
				statusCode: 500,
				error: "Authenticated health check failed",
				message: error.message
			};
		}
	}

	async uploadFilesToR2(request, caller_env, sagContext) {
		try {
			

			this.logger.log('INFO', 'Upload-to-R2 debug endpoint called', {
				method: request.method,
				url: request.url,
				contentType: request.headers.get('content-type')
			});

			const requestBody = await this.parseRequestBody(request);
			
			// Create a temporary provider for request preparation (defaulting to notifyre)
			const tempProvider = await this.createFaxProvider('notifyre', { NOTIFYRE_API_KEY: 'temp' });
			const faxRequest = await tempProvider.prepareFaxRequest(requestBody);

			if (!faxRequest.files || faxRequest.files.length === 0) {
				throw new Error('No files provided in request');
			}

			const r2Utils = new R2Utils(this.logger, this.env);

			if (!r2Utils.validateConfiguration()) {
				throw new Error('R2 configuration invalid – check FAX_FILES_BUCKET binding');
			}

			const uploaded = [];
			for (let i = 0; i < faxRequest.files.length; i++) {
				const file = faxRequest.files[i];
				let buffer;
				let contentType = 'application/pdf';

				if (file instanceof Blob || (file && typeof file.arrayBuffer === 'function')) {
					buffer = await file.arrayBuffer();
					contentType = file.type || contentType;
				} else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
					buffer = file;
				} else {
					buffer = new TextEncoder().encode(String(file));
					contentType = 'text/plain';
				}

				const timestamp = Date.now();
				const filename = `debug/${timestamp}_${i + 1}` + (contentType === 'application/pdf' ? '.pdf' : '');

				const url = await r2Utils.uploadFile(filename, buffer, contentType);
				uploaded.push({ filename, url });
			}

			this.logger.log('INFO', 'Files uploaded to R2 via debug endpoint', { count: uploaded.length });

			return {
				statusCode: 200,
				message: 'Files uploaded successfully',
				data: {
					fileCount: uploaded.length,
					files: uploaded,
					timestamp: new Date().toISOString()
				}
			};

		} catch (error) {
			if (this.logger) {
				this.logger.log('ERROR', 'Upload-to-R2 debug endpoint failed', {
					error: error.message,
					stack: error.stack
				});
			}

			return {
				statusCode: 500,
				error: 'File upload failed',
				message: error.message
			};
		}
	}

	async saveFaxRecordForStandardWorkflow(faxResult, faxRequest, userId, providerName) {
		try {
			this.logger.log('DEBUG', 'Saving fax record for standard workflow', {
				userId: userId || 'anonymous',
				providerName
			});

			const faxDataForSave = {
				id: faxResult.id,
				status: faxResult.status || 'queued',
				originalStatus: faxResult.originalStatus || 'Submitted',
				recipients: faxRequest.recipients || [],
				senderId: faxRequest.senderId,
				subject: faxRequest.subject || faxRequest.message,
				pages: 1,
				cost: null,
				clientReference: faxRequest.clientReference || 'SendFaxPro',
				sentAt: new Date().toISOString(),
				completedAt: null,
				errorMessage: null,
				providerResponse: faxResult.providerResponse,
				friendlyId: faxResult.friendlyId,
				apiProvider: providerName
			};

			// Prefer caller environment (where Supabase keys usually reside) if available
			const envForDb = (this.callerEnvObj && this.callerEnvObj.SUPABASE_SERVICE_ROLE_KEY)
				? this.callerEnvObj
				: this.env;
			const savedFaxRecord = await DatabaseUtils.saveFaxRecord(faxDataForSave, userId, envForDb, this.logger);

			this.logger.log('DEBUG', 'Fax record saved successfully', {
				faxId: savedFaxRecord?.id,
				providerName
			});

			return savedFaxRecord;

		} catch (error) {
			this.logger.log('ERROR', 'Failed to save fax record', {
				error: error.message,
				providerName
			});
			return null;
		}
	}

	async telnyxWebhook(request, caller_env = "{}", sagContext = "{}") {
		try {
			
			// Ensure caller_env is an object for downstream DB utils
			const callerEnvObj = typeof caller_env === 'string' ? JSON.parse(caller_env || '{}') : (caller_env || {});

			this.logger.log('INFO', 'Telnyx webhook received');

			// Parse JSON body safely
			const body = await request.json();

			const eventType = body?.data?.event_type || 'unknown';
			const payload = body?.data?.payload || {};
			const telnyxFaxId = payload.fax_id || null;
			const statusFromPayload = payload.status || null;
			const failureReason = payload.failure_reason || null;
			const pageCount = payload.page_count || null;

			if (!telnyxFaxId) {
				this.logger.log('ERROR', 'Telnyx webhook missing fax_id in payload');
				return { statusCode: 400, error: 'Invalid webhook payload: missing fax_id' };
			}

			// Create a temporary TelnyxProvider instance to reuse its status mapping helper
			const tempProvider = new TelnyxProvider('temp', this.logger, { connectionId: 'temp' });
			const standardizedStatus = tempProvider.mapStatus(failureReason || statusFromPayload);

			// Build update data for Supabase
			const updateData = {
				status: standardizedStatus,
				original_status: statusFromPayload,
				error_message: failureReason || null,
				metadata: payload,
				completed_at: ['delivered', 'failed', 'cancelled'].includes(standardizedStatus) ? new Date().toISOString() : null
			};

			// Add page count if available in the webhook payload
			if (pageCount !== null && pageCount !== undefined) {
				updateData.pages = pageCount;
				this.logger.log('DEBUG', 'Page count included in webhook update', { 
					telnyxFaxId, 
					pageCount 
				});
			}

			// Update fax record using provider_fax_id as lookup key
			await DatabaseUtils.updateFaxRecord(telnyxFaxId, updateData, callerEnvObj, this.logger, 'provider_fax_id');

			// Store webhook event for audit/logging
			await DatabaseUtils.storeWebhookEvent({
				event: eventType,
				faxId: telnyxFaxId,
				processedData: updateData,
				rawPayload: body
			}, callerEnvObj, this.logger);

			this.logger.log('INFO', 'Telnyx webhook processed successfully', { 
				telnyxFaxId, 
				eventType,
				pageCount: pageCount || 'not provided'
			});

			return {
				statusCode: 200,
				message: 'Webhook processed successfully',
				data: {
					faxId: telnyxFaxId,
					standardizedStatus,
					timestamp: new Date().toISOString()
				}
			};

		} catch (error) {
			if (this.logger) {
				this.logger.log('ERROR', 'Error processing Telnyx webhook', {
					error: error.message,
					stack: error.stack
				});
			}
			return {
				statusCode: 500,
				error: 'Webhook processing failed',
				message: error.message
			};
		}
	}
}
