/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

/**
 * Fax Service - Compatible with Serverless API Gateway
 * Service binding handlers that receive (request, caller_env, sagContext) parameters
 */

/**
 * Send a fax (dummy implementation)
 * @param {Request} request - The incoming request
 * @param {string} caller_env - Stringified environment from caller
 * @param {string} sagContext - Stringified SAG context
 * @returns {Response} Response object
 */
export async function sendFax(request, caller_env, sagContext) {
	try {
		// Parse the stringified parameters back to objects
		const env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		// Get request body if it exists
		let requestBody = null;
		if (request.body) {
			// Clone the request to read the body multiple times if needed
			const clonedRequest = request.clone();
			try {
				requestBody = await request.json();
			} catch (e) {
				// If not JSON, get as text from the cloned request
				try {
					requestBody = await clonedRequest.text();
				} catch (textError) {
					// If both fail, set to null
					requestBody = null;
				}
			}
		}
		
		// Extract URL parameters if any
		const url = new URL(request.url);
		const searchParams = Object.fromEntries(url.searchParams);
		
		// Dummy fax implementation
		const faxResult = {
			id: `fax_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			status: "queued",
			message: "Fax has been queued for sending",
			timestamp: new Date().toISOString(),
			recipient: requestBody?.recipient || "unknown",
			pages: requestBody?.pages || 1,
			requestData: {
				body: requestBody,
				query: searchParams,
				method: request.method,
				headers: Object.fromEntries(request.headers.entries())
			}
		};
		
		return {
			statusCode: 200,
			message: "Fax queued successfully",
			data: faxResult
		};
		
	} catch (error) {
		return {
			statusCode: 500,
			error: "Internal server error",
			message: error.message,
			details: error.stack
		};
	}
}

/**
 * Handle Supabase webhook for user creation (example handler)
 * @param {Request} request - The incoming request
 * @param {string} caller_env - Stringified environment from caller
 * @param {string} sagContext - Stringified SAG context
 * @returns {Response} Response object
 */
export async function handleSupabaseWebhookPostUserCreated(request, caller_env, sagContext) {
	try {
		// Parse the stringified parameters back to objects
		const env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		// Get webhook payload
		const webhookPayload = await request.json();
		
		// Process user creation webhook
		const result = {
			id: `webhook_${Date.now()}`,
			status: "processed",
			message: "User creation webhook processed successfully",
			timestamp: new Date().toISOString(),
			user: webhookPayload.record || webhookPayload.user || webhookPayload,
			event: webhookPayload.type || "user.created"
		};
		
		return {
			statusCode: 200,
			message: "Webhook processed successfully",
			data: result
		};
		
	} catch (error) {
		return {
			statusCode: 500,
			error: "Webhook processing failed",
			message: error.message,
			details: error.stack
		};
	}
}

/**
 * Get fax status
 * @param {Request} request - The incoming request
 * @param {string} caller_env - Stringified environment from caller
 * @param {string} sagContext - Stringified SAG context
 * @returns {Response} Response object
 */
export async function getFaxStatus(request, caller_env, sagContext) {
	try {
		// Parse the stringified parameters back to objects (early to catch errors)
		const env = JSON.parse(caller_env);
		const context = JSON.parse(sagContext);
		
		const url = new URL(request.url);
		const faxId = url.searchParams.get('id') || 'unknown';
		
		// Dummy status check
		const statusResult = {
			id: faxId,
			status: Math.random() > 0.5 ? "sent" : "pending",
			message: "Fax status retrieved",
			timestamp: new Date().toISOString(),
			sentAt: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 3600000).toISOString() : null
		};
		
		return {
			statusCode: 200,
			message: "Status retrieved successfully",
			data: statusResult
		};
		
	} catch (error) {
		return {
			statusCode: 500,
			error: "Status check failed",
			message: error.message
		};
	}
}
