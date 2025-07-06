import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { WorkerEntrypoint } from "cloudflare:workers";

/**
 * Auth Service for Supabase Authentication
 * Compatible with Serverless API Gateway
 * Service binding handlers that receive (request, caller_env, sagContext) parameters
 */

// Initialize logger
const logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export default class extends WorkerEntrypoint {
	async fetch(request, env) {
		this.log('INFO', 'Fetch request received');
		return new Response("Hello from Auth Service");
	}

	getLogLevel() {
		let level = logLevels[this.env.LOG_LEVEL] || logLevels.DEBUG;
		return level;
	}

	log(level, message, data = '') {
		const currentLogLevel = this.getLogLevel();
		if (logLevels[level] >= currentLogLevel) {
			const timestamp = new Date().toISOString();
			console.log(`[${timestamp}] [${level}] ${message}`, data);
		}
	}

	/**
	 * Get Supabase client
	 * @param {Object} env - Environment variables
	 * @returns {SupabaseClient}
	 */
	getSupabaseClient(env) {
		return createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
	}

	/**
	 * Get admin Supabase client
	 * @param {Object} env - Environment variables
	 * @returns {SupabaseClient}
	 */
	getSupabaseAdminClient(env) {
		return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY);
	}

	/**
	 * Send email OTP for authentication
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async sendEmailOTP(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Send email OTP request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const { email, shouldCreateUser = true } = await request.json();
			
			if (!email) {
				this.log('WARN', 'Missing email in sendEmailOTP request');
				return new Response(JSON.stringify({ 
					error: 'Email is required', 
					code: 'MISSING_EMAIL' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			const supabase = this.getSupabaseClient(env);

			// Send OTP via email
			const { data, error } = await supabase.auth.signInWithOtp({
				email,
				options: {
					shouldCreateUser,
					emailRedirectTo: undefined, // Force OTP instead of magic link
					data: {}
				},
			});

			if (error) {
				this.log('ERROR', 'OTP sending failed', { error: error.message, email });
				return new Response(JSON.stringify({ 
					error: `OTP sending failed: ${error.message}`, 
					code: 'OTP_SEND_FAILED' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			this.log('INFO', 'Email OTP sent successfully', { email });
			return new Response(JSON.stringify({ 
				message: 'OTP sent successfully to your email',
				note: 'Check your email for a 6-digit verification code'
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in sendEmailOTP:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Sign in with email and password
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async signInWithPassword(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Sign in with password request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const { email, password } = await request.json();
			
			if (!email || !password) {
				this.log('WARN', 'Missing credentials in signInWithPassword request');
				return new Response(JSON.stringify({ 
					error: 'Email and password are required', 
					code: 'MISSING_CREDENTIALS' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			const supabase = this.getSupabaseClient(env);

			// Sign in with email and password
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password,
			});

			if (error) {
				this.log('ERROR', 'Password authentication failed', { error: error.message, email });
				return new Response(JSON.stringify({ 
					error: `Authentication failed: ${error.message}`, 
					code: 'AUTH_FAILED' 
				}), { 
					status: 401, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			this.log('INFO', 'Password authentication successful', { userId: data.user.id });
			// Return session information
			return new Response(JSON.stringify({
				access_token: data.session.access_token,
				refresh_token: data.session.refresh_token,
				expires_in: data.session.expires_in,
				user: {
					id: data.user.id,
					email: data.user.email,
					created_at: data.user.created_at,
					email_confirmed_at: data.user.email_confirmed_at
				}
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in signInWithPassword:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Send password reset email
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async forgotPassword(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Forgot password request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const { email, redirectTo } = await request.json();
			
			if (!email) {
				this.log('WARN', 'Missing email in forgotPassword request');
				return new Response(JSON.stringify({ 
					error: 'Email is required', 
					code: 'MISSING_EMAIL' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			const supabase = this.getSupabaseClient(env);

			// Send password reset email
			const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: redirectTo || undefined
			});

			if (error) {
				this.log('ERROR', 'Password reset email sending failed', { error: error.message, email });
				return new Response(JSON.stringify({ 
					error: `Password reset failed: ${error.message}`, 
					code: 'PASSWORD_RESET_FAILED' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			this.log('INFO', 'Password reset email sent successfully', { email });
			return new Response(JSON.stringify({ 
				message: 'Password reset email sent successfully',
				note: 'Check your email for password reset instructions'
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in forgotPassword:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Verify email OTP and return session
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async verifyOTP(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Verify OTP request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const { email, token } = await request.json();
			
			if (!token || !email) {
				this.log('WARN', 'Missing credentials in verifyOTP request');
				return new Response(JSON.stringify({ 
					error: 'Token and email are required', 
					code: 'MISSING_CREDENTIALS' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			const supabase = this.getSupabaseClient(env);

			// Verify email OTP
			const { data, error } = await supabase.auth.verifyOtp({
				email,
				token,
				type: 'email',
			});

			if (error) {
				this.log('ERROR', 'OTP verification failed', { error: error.message, email });
				return new Response(JSON.stringify({ 
					error: `OTP verification failed: ${error.message}`, 
					code: 'OTP_VERIFICATION_FAILED' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			this.log('INFO', 'OTP verification successful', { userId: data.user.id });
			// Return session information
			return new Response(JSON.stringify({
				access_token: data.session.access_token,
				refresh_token: data.session.refresh_token,
				expires_in: data.session.expires_in,
				user: {
					id: data.user.id,
					email: data.user.email,
					created_at: data.user.created_at,
					email_confirmed_at: data.user.email_confirmed_at
				}
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in verifyOTP:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Get user profile (protected endpoint)
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async getUserProfile(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Get user profile request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const jwtPayload = context.jwtPayload;
			
			if (!jwtPayload) {
				this.log('WARN', 'Unauthorized access to getUserProfile');
				return new Response(JSON.stringify({ 
					error: 'Unauthorized', 
					code: 'UNAUTHORIZED' 
				}), { 
					status: 401, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			// Since we already have the JWT payload with user information validated by the gateway,
			// we can construct the user response directly from the JWT payload
			// This is more efficient and avoids additional API calls
			this.log('INFO', 'User profile retrieved successfully', { userId: jwtPayload.sub });
			return new Response(JSON.stringify({
				user: {
					id: jwtPayload.sub,
					email: jwtPayload.email,
					created_at: jwtPayload.created_at || null,
					email_confirmed_at: jwtPayload.email_confirmed_at || null,
					last_sign_in_at: jwtPayload.last_sign_in_at || null,
					user_metadata: jwtPayload.user_metadata || {},
					app_metadata: jwtPayload.app_metadata || {}
				}
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in getUserProfile:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Update user profile (protected endpoint)
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async updateUserProfile(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Update user profile request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const jwtPayload = context.jwtPayload;
			const { email, user_metadata } = await request.json();
			
			if (!jwtPayload) {
				this.log('WARN', 'Unauthorized access to updateUserProfile');
				return new Response(JSON.stringify({ 
					error: 'Unauthorized', 
					code: 'UNAUTHORIZED' 
				}), { 
					status: 401, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			const supabase = this.getSupabaseAdminClient(env);

			// Update user profile
			const updateData = {};
			if (email) updateData.email = email;
			if (user_metadata) updateData.user_metadata = user_metadata;

			const { data, error } = await supabase.auth.admin.updateUserById(
				jwtPayload.sub,
				updateData
			);

			if (error) {
				this.log('ERROR', 'Failed to update user profile', { error: error.message, userId: jwtPayload.sub });
				return new Response(JSON.stringify({ 
					error: `Failed to update user profile: ${error.message}`, 
					code: 'PROFILE_UPDATE_FAILED' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			this.log('INFO', 'User profile updated successfully', { userId: data.user.id });
			return new Response(JSON.stringify({
				message: 'Profile updated successfully',
				user: {
					id: data.user.id,
					email: data.user.email,
					user_metadata: data.user.user_metadata
				}
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in updateUserProfile:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Refresh access token
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async refreshToken(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Refresh token request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const { refresh_token } = await request.json();
			
			if (!refresh_token) {
				this.log('WARN', 'Missing refresh token in refreshToken request');
				return new Response(JSON.stringify({ 
					error: 'Refresh token is required', 
					code: 'MISSING_REFRESH_TOKEN' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			const supabase = this.getSupabaseClient(env);

			// Refresh the session
			const { data, error } = await supabase.auth.refreshSession({
				refresh_token
			});

			if (error) {
				this.log('ERROR', 'Token refresh failed', { error: error.message });
				return new Response(JSON.stringify({ 
					error: `Token refresh failed: ${error.message}`, 
					code: 'TOKEN_REFRESH_FAILED' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			this.log('INFO', 'Token refreshed successfully');
			return new Response(JSON.stringify({
				access_token: data.session.access_token,
				refresh_token: data.session.refresh_token,
				expires_in: data.session.expires_in
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in refreshToken:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Sign out user
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async signOut(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Sign out request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const jwtPayload = context.jwtPayload;
			
			if (!jwtPayload) {
				this.log('WARN', 'Unauthorized access to signOut');
				return new Response(JSON.stringify({ 
					error: 'Unauthorized', 
					code: 'UNAUTHORIZED' 
				}), { 
					status: 401, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			const supabase = this.getSupabaseClient(env);

			// Sign out user
			const { error } = await supabase.auth.signOut();

			if (error) {
				this.log('ERROR', 'Sign out failed', { error: error.message, userId: jwtPayload.sub });
				return new Response(JSON.stringify({ 
					error: `Sign out failed: ${error.message}`, 
					code: 'SIGN_OUT_FAILED' 
				}), { 
					status: 400, 
					headers: { 'Content-Type': 'application/json' } 
				});
			}

			this.log('INFO', 'User signed out successfully', { userId: jwtPayload.sub });
			return new Response(JSON.stringify({
				message: 'Successfully signed out'
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in signOut:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Health check endpoint
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async health(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Health check request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			return new Response(JSON.stringify({
				service: 'auth-service',
				status: 'healthy',
				timestamp: new Date().toISOString(),
				supabase_configured: !!(env.SUPABASE_URL && env.SUPABASE_KEY)
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in health check:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}

	/**
	 * Protected health check endpoint
	 * @param {Request} request - Incoming request
	 * @param {string} caller_env - Stringified environment from caller
	 * @param {string} sagContext - Stringified SAG context
	 * @returns {Response}
	 */
	async healthProtected(request, caller_env, sagContext) {
		try {
			this.log('INFO', 'Protected health check request received');
			
			// Parse the stringified parameters back to objects
			const env = JSON.parse(caller_env);
			const context = JSON.parse(sagContext);
			
			const jwtPayload = context.jwtPayload;
			
			this.log('INFO', 'Authenticated health check', { user: jwtPayload?.sub });
			
			return new Response(JSON.stringify({
				service: 'auth-service',
				status: 'healthy',
				timestamp: new Date().toISOString(),
				authenticated: true,
				user_id: jwtPayload?.sub,
				user_email: jwtPayload?.email
			}), { 
				status: 200, 
				headers: { 'Content-Type': 'application/json' } 
			});

		} catch (error) {
			this.log('ERROR', 'Error in healthProtected:', error);
			return new Response(JSON.stringify({ 
				error: 'Internal server error', 
				code: 'INTERNAL_ERROR' 
			}), { 
				status: 500, 
				headers: { 'Content-Type': 'application/json' } 
			});
		}
	}
} 
