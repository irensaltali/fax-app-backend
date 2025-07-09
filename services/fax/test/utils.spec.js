import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { 
	Logger, 
	FileUtils, 
	NotifyreApiUtils, 
	WebhookUtils,
	NOTIFYRE_STATUS_MAP 
} from '../src/utils.js';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: vi.fn(() => ({
			select: vi.fn(() => ({ eq: vi.fn() })),
			insert: vi.fn(() => ({ select: vi.fn() })),
			update: vi.fn(() => ({ eq: vi.fn() }))
		}))
	}))
}));

// Mock fetch globally
global.fetch = vi.fn();

// Mock crypto for webhook signature verification
global.crypto = {
	subtle: {
		importKey: vi.fn(),
		sign: vi.fn()
	}
};

// Mock btoa for base64 encoding
global.btoa = vi.fn((str) => Buffer.from(str, 'binary').toString('base64'));
global.atob = vi.fn((str) => Buffer.from(str, 'base64').toString('binary'));

describe('Utils Module', () => {
	describe('Logger', () => {
		let logger;
		let mockConsoleLog;

		beforeEach(() => {
			mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
			logger = new Logger({ LOG_LEVEL: 'DEBUG' });
		});

		afterEach(() => {
			mockConsoleLog.mockRestore();
		});

		it('should create logger with default log level', () => {
			const loggerNoEnv = new Logger();
			expect(loggerNoEnv.getLogLevel()).toBe(0); // DEBUG level
		});

		it('should respect LOG_LEVEL from environment', () => {
			const infoLogger = new Logger({ LOG_LEVEL: 'INFO' });
			expect(infoLogger.getLogLevel()).toBe(1); // INFO level

			const errorLogger = new Logger({ LOG_LEVEL: 'ERROR' });
			expect(errorLogger.getLogLevel()).toBe(3); // ERROR level
		});

		it('should log messages at or above the current log level', () => {
			const infoLogger = new Logger({ LOG_LEVEL: 'INFO' });
			
			infoLogger.log('DEBUG', 'Debug message');
			expect(mockConsoleLog).not.toHaveBeenCalled();

			infoLogger.log('INFO', 'Info message');
			expect(mockConsoleLog).toHaveBeenCalledWith(
				expect.stringMatching(/\[.*\] \[INFO\] Info message/),
				''
			);

			infoLogger.log('ERROR', 'Error message');
			expect(mockConsoleLog).toHaveBeenCalledWith(
				expect.stringMatching(/\[.*\] \[ERROR\] Error message/),
				''
			);
		});

		it('should safely log complex objects', () => {
			const complexObject = {
				name: 'test',
				nested: { value: 123 },
				array: [1, 2, 3]
			};

			logger.log('INFO', 'Complex object', complexObject);
			expect(mockConsoleLog).toHaveBeenCalledWith(
				expect.stringMatching(/\[.*\] \[INFO\] Complex object/),
				expect.objectContaining({
					name: 'test',
					nested: expect.objectContaining({ value: 123 }),
					array: [1, 2, 3]
				})
			);
		});

		it('should handle circular references safely', () => {
			const circularObj = { name: 'test' };
			circularObj.self = circularObj;

			logger.log('INFO', 'Circular object', circularObj);
			expect(mockConsoleLog).toHaveBeenCalledWith(
				expect.stringMatching(/\[.*\] \[INFO\] Circular object/),
				expect.objectContaining({
					name: 'test',
					self: expect.objectContaining({
						name: 'test',
						self: expect.objectContaining({
							name: 'test'
						})
					})
				})
			);
		});

		it('should handle error objects', () => {
			const error = new Error('Test error');
			error.code = 'TEST_CODE';

			logger.log('ERROR', 'Error occurred', error);
			expect(mockConsoleLog).toHaveBeenCalledWith(
				expect.stringMatching(/\[.*\] \[ERROR\] Error occurred/),
				expect.objectContaining({
					name: 'Error',
					message: 'Test error',
					stack: expect.any(String)
				})
			);
		});

		it('should limit array elements to 10', () => {
			const largeArray = Array.from({ length: 15 }, (_, i) => i);
			
			logger.log('INFO', 'Large array', largeArray);
			expect(mockConsoleLog).toHaveBeenCalledWith(
				expect.stringMatching(/\[.*\] \[INFO\] Large array/),
				expect.arrayContaining([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
			);
		});

		it('should handle Date objects', () => {
			const date = new Date('2024-01-01T00:00:00Z');
			
			logger.log('INFO', 'Date object', { date });
			expect(mockConsoleLog).toHaveBeenCalledWith(
				expect.stringMatching(/\[.*\] \[INFO\] Date object/),
				expect.objectContaining({
					date: '2024-01-01T00:00:00.000Z'
				})
			);
		});
	});

	describe('FileUtils', () => {
		describe('arrayBufferToBase64', () => {
			it('should convert Uint8Array to base64', () => {
				const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
				const result = FileUtils.arrayBufferToBase64(data);
				expect(result).toBe('SGVsbG8='); // Base64 for "Hello"
			});

			it('should handle large arrays without stack overflow', () => {
				const largeData = new Uint8Array(100000); // 100KB
				largeData.fill(65); // Fill with 'A'
				
				expect(() => {
					FileUtils.arrayBufferToBase64(largeData);
				}).not.toThrow();
			});

			it('should handle empty arrays', () => {
				const emptyData = new Uint8Array(0);
				const result = FileUtils.arrayBufferToBase64(emptyData);
				expect(result).toBe('');
			});
		});

		describe('processFileForFax', () => {
			let mockLogger;

			beforeEach(() => {
				mockLogger = {
					log: vi.fn()
				};
			});

			it('should process File/Blob objects', async () => {
				const mockFile = {
					name: 'test.pdf',
					size: 1024,
					type: 'application/pdf',
					arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10))
				};

				Object.setPrototypeOf(mockFile, File.prototype);

				const result = await FileUtils.processFileForFax(mockFile, 0, mockLogger);
				expect(result).toBeInstanceOf(Blob);
				expect(mockLogger.log).toHaveBeenCalledWith('DEBUG', 'Converting Blob/File to base64', {
					filename: 'test.pdf',
					size: 1024,
					type: 'application/pdf'
				});
			});

			it('should skip files exceeding size limit', async () => {
				const mockFile = {
					name: 'large.pdf',
					size: 200 * 1024 * 1024, // 200MB
					type: 'application/pdf'
				};

				Object.setPrototypeOf(mockFile, File.prototype);

				const result = await FileUtils.processFileForFax(mockFile, 0, mockLogger);
				expect(result).toBeNull();
				expect(mockLogger.log).toHaveBeenCalledWith('WARN', 'File size exceeds limit', {
					size: 200 * 1024 * 1024,
					filename: 'large.pdf'
				});
			});

			it('should handle files with base64 data', async () => {
				const fileWithData = {
					filename: 'test.pdf',
					data: 'U2FtcGxlQmFzZTY0RGF0YQ==',
					name: 'test.pdf'
				};

				const result = await FileUtils.processFileForFax(fileWithData, 0, mockLogger);
				expect(result).toBe(fileWithData);
				expect(mockLogger.log).toHaveBeenCalledWith('DEBUG', 'Using existing base64 data', {
					filename: 'test.pdf',
					dataLength: 24
				});
			});

			it('should handle errors gracefully', async () => {
				const mockFile = {
					name: 'test.pdf',
					size: 1024,
					type: 'application/pdf',
					arrayBuffer: vi.fn().mockRejectedValue(new Error('File read error'))
				};

				Object.setPrototypeOf(mockFile, File.prototype);

				const result = await FileUtils.processFileForFax(mockFile, 0, mockLogger);
				expect(result).toBeNull();
				expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Error processing file', {
					fileIndex: 0,
					filename: 'document_1.pdf',
					error: 'File read error'
				});
			});
		});
	});

	describe('NotifyreApiUtils', () => {
		let mockLogger;

		beforeEach(() => {
			mockLogger = {
				log: vi.fn()
			};
			fetch.mockClear();
		});

		describe('getHeaders', () => {
			it('should return correct headers', () => {
				const headers = NotifyreApiUtils.getHeaders('test-api-key');
				expect(headers).toEqual({
					'x-api-token': 'test-api-key',
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'User-Agent': 'Notifyre-Fax-Service/2.0.0'
				});
			});
		});

		describe('makeRequest', () => {
			it('should make successful GET request', async () => {
				const mockResponse = { id: 'test', status: 'success' };
				fetch.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(mockResponse)
				});

				const result = await NotifyreApiUtils.makeRequest('/test', 'GET', null, 'api-key', mockLogger);
				
				expect(fetch).toHaveBeenCalledWith('https://api.notifyre.com/test', {
					method: 'GET',
					headers: expect.objectContaining({
						'x-api-token': 'api-key'
					})
				});
				expect(result).toEqual(mockResponse);
			});

			it('should make successful POST request with JSON data', async () => {
				const requestData = { message: 'test' };
				const mockResponse = { id: 'test', status: 'queued' };
				
				fetch.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(mockResponse)
				});

				const result = await NotifyreApiUtils.makeRequest('/test', 'POST', requestData, 'api-key', mockLogger);
				
				expect(fetch).toHaveBeenCalledWith('https://api.notifyre.com/test', {
					method: 'POST',
					headers: expect.objectContaining({
						'x-api-token': 'api-key',
						'Content-Type': 'application/json'
					}),
					body: JSON.stringify(requestData)
				});
				expect(result).toEqual(mockResponse);
			});

			it('should handle FormData requests', async () => {
				const formData = new FormData();
				formData.append('file', 'test');
				
				fetch.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ success: true })
				});

				await NotifyreApiUtils.makeRequest('/upload', 'POST', formData, 'api-key', mockLogger);
				
				expect(fetch).toHaveBeenCalledWith('https://api.notifyre.com/upload', {
					method: 'POST',
					headers: expect.not.objectContaining({
						'Content-Type': 'application/json'
					}),
					body: formData
				});
			});

			it('should handle API errors', async () => {
				fetch.mockResolvedValueOnce({
					ok: false,
					status: 400,
					statusText: 'Bad Request',
					json: () => Promise.resolve({ error: 'Invalid request' })
				});

				await expect(
					NotifyreApiUtils.makeRequest('/test', 'POST', {}, 'api-key', mockLogger)
				).rejects.toThrow('Notifyre API error: 400 Bad Request');

				expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Notifyre API error', expect.objectContaining({
					status: 400,
					statusText: 'Bad Request'
				}));
			});

			it('should handle network errors', async () => {
				fetch.mockRejectedValueOnce(new Error('Network error'));

				await expect(
					NotifyreApiUtils.makeRequest('/test', 'GET', null, 'api-key', mockLogger)
				).rejects.toThrow('Network error');

				expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Notifyre API request failed', expect.objectContaining({
					error: 'Network error'
				}));
			});

			it('should handle JSON serialization errors', async () => {
				const circularData = {};
				circularData.self = circularData;

				await expect(
					NotifyreApiUtils.makeRequest('/test', 'POST', circularData, 'api-key', mockLogger)
				).rejects.toThrow('Request data serialization failed');
			});
		});
	});

	describe('WebhookUtils', () => {
		let mockLogger;

		beforeEach(() => {
			mockLogger = {
				log: vi.fn()
			};
		});

		describe('verifyNotifyreSignature', () => {
			beforeEach(() => {
				global.crypto.subtle.importKey.mockResolvedValue('mock-key');
				global.crypto.subtle.sign.mockResolvedValue(new ArrayBuffer(32));
				global.btoa.mockReturnValue('mock-signature');
			});

			it('should return false if signature or secret is missing', async () => {
				const mockRequest = { clone: () => ({ text: () => Promise.resolve('body') }) };
				
				let result = await WebhookUtils.verifyNotifyreSignature(mockRequest, '', 'signature', mockLogger);
				expect(result).toBe(false);

				result = await WebhookUtils.verifyNotifyreSignature(mockRequest, 'secret', '', mockLogger);
				expect(result).toBe(false);
			});

			it('should verify webhook signature correctly', async () => {
				const mockRequest = { 
					clone: () => ({ 
						text: () => Promise.resolve('webhook-body') 
					}) 
				};

				const result = await WebhookUtils.verifyNotifyreSignature(
					mockRequest, 
					'webhook-secret', 
					'mock-signature', 
					mockLogger
				);

				expect(result).toBe(true);
				expect(crypto.subtle.importKey).toHaveBeenCalledWith(
					'raw',
					expect.any(Uint8Array),
					{ name: 'HMAC', hash: 'SHA-256' },
					false,
					['sign']
				);
			});

			it('should handle signature verification errors', async () => {
				const mockRequest = { 
					clone: () => ({ 
						text: () => Promise.reject(new Error('Request error')) 
					}) 
				};

				const result = await WebhookUtils.verifyNotifyreSignature(
					mockRequest, 
					'webhook-secret', 
					'signature', 
					mockLogger
				);

				expect(result).toBe(false);
				expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Error verifying webhook signature', {
					error: 'Request error'
				});
			});
		});

		describe('validateSupabaseWebhookSecret', () => {
			it('should validate correct webhook secret', () => {
				const mockRequest = {
					headers: {
						get: vi.fn().mockReturnValue('correct-secret')
					}
				};
				const mockEnv = {
					SUPABASE_WEBHOOK_SECRET: 'correct-secret'
				};

				const result = WebhookUtils.validateSupabaseWebhookSecret(mockRequest, mockEnv);
				expect(result).toBe(true);
				expect(mockRequest.headers.get).toHaveBeenCalledWith('X-Supabase-Event-Secret');
			});

			it('should reject incorrect webhook secret', () => {
				const mockRequest = {
					headers: {
						get: vi.fn().mockReturnValue('wrong-secret')
					}
				};
				const mockEnv = {
					SUPABASE_WEBHOOK_SECRET: 'correct-secret'
				};

				const result = WebhookUtils.validateSupabaseWebhookSecret(mockRequest, mockEnv);
				expect(result).toBe(false);
			});

			it('should handle missing header', () => {
				const mockRequest = {
					headers: {
						get: vi.fn().mockReturnValue(null)
					}
				};
				const mockEnv = {
					SUPABASE_WEBHOOK_SECRET: 'secret'
				};

				const result = WebhookUtils.validateSupabaseWebhookSecret(mockRequest, mockEnv);
				expect(result).toBe(false);
			});
		});
	});



	describe('NOTIFYRE_STATUS_MAP', () => {
		it('should have correct status mappings', () => {
			expect(NOTIFYRE_STATUS_MAP).toEqual({
				'Preparing': 'queued',
				'In Progress': 'processing',
				'Sending': 'sending',
				'Successful': 'delivered',
				'Delivered': 'delivered',
				'Failed': 'failed',
				'Failed - Busy': 'busy',
				'Failed - No Answer': 'no-answer',
				'Failed - Check number and try again': 'failed',
				'Failed - Connection not a Fax Machine': 'failed',
				'Cancelled': 'cancelled',
				'Queued': 'queued',
				'Processing': 'processing',
				'Receiving': 'receiving'
			});
		});

		it('should map all expected Notifyre statuses', () => {
			const expectedStatuses = [
				'Preparing', 'In Progress', 'Sending', 'Successful', 'Delivered',
				'Failed', 'Failed - Busy', 'Failed - No Answer', 
				'Failed - Check number and try again',
				'Failed - Connection not a Fax Machine', 'Cancelled',
				'Queued', 'Processing', 'Receiving'
			];

			expectedStatuses.forEach(status => {
				expect(NOTIFYRE_STATUS_MAP).toHaveProperty(status);
				expect(typeof NOTIFYRE_STATUS_MAP[status]).toBe('string');
			});
		});
	});
}); 
