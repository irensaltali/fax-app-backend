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

describe('Usage Tracking', () => {
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

	describe('recordUsage', () => {
		it('should record usage successfully', async () => {
			const usageData = {
				userId: 'test-user-id',
				type: 'fax',
				unitType: 'page',
				usageAmount: 5,
				timestamp: '2024-01-25T10:00:00Z',
				metadata: {
					fax_id: 'test-fax-id',
					provider: 'telnyx',
				},
			};

			const expectedRecord = {
				user_id: usageData.userId,
				type: usageData.type,
				unit_type: usageData.unitType,
				usage_amount: usageData.usageAmount,
				timestamp: usageData.timestamp,
				metadata: usageData.metadata,
			};

			mockQueryResult.data = {
				id: 'usage-id',
				...expectedRecord,
			};
			mockQueryResult.error = null;

			const result = await DatabaseUtils.recordUsage(usageData, mockEnv, mockLogger);

			expect(mockSupabaseClient.from).toHaveBeenCalledWith('usage');
			expect(result).toEqual(mockQueryResult.data);
		});

		it('should handle missing Supabase configuration', async () => {
			const usageData = {
				userId: 'test-user-id',
				type: 'fax',
				unitType: 'page',
				usageAmount: 5,
			};

			const envWithoutSupabase = {};

			const result = await DatabaseUtils.recordUsage(usageData, envWithoutSupabase, mockLogger);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('WARN', 'Supabase not configured, skipping usage recording');
		});

		it('should handle database errors', async () => {
			const usageData = {
				userId: 'test-user-id',
				type: 'fax',
				unitType: 'page',
				usageAmount: 5,
			};

			mockQueryResult.data = null;
			mockQueryResult.error = { message: 'Database error' };

			const result = await DatabaseUtils.recordUsage(usageData, mockEnv, mockLogger);

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to record usage', {
				error: 'Database error',
				usageData,
			});
		});
	});


}); 
