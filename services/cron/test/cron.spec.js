/**
 * Tests for the Cron Service - Fax Status Polling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, NotifyreApiUtils, DatabaseUtils, NOTIFYRE_STATUS_MAP } from '../src/utils.js';

// Mock environment
const mockEnv = {
	NOTIFYRE_API_KEY: 'test-api-key',
	SUPABASE_URL: 'https://test.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
	LOG_LEVEL: 'DEBUG'
};

// Mock logger
const mockLogger = {
	log: vi.fn()
};

// Mock fetch
global.fetch = vi.fn();

describe('Cron Service - Fax Status Polling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		
		// Reset fetch mock
		global.fetch.mockReset();
	});

	it('should fetch faxes from last 12 hours from Notifyre API', async () => {
		// Mock Notifyre API response
		const mockFaxes = [
			{
				id: 'fax_123',
				status: 'Successful',
				pages: 2,
				cost: 0.05,
				recipients: ['+1234567890'],
				completedAt: '2025-01-01T12:00:00Z'
			},
			{
				id: 'fax_456',
				status: 'Failed',
				pages: 1,
				cost: 0.03,
				recipients: ['+0987654321'],
				errorMessage: 'Line busy'
			}
		];

		global.fetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				data: mockFaxes
			})
		});

		// Test the function
		const result = await NotifyreApiUtils.getFaxesFromLast12Hours('test-api-key', mockLogger);

		// Verify API call
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining('/fax/send?sort=desc&fromDate='),
			expect.objectContaining({
				method: 'GET',
				headers: expect.objectContaining({
					'x-api-token': 'test-api-key'
				})
			})
		);

		// Verify result
		expect(result).toEqual(mockFaxes);
		expect(result).toHaveLength(2);
	});

	it('should handle empty response from Notifyre API', async () => {
		global.fetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				data: []
			})
		});

		const result = await NotifyreApiUtils.getFaxesFromLast12Hours('test-api-key', mockLogger);

		expect(result).toEqual([]);
		expect(mockLogger.log).toHaveBeenCalledWith('INFO', 'Retrieved faxes from Notifyre API', {
			faxCount: 0,
			fromDate: expect.any(Number),
			toDate: expect.any(Number),
			endpoint: expect.stringContaining('/fax/send?sort=desc&fromDate=')
		});
	});

	it('should handle API errors gracefully', async () => {
		global.fetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			statusText: 'Internal Server Error',
			json: () => Promise.resolve({
				error: 'Server error'
			})
		});

		await expect(
			NotifyreApiUtils.getFaxesFromLast12Hours('test-api-key', mockLogger)
		).rejects.toThrow('Notifyre API error: 500 Internal Server Error');
	});

	it('should calculate 12 hours ago timestamp correctly', async () => {
		global.fetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ data: [] })
		});

		const beforeCall = new Date();
		const twelveHoursAgo = new Date(beforeCall.getTime() - (12 * 60 * 60 * 1000));

		await NotifyreApiUtils.getFaxesFromLast12Hours('test-api-key', mockLogger);

		const fetchCall = global.fetch.mock.calls[0];
		const url = fetchCall[0];
		const fromDateParam = new URL(url).searchParams.get('fromDate');
		const toDateParam = new URL(url).searchParams.get('toDate');
		
		// Convert Unix timestamps back to milliseconds
		const fromDate = new Date(parseInt(fromDateParam) * 1000);
		const toDate = new Date(parseInt(toDateParam) * 1000);

		// Should be approximately 12 hours ago (within 1 minute tolerance)
		const expectedFromTime = twelveHoursAgo.getTime();
		const actualFromTime = fromDate.getTime();
		const timeDiff = Math.abs(expectedFromTime - actualFromTime);
		expect(timeDiff).toBeLessThan(60000); // Less than 1 minute difference

		// toDate should be approximately now
		const expectedToTime = beforeCall.getTime();
		const actualToTime = toDate.getTime();
		const toTimeDiff = Math.abs(expectedToTime - actualToTime);
		expect(toTimeDiff).toBeLessThan(60000); // Less than 1 minute difference
	});

	it('should map Notifyre status to internal status correctly', () => {
		expect(NOTIFYRE_STATUS_MAP['Successful']).toBe('delivered');
		expect(NOTIFYRE_STATUS_MAP['Failed']).toBe('failed');
		expect(NOTIFYRE_STATUS_MAP['Queued']).toBe('queued');
		expect(NOTIFYRE_STATUS_MAP['Sending']).toBe('sending');
		expect(NOTIFYRE_STATUS_MAP['Processing']).toBe('processing');
	});
}); 
