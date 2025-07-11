import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'miniflare',
		environmentOptions: {
			bindings: {
				NOTIFYRE_API_KEY: 'test-notifyre-key',
				SUPABASE_URL: 'https://test.supabase.co',
				SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
				LOG_LEVEL: 'DEBUG',
				ENVIRONMENT: 'test'
			}
		}
	}
}); 
