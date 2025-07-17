import { env, WorkerEntrypoint } from "cloudflare:workers";

/**
 * Env-Test Service
 * Simple Cloudflare Worker service meant for validating Serverless API Gateway (SAG) context
 * and environment variable propagation. It exposes a single `debug` handler that logs the
 * caller environment and SAG context, then returns them in the response for easy inspection.
 */
export default class extends WorkerEntrypoint {
  constructor(ctx, env) {
    super(ctx, env);
		this.logger = null;
  }

  /**
   * Generic fetch handler (optional). It can help verify the Worker is deployed correctly when
   * accessed directly via its sub-domain.
   */
  async fetch(request, env) {
    return new Response("Env-Test Service is running ✅", {
      headers: { "content-type": "text/plain;charset=UTF-8" }
    });
  }

  /**
   * debug()
   * Serverless API Gateway will invoke this function with the standard signature:
   *  - request:  Fetch Request object
   *  - caller_env:  Stringified environment object from the API gateway (service binding env)
   *  - sagContext:  Stringified SAG context containing auth data, path params, etc.
   *
   * The function logs both objects (at DEBUG level) and echoes them back in the response body.
   */
  async debug(request, caller_env = "{}", sagContext = "{}") {
    // Attempt to parse the incoming JSON strings – fall back to raw strings on failure.
    let callerEnvObj;
    let sagObj;
    let envObj;

    try {
      callerEnvObj = JSON.parse(caller_env);
    } catch (err) {
      callerEnvObj = { parseError: err?.message || "Unable to parse caller_env", raw: caller_env };
    }

    try {
      sagObj = JSON.parse(sagContext);
    } catch (err) {
      sagObj = { parseError: err?.message || "Unable to parse sagContext", raw: sagContext };
    }

    try {
      envObj = JSON.parse(env);
    } catch (err) {
      envObj = { parseError: err?.message || "Unable to parse env", raw: env };
    }

    // Log both structures for easier debugging in Cloudflare logs.
    console.log("[ENV-TEST][DEBUG] Caller Environment:", callerEnvObj);
    console.log("[ENV-TEST][DEBUG] SAG Context:", sagObj);
    console.log("[ENV-TEST][DEBUG] Environment:", envObj);

    // Standard JSON response expected by the gateway → plain object is serialised.
    return {
      statusCode: 200,
      message: "Debug information logged successfully",
      data: {
        callerEnvObj: callerEnvObj,
        sagContext: sagObj,
        env: envObj,
        timestamp: new Date().toISOString()
      }
    };
  }
} 
