import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { sendFax, handleSupabaseWebhookPostUserCreated, getFaxStatus } from '../src';

describe('Fax Service - Service Binding Handlers', () => {
	let mockEnv;
	let mockSagContext;

	beforeEach(() => {
		mockEnv = {
			ENVIRONMENT: 'test',
			API_KEY: 'test-api-key'
		};
		
		mockSagContext = {
			apiConfig: { 
				cors: { allow_origins: ['*'] },
				authorizer: { type: 'auth0' }
			},
			requestUrl: new URL('https://api.sendfax.pro/v1/fax/send'),
			jwtPayload: {
				sub: 'user123',
				email: 'test@example.com',
				name: 'Test User'
			},
			matchedPath: {
				config: {
					path: '/v1/fax/send',
					method: 'POST'
				}
			}
		};
	});

	describe('sendFax handler', () => {
		it('should queue a fax successfully with valid JSON payload', async () => {
			const requestBody = {
				recipient: '+1234567890',
				pages: 3,
				document: 'base64-encoded-pdf-data'
			};

			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer test-token'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));

			expect(result).toBeDefined();
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Fax queued successfully');
			expect(result.data).toBeDefined();
			expect(result.data.id).toMatch(/^fax_\d+_[a-z0-9]+$/);
			expect(result.data.status).toBe('queued');
			expect(result.data.recipient).toBe('+1234567890');
			expect(result.data.pages).toBe(3);
			expect(result.data.timestamp).toBeDefined();
			expect(result.data.requestData).toBeDefined();
			expect(result.data.requestData.method).toBe('POST');
			expect(result.data.requestData.body).toEqual(requestBody);
		});

		it('should handle GET request with query parameters', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send?recipient=%2B1234567890&pages=1', {
				method: 'GET',
				headers: {
					'Authorization': 'Bearer test-token'
				}
			});

			const result = await sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));

			expect(result.statusCode).toBe(200);
			expect(result.data.requestData.query).toEqual({
				recipient: '+1234567890',
				pages: '1'
			});
			expect(result.data.requestData.method).toBe('GET');
		});

		it('should handle text payload gracefully', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST',
				headers: {
					'Content-Type': 'text/plain'
				},
				body: 'Simple text fax content'
			});

			const result = await sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));

			expect(result.statusCode).toBe(200);
			expect(result.data.requestData.body).toBe('Simple text fax content');
		});

		it('should handle empty body', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST'
			});

			const result = await sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));

			expect(result.statusCode).toBe(200);
			expect(result.data.recipient).toBe('unknown');
			expect(result.data.pages).toBe(1);
		});

		it('should handle errors gracefully', async () => {
			// Pass invalid JSON for env to trigger an error
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST',
				body: JSON.stringify({ recipient: '+1234567890' })
			});

			const result = await sendFax(request, 'invalid-json', JSON.stringify(mockSagContext));

			expect(result.statusCode).toBe(500);
			expect(result.error).toBe('Internal server error');
			expect(result.message).toBeDefined();
		});
	});

	describe('handleSupabaseWebhookPostUserCreated handler', () => {
		it('should process user creation webhook successfully', async () => {
			const webhookPayload = {
				type: 'user.created',
				record: {
					id: 'user_123',
					email: 'newuser@example.com',
					created_at: '2024-01-01T00:00:00Z'
				}
			};

			const request = new Request('https://api.sendfax.pro/v1/webhooks/user-created', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Supabase-Signature': 'valid-signature'
				},
				body: JSON.stringify(webhookPayload)
			});

			const result = await handleSupabaseWebhookPostUserCreated(
				request, 
				JSON.stringify(mockEnv), 
				JSON.stringify(mockSagContext)
			);

			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Webhook processed successfully');
			expect(result.data.id).toMatch(/^webhook_\d+$/);
			expect(result.data.status).toBe('processed');
			expect(result.data.user).toEqual(webhookPayload.record);
			expect(result.data.event).toBe('user.created');
		});

		it('should handle webhook payload with different structure', async () => {
			const webhookPayload = {
				user: {
					id: 'user_456',
					username: 'testuser'
				}
			};

			const request = new Request('https://api.sendfax.pro/v1/webhooks/user-created', {
				method: 'POST',
				body: JSON.stringify(webhookPayload)
			});

			const result = await handleSupabaseWebhookPostUserCreated(
				request, 
				JSON.stringify(mockEnv), 
				JSON.stringify(mockSagContext)
			);

			expect(result.statusCode).toBe(200);
			expect(result.data.user).toEqual(webhookPayload.user);
			expect(result.data.event).toBe('user.created'); // default when type not present
		});

		it('should handle webhook processing errors', async () => {
			const request = new Request('https://api.sendfax.pro/v1/webhooks/user-created', {
				method: 'POST',
				body: 'invalid-json'
			});

			const result = await handleSupabaseWebhookPostUserCreated(
				request, 
				JSON.stringify(mockEnv), 
				JSON.stringify(mockSagContext)
			);

			expect(result.statusCode).toBe(500);
			expect(result.error).toBe('Webhook processing failed');
		});
	});

	describe('getFaxStatus handler', () => {
		it('should retrieve fax status with ID parameter', async () => {
			const faxId = 'fax_123456_abc';
			const request = new Request(`https://api.sendfax.pro/v1/fax/status?id=${faxId}`, {
				method: 'GET'
			});

			const result = await getFaxStatus(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));

			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Status retrieved successfully');
			expect(result.data.id).toBe(faxId);
			expect(['sent', 'pending']).toContain(result.data.status);
			expect(result.data.timestamp).toBeDefined();
		});

		it('should handle missing ID parameter', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/status', {
				method: 'GET'
			});

			const result = await getFaxStatus(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));

			expect(result.statusCode).toBe(200);
			expect(result.data.id).toBe('unknown');
		});

		it('should handle status check errors', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/status?id=test', {
				method: 'GET'
			});

			const result = await getFaxStatus(request, 'invalid-json', JSON.stringify(mockSagContext));

			expect(result.statusCode).toBe(500);
			expect(result.error).toBe('Status check failed');
		});
	});

	describe('Service binding parameter handling', () => {
		it('should properly parse stringified env and sagContext', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST',
				body: JSON.stringify({ recipient: '+1234567890' })
			});

			// Test with complex nested objects
			const complexEnv = {
				database: {
					url: 'postgresql://test',
					pool_size: 10
				},
				features: {
					fax_enabled: true,
					webhook_retries: 3
				}
			};

			const complexContext = {
				...mockSagContext,
				apiConfig: {
					...mockSagContext.apiConfig,
					rateLimit: {
						requests_per_minute: 100,
						burst_limit: 10
					}
				}
			};

			const result = await sendFax(
				request, 
				JSON.stringify(complexEnv), 
				JSON.stringify(complexContext)
			);

			expect(result.statusCode).toBe(200);
			// Verify that complex objects were parsed correctly by checking the function executed successfully
			expect(result.data).toBeDefined();
		});
	});
});
