#!/usr/bin/env node

/**
 * Supabase Login Helper Script
 * 
 * This script authenticates with Supabase using email/password
 * and returns access and refresh tokens for testing/development.
 * 
 * Usage:
 * node scripts/supabase-login.js <email> <password>
 * 
 * Or set environment variables:
 * SUPABASE_TEST_EMAIL=user@example.com SUPABASE_TEST_PASSWORD=password node scripts/supabase-login.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

// Get credentials from command line args or environment variables
const email = process.argv[2] || process.env.SUPABASE_TEST_EMAIL;
const password = process.argv[3] || process.env.SUPABASE_TEST_PASSWORD;

/**
 * Main function to authenticate and get tokens
 */
async function authenticateSupabase() {
    try {
        // Validate configuration
        if (!SUPABASE_URL) {
            throw new Error('SUPABASE_URL environment variable is required');
        }
        
        if (!SUPABASE_ANON_KEY) {
            throw new Error('SUPABASE_ANON_KEY or SUPABASE_KEY environment variable is required');
        }
        
        if (!email || !password) {
            console.error('❌ Email and password are required');
            console.log('\nUsage:');
            console.log('  node scripts/supabase-login.js <email> <password>');
            console.log('\nOr set environment variables:');
            console.log('  SUPABASE_TEST_EMAIL=user@example.com SUPABASE_TEST_PASSWORD=password node scripts/supabase-login.js');
            process.exit(1);
        }

        console.log('🔐 Authenticating with Supabase...');
        console.log(`📧 Email: ${email}`);
        console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
        
        // Create Supabase client
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Attempt to sign in
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error('❌ Authentication failed:', error.message);
            process.exit(1);
        }
        
        if (!data.session) {
            console.error('❌ No session returned from Supabase');
            process.exit(1);
        }
        
        // Extract tokens
        const accessToken = data.session.access_token;
        const refreshToken = data.session.refresh_token;
        const expiresAt = new Date(data.session.expires_at * 1000);
        
        // Display results
        console.log('\n✅ Authentication successful!');
        console.log('\n📄 Session Details:');
        console.log(`👤 User ID: ${data.user.id}`);
        console.log(`📧 Email: ${data.user.email}`);
        console.log(`⏰ Expires: ${expiresAt.toISOString()}`);
        
        console.log('\n🔑 Tokens:');
        console.log('\n🟢 Access Token:');
        console.log(accessToken);
        console.log('\n🔄 Refresh Token:');
        console.log(refreshToken);
        
        // Create tokens object for easy copying
        const tokens = {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: data.session.expires_at,
            expires_at_iso: expiresAt.toISOString(),
            user: {
                id: data.user.id,
                email: data.user.email,
                email_confirmed_at: data.user.email_confirmed_at,
                last_sign_in_at: data.user.last_sign_in_at
            }
        };
        
        console.log('\n📋 Copy-paste ready JSON:');
        console.log(JSON.stringify(tokens, null, 2));
        
        // Save to file for convenience
        const tokensFile = path.join(process.cwd(), 'tokens.json');
        fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2));
        console.log(`\n💾 Tokens saved to: ${tokensFile}`);
        
        // Create .env format for easy copying
        const envContent = [
            `# Supabase auth tokens generated on ${new Date().toISOString()}`,
            `SUPABASE_ACCESS_TOKEN=${accessToken}`,
            `SUPABASE_REFRESH_TOKEN=${refreshToken}`,
            `SUPABASE_USER_ID=${data.user.id}`,
            `SUPABASE_USER_EMAIL=${data.user.email}`,
            ''
        ].join('\n');
        
        const envFile = path.join(process.cwd(), 'tokens.env');
        fs.writeFileSync(envFile, envContent);
        console.log(`🔧 Environment format saved to: ${envFile}`);
        
        // Test the token by making an authenticated request
        console.log('\n🧪 Testing access token...');
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .limit(1);
            
        if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = table not found, which is OK
            console.log(`⚠️  Token test warning: ${profileError.message}`);
        } else {
            console.log('✅ Access token is valid and working!');
        }
        
        console.log('\n🚀 Ready to use tokens for API testing!');
        console.log('\nExample curl with access token:');
        console.log(`curl -H "Authorization: Bearer ${accessToken}" \\`);
        console.log(`     -H "Content-Type: application/json" \\`);
        console.log(`     "${SUPABASE_URL}/rest/v1/your-table"`);

    } catch (error) {
        console.error('💥 Unexpected error:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

/**
 * Refresh token helper function
 */
async function refreshTokens(refreshToken) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken
        });
        
        if (error) {
            throw error;
        }
        
        return {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
        };
    } catch (error) {
        console.error('❌ Token refresh failed:', error.message);
        throw error;
    }
}

// Handle refresh command
if (process.argv[2] === 'refresh' && process.argv[3]) {
    console.log('🔄 Refreshing tokens...');
    refreshTokens(process.argv[3])
        .then(tokens => {
            console.log('✅ Tokens refreshed successfully!');
            console.log(JSON.stringify(tokens, null, 2));
        })
        .catch(() => process.exit(1));
} else if (process.argv[2] === 'help' || process.argv[2] === '--help' || process.argv[2] === '-h') {
    console.log('Supabase Login Helper');
    console.log('\nUsage:');
    console.log('  node scripts/supabase-login.js <email> <password>');
    console.log('  node scripts/supabase-login.js refresh <refresh_token>');
    console.log('\nEnvironment Variables:');
    console.log('  SUPABASE_URL - Your Supabase project URL');
    console.log('  SUPABASE_ANON_KEY - Your Supabase anon/public API key');
    console.log('  SUPABASE_TEST_EMAIL - Default email for authentication');
    console.log('  SUPABASE_TEST_PASSWORD - Default password for authentication');
    console.log('\nExamples:');
    console.log('  node scripts/supabase-login.js user@example.com mypassword');
    console.log('  SUPABASE_TEST_EMAIL=user@example.com SUPABASE_TEST_PASSWORD=mypassword node scripts/supabase-login.js');
    console.log('  node scripts/supabase-login.js refresh eyJ0eXAiOiJKV1QiLCJhbGc...');
} else {
    // Run main authentication
    authenticateSupabase();
} 
