import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { R2Utils } from '../src/r2-utils.js';

describe('R2Utils', () => {
	let r2Utils;
	let mockEnv;
	let mockLogger;
	let mockBucket;

	beforeEach(() => {
		// Mock logger
		mockLogger = {
			log: vi.fn()
		};

		// Mock R2 bucket
		mockBucket = {
			put: vi.fn().mockResolvedValue(undefined),
			get: vi.fn().mockResolvedValue({
				url: 'https://example.r2.cloudflarestorage.com/bucket/test-file.pdf'
			}),
			head: vi.fn().mockResolvedValue({
				size: 1024,
				etag: '"abc123"',
				uploaded: new Date(),
				httpMetadata: { contentType: 'application/pdf' },
				customMetadata: { uploadedBy: 'test' }
			}),
			delete: vi.fn().mockResolvedValue(undefined),
			name: 'test-bucket'
		};

		// Mock environment
		mockEnv = {
			FAX_FILES_BUCKET: mockBucket,
			CLOUDFLARE_ACCOUNT_ID: 'test-account-id'
		};

		r2Utils = new R2Utils(mockEnv, mockLogger);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should initialize with correct defaults', () => {
			expect(r2Utils.env).toBe(mockEnv);
			expect(r2Utils.logger).toBe(mockLogger);
			expect(r2Utils.bucket).toBe(mockBucket);
			expect(r2Utils.defaultExpirationSeconds).toBe(12 * 60 * 60); // 12 hours
		});
	});

	describe('uploadFile', () => {
		it('should upload file and return presigned URL', async () => {
			const filename = 'test-file.pdf';
			const fileData = new Uint8Array([1, 2, 3, 4]);
			const contentType = 'application/pdf';

			const result = await r2Utils.uploadFile(filename, fileData, contentType);

			expect(mockBucket.put).toHaveBeenCalledWith(filename, fileData, {
				httpMetadata: {
					contentType
				},
				customMetadata: {
					uploadedAt: expect.any(String),
					uploadedBy: 'fax-service',
					expirationSeconds: '43200'
				}
			});

			expect(mockBucket.get).toHaveBeenCalledWith(filename, {
				onlyIf: {}
			});

			expect(result).toContain('https://');
			expect(result).toContain('X-Amz-Expires=43200');
			expect(mockLogger.log).toHaveBeenCalledWith('INFO', 'File uploaded to R2 successfully', {
				filename,
				hasPresignedUrl: true,
				expirationHours: 12
			});
		});

		it('should use custom expiration time', async () => {
			const filename = 'test-file.pdf';
			const fileData = new Uint8Array([1, 2, 3, 4]);
			const customExpiration = 3600; // 1 hour

			await r2Utils.uploadFile(filename, fileData, 'application/pdf', customExpiration);

			expect(mockBucket.put).toHaveBeenCalledWith(filename, fileData, {
				httpMetadata: {
					contentType: 'application/pdf'
				},
				customMetadata: {
					uploadedAt: expect.any(String),
					uploadedBy: 'fax-service',
					expirationSeconds: '3600'
				}
			});
		});

		it('should handle ArrayBuffer file data', async () => {
			const filename = 'test-file.pdf';
			const fileData = new ArrayBuffer(4);
			const view = new Uint8Array(fileData);
			view.set([1, 2, 3, 4]);

			const result = await r2Utils.uploadFile(filename, fileData);

			expect(mockBucket.put).toHaveBeenCalledWith(filename, fileData, expect.any(Object));
			expect(result).toContain('https://');
		});

		it('should throw error when bucket not configured', async () => {
			r2Utils.bucket = null;

			await expect(r2Utils.uploadFile('test.pdf', new Uint8Array([1, 2, 3])))
				.rejects.toThrow('R2 bucket not configured');
		});

		it('should throw error when bucket.put fails', async () => {
			mockBucket.put.mockRejectedValue(new Error('Upload failed'));

			await expect(r2Utils.uploadFile('test.pdf', new Uint8Array([1, 2, 3])))
				.rejects.toThrow('Upload failed');

			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to upload file to R2', {
				filename: 'test.pdf',
				error: 'Upload failed',
				stack: expect.any(String)
			});
		});

		it('should fall back to generateR2PresignedUrl when bucket.get fails', async () => {
			mockBucket.get.mockResolvedValue(null);

			const result = await r2Utils.uploadFile('test.pdf', new Uint8Array([1, 2, 3]));

			expect(result).toContain('https://test-account-id.r2.cloudflarestorage.com');
			expect(result).toContain('X-Amz-Expires=43200');
		});
	});

	describe('getPresignedUrl', () => {
		it('should generate presigned URL with default expiration', async () => {
			const filename = 'test-file.pdf';

			const result = await r2Utils.getPresignedUrl(filename);

			expect(mockBucket.get).toHaveBeenCalledWith(filename, {
				onlyIf: {}
			});
			expect(result).toContain('https://');
			expect(result).toContain('X-Amz-Expires=43200');
		});

		it('should generate presigned URL with custom expiration', async () => {
			const filename = 'test-file.pdf';
			const customExpiration = 1800; // 30 minutes

			const result = await r2Utils.getPresignedUrl(filename, customExpiration);

			expect(result).toContain('X-Amz-Expires=1800');
		});

		it('should throw error when bucket not configured', async () => {
			r2Utils.bucket = null;

			await expect(r2Utils.getPresignedUrl('test.pdf'))
				.rejects.toThrow('R2 bucket not configured');
		});

		it('should handle bucket.get returning null', async () => {
			mockBucket.get.mockResolvedValue(null);

			const result = await r2Utils.getPresignedUrl('test.pdf');

			expect(result).toContain('https://test-account-id.r2.cloudflarestorage.com');
		});

		it('should log error and rethrow when bucket.get fails', async () => {
			mockBucket.get.mockRejectedValue(new Error('Get failed'));

			await expect(r2Utils.getPresignedUrl('test.pdf'))
				.rejects.toThrow('Get failed');

			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to generate presigned URL', {
				filename: 'test.pdf',
				error: 'Get failed'
			});
		});
	});

	describe('generateR2PresignedUrl', () => {
		it('should generate valid presigned URL structure', async () => {
			const filename = 'test-file.pdf';
			const expiration = 3600;

			const result = await r2Utils.generateR2PresignedUrl(filename, expiration);

			expect(result).toContain('https://test-account-id.r2.cloudflarestorage.com');
			expect(result).toContain('test-bucket');
			expect(result).toContain('test-file.pdf');
			expect(result).toContain('X-Amz-Expires=3600');
			expect(result).toContain('X-Amz-Date=');
		});

		it('should handle bucket without name property', async () => {
			mockBucket.name = undefined;

			const result = await r2Utils.generateR2PresignedUrl('test.pdf', 3600);

			expect(result).toContain('fax-files'); // default bucket name
		});
	});

	describe('fileExists', () => {
		it('should return true when file exists', async () => {
			const result = await r2Utils.fileExists('existing-file.pdf');

			expect(mockBucket.head).toHaveBeenCalledWith('existing-file.pdf');
			expect(result).toBe(true);
		});

		it('should return false when file does not exist', async () => {
			mockBucket.head.mockResolvedValue(null);

			const result = await r2Utils.fileExists('non-existing-file.pdf');

			expect(result).toBe(false);
			expect(mockLogger.log).toHaveBeenCalledWith('DEBUG', 'File does not exist in R2', {
				filename: 'non-existing-file.pdf'
			});
		});

		it('should return false when bucket not configured', async () => {
			r2Utils.bucket = null;

			const result = await r2Utils.fileExists('test.pdf');

			expect(result).toBe(false);
		});

		it('should return false when head operation fails', async () => {
			mockBucket.head.mockRejectedValue(new Error('Head failed'));

			const result = await r2Utils.fileExists('test.pdf');

			expect(result).toBe(false);
		});
	});

	describe('deleteFile', () => {
		it('should delete file successfully', async () => {
			const result = await r2Utils.deleteFile('test-file.pdf');

			expect(mockBucket.delete).toHaveBeenCalledWith('test-file.pdf');
			expect(result).toBe(true);
			expect(mockLogger.log).toHaveBeenCalledWith('INFO', 'File deleted from R2', {
				filename: 'test-file.pdf'
			});
		});

		it('should return false when bucket not configured', async () => {
			r2Utils.bucket = null;

			const result = await r2Utils.deleteFile('test.pdf');

			expect(result).toBe(false);
		});

		it('should return false when delete operation fails', async () => {
			mockBucket.delete.mockRejectedValue(new Error('Delete failed'));

			const result = await r2Utils.deleteFile('test.pdf');

			expect(result).toBe(false);
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to delete file from R2', {
				filename: 'test.pdf',
				error: 'Delete failed'
			});
		});
	});

	describe('getFileMetadata', () => {
		it('should return file metadata when file exists', async () => {
			const result = await r2Utils.getFileMetadata('test-file.pdf');

			expect(mockBucket.head).toHaveBeenCalledWith('test-file.pdf');
			expect(result).toEqual({
				size: 1024,
				etag: '"abc123"',
				uploaded: expect.any(Date),
				httpMetadata: { contentType: 'application/pdf' },
				customMetadata: { uploadedBy: 'test' }
			});
		});

		it('should return null when file does not exist', async () => {
			mockBucket.head.mockResolvedValue(null);

			const result = await r2Utils.getFileMetadata('non-existing.pdf');

			expect(result).toBeNull();
		});

		it('should return null when bucket not configured', async () => {
			r2Utils.bucket = null;

			const result = await r2Utils.getFileMetadata('test.pdf');

			expect(result).toBeNull();
		});

		it('should return null when head operation fails', async () => {
			mockBucket.head.mockRejectedValue(new Error('Head failed'));

			const result = await r2Utils.getFileMetadata('test.pdf');

			expect(result).toBeNull();
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to get file metadata from R2', {
				filename: 'test.pdf',
				error: 'Head failed'
			});
		});
	});

	describe('getSignedUrl', () => {
		it('should return presigned URL (alias method)', async () => {
			const result = await r2Utils.getSignedUrl('test.pdf', 1800);

			expect(result).toContain('https://');
			expect(result).toContain('X-Amz-Expires=1800');
		});

		it('should use default expiration when not provided', async () => {
			const result = await r2Utils.getSignedUrl('test.pdf');

			expect(result).toContain('X-Amz-Expires=43200');
		});
	});

	describe('uploadFiles', () => {
		it('should upload multiple files successfully', async () => {
			const files = [
				{ filename: 'file1.pdf', data: new Uint8Array([1, 2]), contentType: 'application/pdf' },
				{ filename: 'file2.pdf', data: new Uint8Array([3, 4]), contentType: 'application/pdf' }
			];

			const results = await r2Utils.uploadFiles(files);

			expect(results).toHaveLength(2);
			expect(mockBucket.put).toHaveBeenCalledTimes(2);
			expect(results[0]).toContain('https://');
			expect(results[1]).toContain('https://');
		});

		it('should handle upload failure for one file', async () => {
			const files = [
				{ filename: 'file1.pdf', data: new Uint8Array([1, 2]), contentType: 'application/pdf' },
				{ filename: 'file2.pdf', data: new Uint8Array([3, 4]), contentType: 'application/pdf' }
			];

			// Make second upload fail
			mockBucket.put
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error('Upload failed'));

			await expect(r2Utils.uploadFiles(files)).rejects.toThrow('Upload failed');

			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'Failed to upload multiple files to R2', {
				fileCount: 2,
				error: 'Upload failed'
			});
		});
	});

	describe('validateConfiguration', () => {
		it('should return true when properly configured', () => {
			const result = r2Utils.validateConfiguration();

			expect(result).toBe(true);
		});

		it('should return false when bucket not configured', () => {
			r2Utils.bucket = null;

			const result = r2Utils.validateConfiguration();

			expect(result).toBe(false);
			expect(mockLogger.log).toHaveBeenCalledWith('ERROR', 'R2 bucket (FAX_FILES_BUCKET) not configured');
		});

		it('should return true even without public domain (using presigned URLs)', () => {
			// R2 public domain is no longer required since we use presigned URLs
			const result = r2Utils.validateConfiguration();

			expect(result).toBe(true);
		});
	});

	describe('getBucketInfo', () => {
		it('should return bucket information', () => {
			const result = r2Utils.getBucketInfo();

			expect(result).toEqual({
				configured: true,
				presignedUrls: true, // Using presigned URLs instead of public domain
				bucketName: 'test-bucket'
			});
		});

		it('should handle unconfigured bucket', () => {
			r2Utils.bucket = null;

			const result = r2Utils.getBucketInfo();

			expect(result).toEqual({
				configured: false,
				presignedUrls: true,
				bucketName: 'not configured'
			});
		});
	});
});