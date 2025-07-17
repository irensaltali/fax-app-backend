/**
 * Cloudflare R2 Storage utilities
 * Handles file uploads to R2 bucket and generates presigned URLs
 */

import { env } from "cloudflare:workers";

export class R2Utils {
	constructor(logger) {

		// Logger instance for structured logs
		this.logger = logger;

		// Bind the R2 bucket using the binding exposed by Cloudflare Workers.
		this.bucket = env.FAX_FILES_BUCKET || null;

		// Base public URL for files served from R2 (configured in wrangler.toml)
		// Example: https://pub-<hash>.r2.dev
		this.publicUrlBase = env.FAX_FILES_BUCKET_PUBLIC_URL || null;
	}

	/**
	 * Upload file to R2 bucket
	 * @param {string} filename - File path/name in bucket
	 * @param {ArrayBuffer|Uint8Array} fileData - File data
	 * @param {string} contentType - MIME type of the file
	 * @param {number} expirationSeconds - Presigned URL expiration (default: 12 hours)
	 * @returns {string} Presigned URL of uploaded file
	 */
	async uploadFile(filename, fileData, contentType = 'application/pdf', expirationSeconds = null) {
		try {
			if (!this.bucket) {
				throw new Error('R2 bucket not configured. FAX_FILES_BUCKET environment variable is required.');
			}

			this.logger.log('DEBUG', 'Uploading file to R2', {
				filename,
				contentType,
				size: fileData.byteLength || fileData.length,
				publicUrlBaseConfigured: !!this.publicUrlBase
			});

			// Upload file to R2
			await this.bucket.put(filename, fileData, {
				httpMetadata: {
					contentType
				},
				customMetadata: {
					uploadedAt: new Date().toISOString(),
					uploadedBy: 'fax-service'
				}
			});

			// Construct public URL using configured base
			const publicUrl = this.generatePublicUrl(filename);

			this.logger.log('INFO', 'File uploaded to R2 successfully', {
				filename,
				publicUrl
			});

			return publicUrl;

		} catch (error) {
			this.logger.log('ERROR', 'Failed to upload file to R2', {
				filename,
				error: error.message,
				stack: error.stack
			});
			throw error;
		}
	}

	// Deprecated API kept for backward compatibility – now returns public URL
	async getPresignedUrl(filename) {
		this.logger.log('DEBUG', 'getPresignedUrl deprecated – returning public URL', { filename });
		return this.generatePublicUrl(filename);
	}

	// Removed presigned URL support – helper now constructs public URL
	generatePublicUrl(filename) {
		if (!this.publicUrlBase) {
			throw new Error('FAX_FILES_BUCKET_PUBLIC_URL environment variable is not configured');
		}

		// Clean up the filename (remove leading slash if present)
		const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;

		return `${this.publicUrlBase}/${cleanFilename}`;
	}

	/**
	 * Check if file exists in R2 bucket
	 * @param {string} filename - File path/name in bucket
	 * @returns {boolean} True if file exists
	 */
	async fileExists(filename) {
		try {
			if (!this.bucket) {
				throw new Error('R2 bucket not configured');
			}

			const object = await this.bucket.head(filename);
			return object !== null;

		} catch (error) {
			this.logger.log('DEBUG', 'File does not exist in R2', { filename });
			return false;
		}
	}

	/**
	 * Delete file from R2 bucket
	 * @param {string} filename - File path/name in bucket
	 * @returns {boolean} True if successfully deleted
	 */
	async deleteFile(filename) {
		try {
			if (!this.bucket) {
				throw new Error('R2 bucket not configured');
			}

			await this.bucket.delete(filename);
			
			this.logger.log('INFO', 'File deleted from R2', { filename });
			return true;

		} catch (error) {
			this.logger.log('ERROR', 'Failed to delete file from R2', {
				filename,
				error: error.message
			});
			return false;
		}
	}

	/**
	 * Get file metadata from R2
	 * @param {string} filename - File path/name in bucket
	 * @returns {object|null} File metadata or null if not found
	 */
	async getFileMetadata(filename) {
		try {
			if (!this.bucket) {
				throw new Error('R2 bucket not configured');
			}

			const object = await this.bucket.head(filename);
			
			if (!object) {
				return null;
			}

			return {
				size: object.size,
				etag: object.etag,
				uploaded: object.uploaded,
				httpMetadata: object.httpMetadata,
				customMetadata: object.customMetadata
			};

		} catch (error) {
			this.logger.log('ERROR', 'Failed to get file metadata from R2', {
				filename,
				error: error.message
			});
			return null;
		}
	}

	/**
	 * Generate a signed URL for private access
	 * This is an alias for getPresignedUrl for backward compatibility
	 * @param {string} filename - File path/name in bucket
	 * @param {number} expiresIn - Expiration time in seconds
	 * @returns {Promise<string>} Signed URL
	 */
	async getSignedUrl(filename) {
		return this.generatePublicUrl(filename);
	}

	/**
	 * Upload multiple files to R2
	 * @param {array} files - Array of file objects {filename, data, contentType}
	 * @returns {array} Array of public URLs
	 */
	async uploadFiles(files) {
		const uploadPromises = files.map(file => 
			this.uploadFile(file.filename, file.data, file.contentType)
		);

		try {
			return await Promise.all(uploadPromises);
		} catch (error) {
			this.logger.log('ERROR', 'Failed to upload multiple files to R2', {
				fileCount: files.length,
				error: error.message
			});
			throw error;
		}
	}

	/**
	 * Validate R2 configuration
	 * @returns {boolean} True if R2 is properly configured
	 */
	validateConfiguration() {
		const hasBucket = !!this.bucket;

		if (!hasBucket) {
			this.logger.log('ERROR', 'R2 bucket (FAX_FILES_BUCKET) not configured');
		}
		if (!this.publicUrlBase) {
			this.logger.log('ERROR', 'FAX_FILES_BUCKET_PUBLIC_URL not configured');
		}

		return hasBucket && !!this.publicUrlBase;
	}

	/**
	 * Get R2 bucket stats (if needed for monitoring)
	 * @returns {object} Basic bucket information
	 */
	getBucketInfo() {
		return {
			configured: !!this.bucket,
			presignedUrls: false,
			bucketName: this.bucket?.name || 'not configured'
		};
	}
}
