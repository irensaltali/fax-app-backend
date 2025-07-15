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

// Mock DatabaseUtils
vi.mock('../src/database.js', () => ({
	DatabaseUtils: {
		getSupabaseAdminClient: vi.fn(() => ({
			from: vi.fn(() => ({
				select: vi.fn(() => ({ eq: vi.fn() })),
				insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => ({ data: { id: 'test-id' }, error: null })) })) })),
				update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => ({ data: { id: 'test-id' }, error: null })) })) })) }))
			}))
		})),
		saveFaxRecord: vi.fn().mockResolvedValue({ id: 'saved-fax-123', notifyre_fax_id: 'fax_mock_123' }),
		updateFaxRecord: vi.fn().mockResolvedValue({ id: 'updated-fax-123' }),
		
		storeWebhookEvent: vi.fn().mockResolvedValue(true)
	}
}));

// Mock WorkerEntrypoint to avoid module issues
vi.mock('cloudflare:workers', () => ({
	WorkerEntrypoint: class MockWorkerEntrypoint {
		constructor() {
			this.env = {};
		}
	}
}));

// Mock R2Utils
vi.mock('../src/r2-utils.js', () => ({
	R2Utils: vi.fn().mockImplementation((env, logger) => ({
		env,
		logger,
		validateConfiguration: vi.fn().mockReturnValue(true),
		uploadFile: vi.fn().mockResolvedValue('https://test.r2.url/file.pdf')
	}))
}));

// Mock TelnyxProvider
vi.mock('../src/providers/telnyx-provider.js', () => ({
	TelnyxProvider: vi.fn().mockImplementation((apiKey, logger, options) => ({
		apiKey,
		logger,
		options,
		getProviderName: () => 'telnyx',
		validateConfig: () => true,
		buildPayload: vi.fn().mockResolvedValue({
			connection_id: 'test-connection-id',
			to: '+1234567890',
			from: '+1987654321'
		}),
		sendFaxWithCustomWorkflow: vi.fn().mockResolvedValue({
			id: 'telnyx-fax-123',
			status: 'pending',
			originalStatus: 'queued',
			message: 'Fax submitted to Telnyx successfully',
			timestamp: new Date().toISOString(),
			friendlyId: 'telnyx-fax-123',
			providerResponse: {
				id: 'telnyx-fax-123',
				status: 'queued'
			}
		}),
		getFaxStatus: vi.fn().mockResolvedValue({
			id: 'telnyx-fax-123',
			status: 'completed',
			originalStatus: 'delivered',
			message: 'Fax submitted to Telnyx successfully',
			timestamp: new Date().toISOString(),
			friendlyId: 'telnyx-fax-123',
			providerResponse: {
				id: 'telnyx-fax-123',
				status: 'delivered'
			}
		})
	}))
}));

// Mock NotifyreProvider
vi.mock('../src/providers/notifyre-provider.js', () => ({
	NotifyreProvider: vi.fn().mockImplementation((apiKey, logger) => ({
		apiKey,
		logger,
		getProviderName: () => 'notifyre',
		buildPayload: vi.fn().mockResolvedValue({
			Faxes: {
				Recipients: [{ Type: 'fax_number', Value: '+1234567890' }],
				SendFrom: '',
				ClientReference: 'SendFaxPro',
				Subject: 'Test fax',
				IsHighQuality: false,
				CoverPage: false,
				Documents: []
			}
		}),
		sendFax: vi.fn().mockResolvedValue({
			id: 'fax_mock_123',
			friendlyId: 'TEST123',
			status: 'queued',
			originalStatus: 'Submitted',
			message: 'Fax submitted successfully',
			timestamp: new Date().toISOString(),
			providerResponse: {
				payload: {
					faxID: 'fax_mock_123',
					friendlyID: 'TEST123'
				},
				success: true
			}
		}),
		getFaxStatus: vi.fn().mockResolvedValue({
			id: 'fax_123',
			status: 'delivered',
			originalStatus: 'Successful',
			message: 'Fax delivered successfully',
			timestamp: new Date().toISOString(),
			friendlyId: 'fax_123',
			providerResponse: {
				id: 'fax_123',
				status: 'Successful'
			}
		})
	}))
}));

// Mock fetch for Notifyre API calls
global.fetch = vi.fn();

import FaxService from '../src/fax.js';
import { DatabaseUtils } from '../src/database.js';
import { NotifyreApiUtils } from '../src/utils.js';

describe('Fax Service', () => {
	let faxService;
	let mockEnv;
	let mockSagContext;

	beforeAll(() => {
		mockEnv = {
			NOTIFYRE_API_KEY: {
				get: vi.fn().mockResolvedValue('test-notifyre-key')
			},
			SUPABASE_URL: 'https://test.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
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

		// Mock JSON.parse to return our properly mocked environment when parsing env
		const originalJsonParse = JSON.parse;
		vi.spyOn(JSON, 'parse').mockImplementation((text) => {
			const parsed = originalJsonParse(text);
			// If this looks like our environment object, return the mocked version
			if (parsed && parsed.NOTIFYRE_API_KEY !== undefined && parsed.SUPABASE_URL) {
				return mockEnv;
			}
			// Otherwise return the normally parsed object (for context parsing)
			return parsed;
		});
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
						payload: {
							faxID: 'fax_mock_123',
							friendlyID: 'TEST123'
						},
						success: true,
						statusCode: 200,
						message: "OK",
						errors: []
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
			expect(result.data.recipient).toBe('+1234567890');
			expect(result.data.status).toBe('queued');
		});

		it('should handle empty request body', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST'
			});

			const result = await faxService.sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.data.recipient).toBe('unknown');
			expect(result.data.pages).toBe(1);
		});

		it('should call DatabaseUtils.saveFaxRecord during fax sending', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipient: '+1234567890',
					message: 'Test fax message'
				})
			});

			const result = await faxService.sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			
			expect(result.statusCode).toBe(200);
			expect(DatabaseUtils.saveFaxRecord).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'fax_mock_123',
					friendlyId: 'TEST123',
					status: 'queued',
					recipients: ['+1234567890']
				}),
				'test-user-123', // userId from context
				mockEnv,
				expect.any(Object) // logger
			);
		});
	});



	describe('getFaxStatus', () => {
		it('should return fax status', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/status?id=fax_123', { method: 'GET' });
			const result = await faxService.getFaxStatus(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Status retrieved successfully');
			expect(result.data.id).toBe('fax_123');
			expect(result.data.status).toBe('delivered');
		});
	});

	describe('Provider Selection', () => {
		it('should default to Notifyre provider when FAX_PROVIDER not set', async () => {
			const envWithoutProvider = { ...mockEnv };
			delete envWithoutProvider.FAX_PROVIDER;
			
			const provider = await faxService.createFaxProvider(envWithoutProvider);
			expect(provider.getProviderName()).toBe('notifyre');
		});

		it('should use Notifyre provider when FAX_PROVIDER=notifyre', async () => {
			const envWithNotifyre = { ...mockEnv, FAX_PROVIDER: 'notifyre' };
			
			const provider = await faxService.createFaxProvider(envWithNotifyre);
			expect(provider.getProviderName()).toBe('notifyre');
		});

		it('should use Telnyx provider when FAX_PROVIDER=telnyx', async () => {
			const envWithTelnyx = {
				...mockEnv,
				FAX_PROVIDER: 'telnyx',
				TELNYX_API_KEY: 'test-telnyx-key',
				TELNYX_CONNECTION_ID: 'test-connection-id',
				FAX_FILES_BUCKET: { put: vi.fn(), get: vi.fn(), name: 'test-bucket' },
				CLOUDFLARE_ACCOUNT_ID: 'test-account-id'
			};
			
			const provider = await faxService.createFaxProvider(envWithTelnyx);
			expect(provider.getProviderName()).toBe('telnyx');
		});

		it('should throw error for unsupported provider', async () => {
			const envWithUnsupported = { ...mockEnv, FAX_PROVIDER: 'unsupported' };
			
			await expect(faxService.createFaxProvider(envWithUnsupported))
				.rejects.toThrow('Unsupported API provider: unsupported');
		});

		it('should throw error when Telnyx API key missing', async () => {
			const envWithoutKey = { ...mockEnv, FAX_PROVIDER: 'telnyx' };
			
			await expect(faxService.createFaxProvider(envWithoutKey))
				.rejects.toThrow('API key not found for telnyx provider');
		});

		it('should throw error when Telnyx connection ID missing', async () => {
			const envWithoutConnectionId = {
				...mockEnv,
				FAX_PROVIDER: 'telnyx',
				TELNYX_API_KEY: 'test-key'
			};
			
			await expect(faxService.createFaxProvider(envWithoutConnectionId))
				.rejects.toThrow('TELNYX_CONNECTION_ID is required for Telnyx provider');
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
