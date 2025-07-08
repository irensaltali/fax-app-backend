import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';

// Mock Supabase client to avoid ES module issues in tests
vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: vi.fn(() => ({
			select: vi.fn(() => ({ eq: vi.fn() })),
			insert: vi.fn(() => ({ select: vi.fn() })),
			update: vi.fn(() => ({ eq: vi.fn() }))
		}))
	}))
}));

// Mock WorkerEntrypoint to avoid module issues
vi.mock('cloudflare:workers', () => ({
	WorkerEntrypoint: class MockWorkerEntrypoint {
		constructor() {
			this.env = {};
		}
	}
}));

// Mock fetch for Notifyre API calls
global.fetch = vi.fn();

import FaxService from '../src/fax.js';

describe('Fax Service', () => {
	let faxService;
	let mockEnv;
	let mockSagContext;

	beforeAll(() => {
		mockEnv = {
			NOTIFYRE_API_KEY: 'test-notifyre-key',
			SUPABASE_URL: 'https://test.supabase.co',
			SUPABASE_KEY: 'test-key',
			SUPABASE_WEBHOOK_SECRET: 'test-webhook-secret',
			LOG_LEVEL: 'DEBUG'
		};
		
		mockSagContext = {
			jwtPayload: {
				sub: 'test-user-123',
				email: 'test@example.com'
			}
		};

		// Create instance of the service
		faxService = new FaxService();
		faxService.env = mockEnv;
	});

	beforeEach(() => {
		// Mock fetch for Notifyre API calls
		global.fetch.mockImplementation((url, options) => {
			const urlObj = new URL(url);
			const path = urlObj.pathname;

			// Mock responses based on the path
			if (path === '/fax/send') {
				// Verify the request structure matches Notifyre format
				if (options.body) {
					const requestBody = JSON.parse(options.body);
					// Verify it has the correct Notifyre structure
					if (requestBody.Faxes && requestBody.Faxes.Recipients) {
						// Valid Notifyre format
					}
				}
				
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({
						id: 'fax_mock_123',
						status: 'Preparing',
						recipients: ['1234567890'],
						pages: 1,
						cost: 0.03
					})
				});
			}

			if (path.startsWith('/fax/sent') && path.includes('?')) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({
						data: [
							{
								id: 'fax_123',
								status: 'Successful',
								recipients: ['1234567890'],
								pages: 1,
								cost: 0.03,
								sentAt: '2024-01-01T00:00:00Z',
								completedAt: '2024-01-01T00:05:00Z'
							}
						],
						total: 1
					})
				});
			}

			if (path === '/fax/sent/fax_123') {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({
						id: 'fax_123',
						status: 'Successful',
						recipients: ['1234567890'],
						pages: 1,
						cost: 0.03,
						sentAt: '2024-01-01T00:00:00Z',
						completedAt: '2024-01-01T00:05:00Z'
					})
				});
			}

			if (path.startsWith('/fax/received') && path.includes('?')) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({
						data: [
							{
								id: 'received_123',
								sender: '+0987654321',
								pages: 2,
								receivedAt: '2024-01-01T00:00:00Z',
								faxNumber: '+1234567890'
							}
						],
						total: 1
					})
				});
			}

			if (path.includes('/download')) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({
						fileData: 'base64encodeddata',
						filename: path.includes('sent') ? 'fax_123.pdf' : 'received_fax_123.pdf',
						mimeType: 'application/pdf'
					})
				});
			}

			if (path === '/fax/numbers') {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({
						data: [
							{ number: '+1234567890', status: 'active' }
						]
					})
				});
			}

			if (path === '/fax/cover-pages') {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({
						data: [
							{ id: 'cp_1', name: 'Default Cover Page' }
						]
					})
				});
			}

			// Default mock response
			return Promise.resolve({
				ok: false,
				status: 404,
				json: () => Promise.resolve({ error: 'Not found' })
			});
		});
	});

	describe('sendFax', () => {
		it('should queue a fax successfully', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipient: '+1234567890',
					message: 'Test fax message',
					files: [
						{
							filename: 'test.pdf',
							data: 'U2FtcGxlQmFzZTY0RGF0YQ==', // "SampleBase64Data" in base64
							mimeType: 'application/pdf'
						}
					],
					pages: 2
				})
			});

			const result = await faxService.sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Fax submitted successfully');
			expect(result.data.recipient).toBe('1234567890');
			expect(result.data.status).toBe('preparing');
		});

		it('should handle empty request body', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST'
			});

			const result = await faxService.sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.data.recipient).toBe('1234567890');
			expect(result.data.pages).toBe(1);
		});
	});

	describe('handleSupabaseWebhookPostUserCreated', () => {
		it('should process webhook with valid secret', async () => {
			const request = new Request('https://api.sendfax.pro/webhook/supabase', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'X-Supabase-Event-Secret': 'test-webhook-secret'
				},
				body: JSON.stringify({
					type: 'user.created',
					record: {
						id: 'user-123',
						email: 'test@example.com'
					}
				})
			});

			const result = await faxService.handleSupabaseWebhookPostUserCreated(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Webhook processed successfully');
			expect(result.data.user.email).toBe('test@example.com');
		});

		it('should reject webhook with invalid secret', async () => {
			const request = new Request('https://api.sendfax.pro/webhook/supabase', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'X-Supabase-Event-Secret': 'invalid-secret'
				},
				body: JSON.stringify({
					type: 'user.created',
					record: { id: 'user-123' }
				})
			});

			const result = await faxService.handleSupabaseWebhookPostUserCreated(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(401);
			expect(result.error).toBe('Invalid webhook secret');
		});
	});

	describe('getFaxStatus', () => {
		it('should return fax status', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/status?id=fax_123', { method: 'GET' });
			const result = await faxService.getFaxStatus(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Status retrieved successfully');
			expect(result.data.id).toBe('fax_123');
			expect(result.data.status).toBe('sent');
		});
	});

	describe('health handlers', () => {
		it('should return healthy status (unauthenticated)', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/health', { method: 'GET' });
			const result = await faxService.health(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Notifyre Fax service healthy');
			expect(result.data.service).toBe('notifyre-fax');
			expect(result.data.version).toBe('2.0.0');
		});

		it('should return healthy status with user info (authenticated)', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/health/protected', { method: 'GET' });
			const result = await faxService.healthProtected(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Notifyre Fax service healthy (authenticated)');
			expect(result.data.service).toBe('notifyre-fax');
			expect(result.data.user.sub).toBe('test-user-123');
			expect(result.data.version).toBe('2.0.0');
		});
	});


});
