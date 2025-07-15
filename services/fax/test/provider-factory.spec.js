import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '../src/providers/provider-factory.js';

// Mock providers
vi.mock('../src/providers/notifyre-provider.js', () => ({
	NotifyreProvider: vi.fn().mockImplementation((apiKey, logger) => ({
		apiKey,
		logger,
		getProviderName: () => 'notifyre'
	}))
}));

vi.mock('../src/providers/telnyx-provider.js', () => ({
	TelnyxProvider: vi.fn().mockImplementation((apiKey, logger, options) => ({
		apiKey,
		logger,
		options,
		getProviderName: () => 'telnyx'
	}))
}));

import { NotifyreProvider } from '../src/providers/notifyre-provider.js';
import { TelnyxProvider } from '../src/providers/telnyx-provider.js';

describe('ProviderFactory', () => {
	let mockLogger;

	beforeEach(() => {
		mockLogger = {
			log: vi.fn()
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('createProvider', () => {
		it('should create Notifyre provider', () => {
			const provider = ProviderFactory.createProvider('notifyre', 'test-api-key', mockLogger);

			expect(NotifyreProvider).toHaveBeenCalledWith('test-api-key', mockLogger);
			expect(provider.getProviderName()).toBe('notifyre');
		});

		it('should create Telnyx provider with options', () => {
			const options = {
				connectionId: 'test-connection-id',
				r2Utils: {},
				env: {}
			};

			const provider = ProviderFactory.createProvider('telnyx', 'test-api-key', mockLogger, options);

			expect(TelnyxProvider).toHaveBeenCalledWith('test-api-key', mockLogger, options);
			expect(provider.getProviderName()).toBe('telnyx');
		});

		it('should handle case insensitive provider names', () => {
			ProviderFactory.createProvider('NOTIFYRE', 'test-key', mockLogger);
			expect(NotifyreProvider).toHaveBeenCalled();

			vi.clearAllMocks();

			ProviderFactory.createProvider('TELNYX', 'test-key', mockLogger, {});
			expect(TelnyxProvider).toHaveBeenCalled();
		});

		it('should throw error for missing provider name', () => {
			expect(() => {
				ProviderFactory.createProvider('', 'test-key', mockLogger);
			}).toThrow('API provider name is required');

			expect(() => {
				ProviderFactory.createProvider(null, 'test-key', mockLogger);
			}).toThrow('API provider name is required');
		});

		it('should throw error for missing API key', () => {
			expect(() => {
				ProviderFactory.createProvider('notifyre', '', mockLogger);
			}).toThrow('API key is required');

			expect(() => {
				ProviderFactory.createProvider('notifyre', null, mockLogger);
			}).toThrow('API key is required');
		});

		it('should throw error for missing logger', () => {
			expect(() => {
				ProviderFactory.createProvider('notifyre', 'test-key', null);
			}).toThrow('Logger is required');
		});

		it('should throw error for unsupported provider', () => {
			expect(() => {
				ProviderFactory.createProvider('unsupported', 'test-key', mockLogger);
			}).toThrow('Unsupported API provider: unsupported. Currently supported: notifyre, telnyx');
		});
	});

	describe('getSupportedProviders', () => {
		it('should return list of supported providers', () => {
			const providers = ProviderFactory.getSupportedProviders();

			expect(providers).toEqual(['notifyre', 'telnyx']);
			expect(providers).toHaveLength(2);
		});
	});

	describe('validateProviderConfig', () => {
		it('should validate Notifyre config correctly', () => {
			const validConfig = { apiKey: 'valid-key' };
			const invalidConfig = { apiKey: '' };
			const missingKeyConfig = {};

			expect(ProviderFactory.validateProviderConfig('notifyre', validConfig)).toBe(true);
			expect(ProviderFactory.validateProviderConfig('notifyre', invalidConfig)).toBe(false);
			expect(ProviderFactory.validateProviderConfig('notifyre', missingKeyConfig)).toBe(false);
		});

		it('should validate Telnyx config correctly', () => {
			const validConfig = {
				apiKey: 'valid-key',
				connectionId: 'valid-connection-id'
			};
			const missingConnectionId = {
				apiKey: 'valid-key'
			};
			const missingApiKey = {
				connectionId: 'valid-connection-id'
			};
			const emptyConnectionId = {
				apiKey: 'valid-key',
				connectionId: ''
			};

			expect(ProviderFactory.validateProviderConfig('telnyx', validConfig)).toBe(true);
			expect(ProviderFactory.validateProviderConfig('telnyx', missingConnectionId)).toBe(false);
			expect(ProviderFactory.validateProviderConfig('telnyx', missingApiKey)).toBe(false);
			expect(ProviderFactory.validateProviderConfig('telnyx', emptyConnectionId)).toBe(false);
		});

		it('should return false for unsupported providers', () => {
			const config = { apiKey: 'test-key' };

			expect(ProviderFactory.validateProviderConfig('unsupported', config)).toBe(false);
		});

		it('should return false for missing API key in any provider', () => {
			expect(ProviderFactory.validateProviderConfig('notifyre', {})).toBe(false);
			expect(ProviderFactory.validateProviderConfig('telnyx', { connectionId: 'test' })).toBe(false);
		});

		it('should handle case insensitive provider names in validation', () => {
			const validConfig = { apiKey: 'valid-key' };

			expect(ProviderFactory.validateProviderConfig('NOTIFYRE', validConfig)).toBe(true);
			expect(ProviderFactory.validateProviderConfig('Notifyre', validConfig)).toBe(true);
		});
	});

	describe('getProviderRequirements', () => {
		it('should return Notifyre requirements', () => {
			const requirements = ProviderFactory.getProviderRequirements('notifyre');

			expect(requirements).toEqual({
				apiKey: {
					required: true,
					type: 'string',
					description: 'Notifyre API token'
				},
				baseUrl: {
					required: false,
					type: 'string',
					default: 'https://api.notifyre.com',
					description: 'Notifyre API base URL'
				}
			});
		});

		it('should return Telnyx requirements', () => {
			const requirements = ProviderFactory.getProviderRequirements('telnyx');

			expect(requirements).toEqual({
				apiKey: {
					required: true,
					type: 'string',
					description: 'Telnyx API token'
				},
				connectionId: {
					required: true,
					type: 'string',
					description: 'Telnyx connection ID (Programmable Fax Application ID)'
				},
				baseUrl: {
					required: false,
					type: 'string',
					default: 'https://api.telnyx.com',
					description: 'Telnyx API base URL'
				},
				r2BucketBinding: {
					required: true,
					type: 'string',
					description: 'Cloudflare R2 bucket binding name (FAX_FILES_BUCKET)'
				},
				r2PublicDomain: {
					required: true,
					type: 'string',
					description: 'R2 public domain for file access (R2_PUBLIC_DOMAIN)'
				}
			});
		});

		it('should return default requirements for unknown providers', () => {
			const requirements = ProviderFactory.getProviderRequirements('unknown');

			expect(requirements).toEqual({
				apiKey: {
					required: true,
					type: 'string',
					description: 'API key for the API provider'
				}
			});
		});

		it('should handle case insensitive provider names in requirements', () => {
			const notifyreReqs = ProviderFactory.getProviderRequirements('NOTIFYRE');
			const telnyxReqs = ProviderFactory.getProviderRequirements('TELNYX');

			expect(notifyreReqs.apiKey.description).toBe('Notifyre API token');
			expect(telnyxReqs.connectionId.description).toBe('Telnyx connection ID (Programmable Fax Application ID)');
		});
	});
});