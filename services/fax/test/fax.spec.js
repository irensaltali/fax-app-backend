import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi } from 'vitest';

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

import FaxService from '../src/fax.js';

describe('Fax Service', () => {
	let faxService;
	let mockEnv;
	let mockSagContext;

	beforeAll(() => {
		mockEnv = {
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

	describe('sendFax', () => {
		it('should queue a fax successfully', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipient: '+1234567890',
					pages: 2
				})
			});

			const result = await faxService.sendFax(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Fax queued successfully');
			expect(result.data.recipient).toBe('+1234567890');
			expect(result.data.pages).toBe(2);
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
			expect(['sent', 'pending']).toContain(result.data.status);
		});
	});

	describe('health handlers', () => {
		it('should return healthy status (unauthenticated)', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/health', { method: 'GET' });
			const result = await faxService.health(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Fax service healthy');
			expect(result.data.service).toBe('fax');
			expect(result.data.version).toBe('1.0.0');
		});

		it('should return healthy status with user info (authenticated)', async () => {
			const request = new Request('https://api.sendfax.pro/v1/fax/health/protected', { method: 'GET' });
			const result = await faxService.healthProtected(request, JSON.stringify(mockEnv), JSON.stringify(mockSagContext));
			expect(result.statusCode).toBe(200);
			expect(result.message).toBe('Fax service healthy (authenticated)');
			expect(result.data.service).toBe('fax');
			expect(result.data.user.sub).toBe('test-user-123');
			expect(result.data.version).toBe('1.0.0');
		});
	});

	describe('validateSupabaseWebhookSecret', () => {
		it('should validate correct webhook secret', () => {
			const request = new Request('https://example.com', {
				headers: { 'X-Supabase-Event-Secret': 'test-webhook-secret' }
			});
			const result = faxService.validateSupabaseWebhookSecret(request, JSON.stringify(mockEnv));
			expect(result).toBe(true);
		});

		it('should reject incorrect webhook secret', () => {
			const request = new Request('https://example.com', {
				headers: { 'X-Supabase-Event-Secret': 'wrong-secret' }
			});
			const result = faxService.validateSupabaseWebhookSecret(request, JSON.stringify(mockEnv));
			expect(result).toBe(false);
		});
	});
});
