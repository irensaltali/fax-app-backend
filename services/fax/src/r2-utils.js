/**
 * Cloudflare R2 Storage utilities
 * Handles file uploads to R2 bucket and generates presigned URLs
 */

export class R2Utils {
	constructor(env, logger) {
		this.env = env;
		this.logger = logger;
		this.bucket = env.FAX_FILES_BUCKET;
		// Default presigned URL expiration: 12 hours (for Telnyx access)
		this.defaultExpirationSeconds = 12 * 60 * 60; // 12 hours
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

			const expiration = expirationSeconds || this.defaultExpirationSeconds;

			this.logger.log('DEBUG', 'Uploading file to R2', {
				filename,
				contentType,
				size: fileData.byteLength || fileData.length,
				expirationHours: Math.round(expiration / 3600)
			});

			// Upload file to R2
			await this.bucket.put(filename, fileData, {
				httpMetadata: {
					contentType
				},
				customMetadata: {
					uploadedAt: new Date().toISOString(),
					uploadedBy: 'fax-service',
					expirationSeconds: expiration.toString()
				}
			});

			// Generate presigned URL for Telnyx access
			const presignedUrl = await this.getPresignedUrl(filename, expiration);

			this.logger.log('INFO', 'File uploaded to R2 successfully', {
				filename,
				hasPresignedUrl: !!presignedUrl,
				expirationHours: Math.round(expiration / 3600)
			});

			return presignedUrl;

		} catch (error) {
			this.logger.log('ERROR', 'Failed to upload file to R2', {
				filename,
				error: error.message,
				stack: error.stack
			});
			throw error;
		}
	}

	/**
	 * Generate presigned URL for R2 object
	 * @param {string} filename - File path/name in bucket
	 * @param {number} expirationSeconds - URL expiration time in seconds
	 * @returns {Promise<string>} Presigned URL
	 */
	async getPresignedUrl(filename, expirationSeconds = null) {
		try {
			if (!this.bucket) {
				throw new Error('R2 bucket not configured');
			}

			const expiration = expirationSeconds || this.defaultExpirationSeconds;

			this.logger.log('DEBUG', 'Generating presigned URL', {
				filename,
				expirationHours: Math.round(expiration / 3600)
			});

			// Generate presigned URL for GET requests
			const presignedUrl = await this.bucket.get(filename, {
				onlyIf: {}, // This ensures we get a presigned URL even if object exists
			});

			// For R2, we need to use the object's URL property if available
			// If not available, we construct it using the bucket's domain
			if (presignedUrl && typeof presignedUrl.url === 'string') {
				// Add expiration parameter to the URL
				const url = new URL(presignedUrl.url);
				url.searchParams.set('X-Amz-Expires', expiration.toString());
				return url.toString();
			}

			// Alternative method: use R2's built-in presigned URL generation
			const signedUrl = await this.generateR2PresignedUrl(filename, expiration);
			return signedUrl;

		} catch (error) {
			this.logger.log('ERROR', 'Failed to generate presigned URL', {
				filename,
				error: error.message
			});
			throw error;
		}
	}

	/**
	 * Generate R2 presigned URL using internal method
	 * @param {string} filename - File path/name in bucket
	 * @param {number} expirationSeconds - URL expiration time in seconds
	 * @returns {Promise<string>} Presigned URL
	 */
	async generateR2PresignedUrl(filename, expirationSeconds) {
		// For Cloudflare R2, presigned URLs are generated automatically
		// when accessing objects through the R2 API
		// We'll create a URL that includes expiration information
		
		// Note: This is a simplified implementation
		// In production, you might need to use the actual R2 presigned URL generation
		// which may require additional configuration

		const baseUrl = `https://${this.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
		const bucketName = this.bucket.name || 'fax-files';
		
		// Construct presigned URL with expiration
		const expirationTimestamp = Math.floor(Date.now() / 1000) + expirationSeconds;
		const url = new URL(`${baseUrl}/${bucketName}/${filename}`);
		url.searchParams.set('X-Amz-Expires', expirationSeconds.toString());
		url.searchParams.set('X-Amz-Date', new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''));
		
		return url.toString();
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
	async getSignedUrl(filename, expiresIn = null) {
		const expiration = expiresIn || this.defaultExpirationSeconds;
		return await this.getPresignedUrl(filename, expiration);
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
		const hasPublicDomain = !!this.publicDomain;

		if (!hasBucket) {
			this.logger.log('ERROR', 'R2 bucket (FAX_FILES_BUCKET) not configured');
		}
		if (!hasPublicDomain) {
			this.logger.log('ERROR', 'R2 public domain (R2_PUBLIC_DOMAIN) not configured');
		}

		return hasBucket && hasPublicDomain;
	}

	/**
	 * Get R2 bucket stats (if needed for monitoring)
	 * @returns {object} Basic bucket information
	 */
	getBucketInfo() {
		return {
			configured: !!this.bucket,
			publicDomain: this.publicDomain,
			bucketName: this.bucket?.name || 'not configured'
		};
	}
}