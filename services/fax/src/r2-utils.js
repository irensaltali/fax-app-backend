/**
 * Cloudflare R2 Storage utilities
 */

export class R2Utils {
	constructor(logger, env = null) {
		this.logger = logger;
		this.env = env;
		this.bucket = this.env?.FAX_FILES_BUCKET || null;
		this.publicUrlBase = this.env?.FAX_FILES_BUCKET_PUBLIC_URL || null;
	}

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

			await this.bucket.put(filename, fileData, {
				httpMetadata: {
					contentType
				},
				customMetadata: {
					uploadedAt: new Date().toISOString(),
					uploadedBy: 'fax-service'
				}
			});

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

	async getPresignedUrl(filename) {
		this.logger.log('DEBUG', 'getPresignedUrl deprecated – returning public URL', { filename });
		return this.generatePublicUrl(filename);
	}

	generatePublicUrl(filename) {
		if (!this.publicUrlBase) {
			throw new Error('FAX_FILES_BUCKET_PUBLIC_URL environment variable is not configured');
		}

		const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
		return `${this.publicUrlBase}/${cleanFilename}`;
	}

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

	async getSignedUrl(filename) {
		return this.generatePublicUrl(filename);
	}

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

	getBucketInfo() {
		return {
			configured: !!this.bucket,
			presignedUrls: false,
			bucketName: this.bucket?.name || 'not configured'
		};
	}
}
