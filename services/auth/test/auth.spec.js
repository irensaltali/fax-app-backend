import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock Supabase client to avoid ES module issues in tests
vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		auth: {
			signInWithOtp: vi.fn(() => ({ 
				data: {}, 
				error: null 
			})),
			signInWithPassword: vi.fn(() => ({ 
				data: { 
					session: { 
						access_token: 'test-token', 
						refresh_token: 'test-refresh-token', 
						expires_in: 3600 
					}, 
					user: { 
						id: 'test-user-id', 
						email: 'test@example.com' 
					} 
				}, 
				error: null 
			})),
			resetPasswordForEmail: vi.fn(() => ({ 
				data: {}, 
				error: null 
			})),
			verifyOtp: vi.fn(() => ({ 
				data: { 
					session: { 
						access_token: 'test-token', 
						refresh_token: 'test-refresh-token', 
						expires_in: 3600 
					}, 
					user: { 
						id: 'test-user-id', 
						email: 'test@example.com' 
					} 
				}, 
				error: null 
			})),
			getUser: vi.fn(() => ({ 
				data: { 
					user: { 
						id: 'test-user-id', 
						email: 'test@example.com' 
					} 
				}, 
				error: null 
			})),
			refreshSession: vi.fn(() => ({ 
				data: { 
					session: { 
						access_token: 'new-test-token', 
						refresh_token: 'new-test-refresh-token', 
						expires_in: 3600 
					} 
				}, 
				error: null 
			})),
			signOut: vi.fn(() => ({ error: null })),
			admin: {
				updateUserById: vi.fn(() => ({ 
					data: { 
						user: { 
							id: 'test-user-id', 
							email: 'test@example.com' 
						} 
					}, 
					error: null 
				}))
			}
		}
	}))
}));

// Mock WorkerEntrypoint to avoid module issues
vi.mock('cloudflare:workers', () => ({
	WorkerEntrypoint: class MockWorkerEntrypoint {
		constructor() {
			this.env = {};
		}
	}
}));

import AuthService from '../src/auth';

describe('Auth Service', () => {
	let authService;
	let mockEnv;
	let mockSagContext;

	beforeAll(() => {
		mockEnv = {
			SUPABASE_URL: 'https://test.supabase.co',
			SUPABASE_KEY: 'test-key',
			SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
			LOG_LEVEL: 'DEBUG'
		};
		
		mockSagContext = {
			jwtPayload: {
				sub: 'test-user-123',
				email: 'test@example.com'
			}
		};

		// Create instance of the service
		authService = new AuthService();
		authService.env = mockEnv;
	});

	describe('Health Check', () => {
		it('should return healthy status', async () => {
			const request = new Request('https://example.com/health');
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});
			
			const response = await authService.health(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.service).toBe('auth-service');
			expect(result.status).toBe('healthy');
			expect(result.supabase_configured).toBe(true);
		});

		it('should return healthy status for protected endpoint', async () => {
			const request = new Request('https://example.com/health/protected');
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify(mockSagContext);
			
			const response = await authService.healthProtected(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.service).toBe('auth-service');
			expect(result.status).toBe('healthy');
			expect(result.authenticated).toBe(true);
			expect(result.user_id).toBe('test-user-123');
			expect(result.user_email).toBe('test@example.com');
		});
	});

	describe('OTP Authentication', () => {
		it('should send email OTP successfully', async () => {
			const request = new Request('https://example.com/otp', {
				method: 'POST',
				body: JSON.stringify({ email: 'test@example.com' }),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.sendEmailOTP(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.message).toBe('OTP sent successfully to your email');
		});

		it('should sign in with password successfully', async () => {
			const request = new Request('https://example.com/signin', {
				method: 'POST',
				body: JSON.stringify({ 
					email: 'test@example.com', 
					password: 'password123' 
				}),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.signInWithPassword(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.access_token).toBe('test-token');
			expect(result.user.id).toBe('test-user-id');
			expect(result.user.email).toBe('test@example.com');
		});

		it('should send forgot password email successfully', async () => {
			const request = new Request('https://example.com/forgot-password', {
				method: 'POST',
				body: JSON.stringify({ email: 'test@example.com' }),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.forgotPassword(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.message).toBe('Password reset email sent successfully');
			expect(result.note).toBe('Check your email for password reset instructions');
		});

		it('should verify OTP successfully', async () => {
			const request = new Request('https://example.com/verify', {
				method: 'POST',
				body: JSON.stringify({ 
					email: 'test@example.com', 
					token: '123456' 
				}),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.verifyOTP(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.access_token).toBe('test-token');
			expect(result.user.id).toBe('test-user-id');
			expect(result.user.email).toBe('test@example.com');
		});
	});

	describe('Error Handling', () => {
		it('should handle missing email in sendEmailOTP', async () => {
			const request = new Request('https://example.com/otp', {
				method: 'POST',
				body: JSON.stringify({}),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.sendEmailOTP(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('Email is required');
			expect(result.code).toBe('MISSING_EMAIL');
		});

		it('should handle missing credentials in signInWithPassword', async () => {
			const request = new Request('https://example.com/signin', {
				method: 'POST',
				body: JSON.stringify({ email: 'test@example.com' }), // missing password
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.signInWithPassword(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('Email and password are required');
			expect(result.code).toBe('MISSING_CREDENTIALS');
		});

		it('should handle missing email in forgotPassword', async () => {
			const request = new Request('https://example.com/forgot-password', {
				method: 'POST',
				body: JSON.stringify({}), // missing email
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.forgotPassword(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('Email is required');
			expect(result.code).toBe('MISSING_EMAIL');
		});

		it('should handle missing credentials in verifyOTP', async () => {
			const request = new Request('https://example.com/verify', {
				method: 'POST',
				body: JSON.stringify({}),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.verifyOTP(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('Token and email are required');
			expect(result.code).toBe('MISSING_CREDENTIALS');
		});

		it('should handle unauthorized access to protected endpoints', async () => {
			const request = new Request('https://example.com/profile');
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({}); // No jwtPayload

			const response = await authService.getUserProfile(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(401);
			expect(result.error).toBe('Unauthorized');
			expect(result.code).toBe('UNAUTHORIZED');
		});
	});

	describe('User Management', () => {
		it('should get user profile successfully', async () => {
			const request = new Request('https://example.com/profile');
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify(mockSagContext);

			const response = await authService.getUserProfile(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.user.id).toBe('test-user-123');
			expect(result.user.email).toBe('test@example.com');
		});

		it('should update user profile successfully', async () => {
			const request = new Request('https://example.com/profile', {
				method: 'PUT',
				body: JSON.stringify({ 
					user_metadata: { first_name: 'John', last_name: 'Doe' } 
				}),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify(mockSagContext);

			const response = await authService.updateUserProfile(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.message).toBe('Profile updated successfully');
			expect(result.user.id).toBe('test-user-id');
		});

		it('should refresh token successfully', async () => {
			const request = new Request('https://example.com/refresh', {
				method: 'POST',
				body: JSON.stringify({ refresh_token: 'test-refresh-token' }),
				headers: { 'Content-Type': 'application/json' }
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify({});

			const response = await authService.refreshToken(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.access_token).toBe('new-test-token');
			expect(result.refresh_token).toBe('new-test-refresh-token');
		});

		it('should sign out successfully', async () => {
			const request = new Request('https://example.com/signout', {
				method: 'POST'
			});
			const caller_env = JSON.stringify(mockEnv);
			const sagContext = JSON.stringify(mockSagContext);

			const response = await authService.signOut(request, caller_env, sagContext);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.message).toBe('Successfully signed out');
		});
	});
}); 
