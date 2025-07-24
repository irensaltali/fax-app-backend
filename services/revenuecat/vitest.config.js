import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Use default node pool instead of Cloudflare Workers pool for now
		// since the tests are basic placeholder tests
		environment: 'node',
	},
}); 
