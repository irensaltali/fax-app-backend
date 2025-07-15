/**
 * Cloudflare R2 Storage utilities
 * Handles file uploads to R2 bucket and generates public URLs
 */

export class R2Utils {
	constructor(env, logger) {
		this.env = env;
		this.logger = logger;
		this.bucket = env.FAX_FILES_BUCKET;
		this.publicDomain = env.R2_PUBLIC_DOMAIN; // e.g., "https://files.sendfax.pro"
	}

	/**
	 * Upload file to R2 bucket
	 * @param {string} filename - File path/name in bucket
	 * @param {ArrayBuffer|Uint8Array} fileData - File data
	 * @param {string} contentType - MIME type of the file
	 * @returns {string} Public URL of uploaded file
	 */
	async uploadFile(filename, fileData, contentType = 'application/pdf') {
		try {
			if (!this.bucket) {
				throw new Error('R2 bucket not configured. FAX_FILES_BUCKET environment variable is required.');
			}

			this.logger.log('DEBUG', 'Uploading file to R2', {
				filename,
				contentType,
				size: fileData.byteLength || fileData.length
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

			// Generate public URL
			const publicUrl = this.getPublicUrl(filename);

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

	/**
	 * Generate public URL for R2 object
	 * @param {string} filename - File path/name in bucket
	 * @returns {string} Public URL
	 */
	getPublicUrl(filename) {
		if (!this.publicDomain) {
			throw new Error('R2 public domain not configured. R2_PUBLIC_DOMAIN environment variable is required.');
		}

		// Remove leading slash if present
		const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
		
		// Ensure public domain doesn't end with slash
		const cleanDomain = this.publicDomain.endsWith('/') ? 
			this.publicDomain.slice(0, -1) : this.publicDomain;

		return `${cleanDomain}/${cleanFilename}`;
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
	 * Generate a signed URL for private access (if needed)
	 * Note: This is for future use if private access is needed
	 * @param {string} filename - File path/name in bucket
	 * @param {number} expiresIn - Expiration time in seconds
	 * @returns {string} Signed URL
	 */
	async getSignedUrl(filename, expiresIn = 3600) {
		// This would require additional R2 configuration for signed URLs
		// For now, we use public URLs as specified in the requirements
		throw new Error('Signed URLs not implemented. Using public URLs for Telnyx.');
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