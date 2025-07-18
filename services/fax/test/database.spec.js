import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseUtils } from '../src/database.js';

// Simple mock query result
let mockQueryResult = {
	data: null,
	error: null,
	count: 0
};

// Mock Supabase client with simpler structure
const mockSupabaseClient = {
	from: vi.fn(() => mockQueryChain)
};

// Create a mock query chain that is properly awaitable
const createAwaitableQueryChain = () => {
	const chain = {
		select: vi.fn(() => chain),
		insert: vi.fn(() => chain),
		update: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		order: vi.fn(() => chain),
		range: vi.fn(() => chain),
		gte: vi.fn(() => chain),
		lte: vi.fn(() => chain),
		single: vi.fn(() => Promise.resolve(mockQueryResult)),
		then: vi.fn((onFulfilled) => {
			return Promise.resolve(mockQueryResult).then(onFulfilled);
		})
	};
	
	// Make the chain object itself awaitable
	return new Proxy(chain, {
		get(target, prop) {
			if (prop === Symbol.asyncIterator) {
				return () => ({
					next: () => Promise.resolve({ value: mockQueryResult, done: true })
				});
			}
			if (prop === 'then') {
				return (onFulfilled, onRejected) => {
					return Promise.resolve(mockQueryResult).then(onFulfilled, onRejected);
				};
			}
			if (prop === 'catch') {
				return (onRejected) => {
					return Promise.resolve(mockQueryResult).catch(onRejected);
				};
			}
			return target[prop];
		}
	});
};

const mockQueryChain = createAwaitableQueryChain();

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => mockSupabaseClient)
}));

// Mock console.log for testing
const mockConsoleLog = vi.fn();
vi.stubGlobal('console', { log: mockConsoleLog });

describe('DatabaseUtils', () => {
	let mockEnv;
	let mockLogger;

	beforeEach(() => {
		mockEnv = {
			SUPABASE_URL: 'https://test.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
		};
		
		mockLogger = {
			log: vi.fn()
		};

		// Reset all mocks
		vi.clearAllMocks();
		mockQueryResult.data = null;
		mockQueryResult.error = null;
		mockQueryResult.count = 0;
		
		// Reset the from method to return a fresh query chain
		mockSupabaseClient.from.mockReturnValue(createAwaitableQueryChain());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getSupabaseAdminClient', () => {
		it('should create admin client with service role key', () => {
			const client = DatabaseUtils.getSupabaseAdminClient(mockEnv);
			
			expect(client).toBeDefined();
			expect(mockConsoleLog).toHaveBeenCalledWith(
				'[DatabaseUtils] Creating Supabase admin client - Using SERVICE_ROLE key (RLS BYPASSED - Admin Access)'
			);
		});

		it('should throw error if service role key is missing', () => {
			const envWithoutKey = {
				SUPABASE_URL: 'https://test.supabase.co'
			};

			expect(() => {
				DatabaseUtils.getSupabaseAdminClient(envWithoutKey);
			}).toThrow('SUPABASE_SERVICE_ROLE_KEY is required for backend operations');
		});
	});

	describe('saveFaxRecord', () => {
		const mockFaxData = {
			id: 'fax_123',
			status: 'queued',
			originalStatus: 'Preparing',
			recipients: ['+1234567890'],
			senderId: '+0987654321',
			subject: 'Test fax',
			pages: 2,
			cost: 0.05,
			clientReference: 'TestApp',
			sentAt: '2024-01-01T00:00:00Z',
			completedAt: null,
			errorMessage: null,
			notifyreResponse: { id: 'fax_123', status: 'Preparing' }
		};

		it('should save fax record successfully', async () => {
			const savedRecord = {
				id: 'db_123',
				notifyre_fax_id: 'fax_123',
				user_id: 'user_123'
			};

			mockQueryResult.data = savedRecord;
			mockQueryResult.error = null;

			const result = await DatabaseUtils.saveFaxRecord(
				mockFaxData, 
				'user_123', 
				mockEnv, 
				mockLogger
			);

			expect(result).toEqual(savedRecord);
			expect(mockLogger.log).toHaveBeenCalledWith('DEBUG', 'Supabase environment check', {
				hasUrl: true,
				hasServiceRoleKey: true,
				hasUserId: true,
				urlPrefix: 'https://test.supabase.co...'
			});
			expect(mockLogger.log).toHaveBeenCalledWith('INFO', 'Fax record saved successfully to database', {
				recordId: 'db_123',
				faxId: 'fax_123',
				userId: 'user_123',
				isAnonymous: false
			});
		});

		it('should handle database errors gracefully', async () => {
			mockQueryResult.data = null;
			mockQueryResult.error = { message: 'Database error', code: '23505' };

			const result = await DatabaseUtils.saveFaxRecord(
				mockFaxData, 
				'user_123', 
				mockEnv, 
				mockLogger
			);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to save fax record to database', {
				error: 'Database error',
				code: '23505',
				faxId: 'fax_123'
			});
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Error saving fax record to database', {
				error: 'Database error',
				faxId: 'fax_123',
				userId: 'user_123',
				isAnonymous: false
			});
		});

		it('should save anonymous user fax record', async () => {
			const savedRecord = {
				id: 'db_124',
				notifyre_fax_id: 'fax_123',
				user_id: null
			};

			mockQueryResult.data = savedRecord;
			mockQueryResult.error = null;

			const result = await DatabaseUtils.saveFaxRecord(
				mockFaxData, 
				null, 
				mockEnv, 
				mockLogger
			);

			expect(result).toEqual(savedRecord);
			expect(mockLogger.log).toHaveBeenCalledWith('DEBUG', 'Saving fax record to database', 
				expect.objectContaining({
					isAnonymous: true
				})
			);
		});

		it('should handle missing fax data gracefully', async () => {
			const result = await DatabaseUtils.saveFaxRecord(
				null, 
				'user_123', 
				mockEnv, 
				mockLogger
			);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Error saving fax record to database',
				expect.objectContaining({
					faxId: undefined
				})
			);
		});

		it('should reject fax data without valid ID', async () => {
			const faxDataWithoutId = {
				// Missing 'id' field
				status: 'queued',
				recipients: ['+1234567890'],
				pages: 1,
				cost: 0.03
			};

			const result = await DatabaseUtils.saveFaxRecord(
				faxDataWithoutId,
				'user_123', 
				mockEnv, 
				mockLogger
			);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Cannot save fax record: missing notifyre_fax_id', {
				faxData: faxDataWithoutId,
				hasId: false,
				userId: 'user_123'
			});
		});
	});

	describe('updateFaxRecord', () => {
		const updateData = {
			status: 'delivered',
			original_status: 'Successful',
			completed_at: '2024-01-01T00:05:00Z',
			pages: 2,
			cost: 0.05
		};

		it('should update fax record successfully', async () => {
			const updatedRecord = {
				id: 'db_123',
				notifyre_fax_id: 'fax_123',
				status: 'delivered'
			};

			mockQueryResult.data = updatedRecord;
			mockQueryResult.error = null;

			const result = await DatabaseUtils.updateFaxRecord(
				'fax_123', 
				updateData, 
				mockEnv, 
				mockLogger
			);

			expect(result).toEqual(updatedRecord);
			expect(mockLogger.log).toHaveBeenCalledWith('DEBUG', 'Updating fax record in database', {
				faxId: 'fax_123',
				idType: 'provider_fax_id',
				updateFields: Object.keys(updateData)
			});
			expect(mockLogger.log).toHaveBeenCalledWith('INFO', 'Fax record updated successfully in database', {
				recordId: 'db_123',
				faxId: 'fax_123',
				idType: 'provider_fax_id'
			});
		});

		it('should return null if Supabase not configured', async () => {
			const envWithoutSupabase = {};

			const result = await DatabaseUtils.updateFaxRecord(
				'fax_123', 
				updateData, 
				envWithoutSupabase, 
				mockLogger
			);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('WARN', 'Supabase not configured, skipping fax record update');
		});

		it('should handle update errors gracefully', async () => {
			mockQueryResult.data = null;
			mockQueryResult.error = { message: 'Record not found', code: '23503' };

			const result = await DatabaseUtils.updateFaxRecord(
				'fax_123', 
				updateData, 
				mockEnv, 
				mockLogger
			);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to update fax record in database', {
				error: 'Record not found',
				code: '23503',
				faxId: 'fax_123',
				idType: 'provider_fax_id'
			});
		});
	});



	describe('storeWebhookEvent', () => {
		const mockWebhookData = {
			event: 'fax.delivered',
			faxId: 'fax_123',
			processedData: { status: 'delivered', pages: 2 },
			rawPayload: { type: 'fax.delivered', data: { id: 'fax_123' } }
		};

		it('should store webhook event successfully', async () => {
			mockQueryResult.error = null;

			const result = await DatabaseUtils.storeWebhookEvent(
				mockWebhookData, 
				mockEnv, 
				mockLogger
			);

			expect(result).toBe(true);
			expect(mockSupabaseClient.from).toHaveBeenCalledWith('fax_webhook_events');
			expect(mockLogger.log).toHaveBeenCalledWith('DEBUG', 'Webhook event stored successfully', {
				event: 'fax.delivered',
				faxId: 'fax_123'
			});
		});

		it('should handle storage errors gracefully', async () => {
			// Override the insert method to return an error
			mockSupabaseClient.from.mockReturnValueOnce({
				insert: vi.fn(() => Promise.resolve({ error: { message: 'Insert failed' } }))
			});

			const result = await DatabaseUtils.storeWebhookEvent(
				mockWebhookData, 
				mockEnv, 
				mockLogger
			);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to store webhook event', {
				error: 'Insert failed'
			});
		});

		it('should handle unexpected errors', async () => {
			// Mock Supabase client to throw an error
			mockSupabaseClient.from.mockImplementationOnce(() => {
				throw new Error('Connection error');
			});

			const result = await DatabaseUtils.storeWebhookEvent(
				mockWebhookData, 
				mockEnv, 
				mockLogger
			);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Error storing webhook event', {
				error: 'Connection error'
			});
		});
	});
}); 
