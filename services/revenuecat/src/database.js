/**
 * Database utilities for RevenueCat service
 */

import { createClient } from '@supabase/supabase-js';

export class DatabaseUtils {

	static getSupabaseAdminClient(env) {
		if (!env.SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for backend operations');
		}

		console.log(`[DatabaseUtils] Creating Supabase admin client - Using SERVICE_ROLE key (RLS BYPASSED - Admin Access)`);

		return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
	}

	/**
	 * Store RevenueCat webhook event in database
	 * @param {Object} webhookData - The webhook data to store
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The stored webhook event or null if failed
	 */
	static async storeRevenueCatWebhookEvent(webhookData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, skipping webhook event storage');
				logger.log('WARN', 'Supabase URL:', env.SUPABASE_URL);
				logger.log('WARN', 'Supabase SERVICE_ROLE_KEY:', env.SUPABASE_SERVICE_ROLE_KEY);
				throw new Error('Supabase not configured');
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);

			// Extract relevant information from webhook data
			const event = webhookData.event || {};

			// Use original_app_user_id as the user_id for foreign key connection to auth.users
			let userId = event.original_app_user_id;

			// Handle entitlement_id - check both single value and array
			let entitlementId = null;
			if (event.entitlement_id) {
				entitlementId = event.entitlement_id;
			} else if (event.entitlement_ids && Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0) {
				entitlementId = event.entitlement_ids[0]; // Use first entitlement_id from array
			}

			// Calculate expiration date based on product configuration
			let expiresAt = null;
			if (event.product_id) {
				const product = await DatabaseUtils.getProductById(event.product_id, env, logger);
				if (product && event.purchased_at_ms) {
					const purchaseDate = new Date(parseInt(event.purchased_at_ms));
					expiresAt = DatabaseUtils.calculateExpirationDate(product, purchaseDate, logger);
					if (expiresAt) {
						expiresAt = expiresAt.toISOString();
					}
				}
			}

			// If we couldn't calculate expiration from product, use the webhook's expires_at if available
			if (!expiresAt && event.expires_at_ms) {
				expiresAt = new Date(parseInt(event.expires_at_ms)).toISOString();
			}

			// Sanitize and validate data before insertion
			const webhookRecord = {
				event_type: event.type || 'UNKNOWN',
				event_id: event.id || null,
				user_id: userId,
				product_id: event.product_id || null,
				entitlement_id: entitlementId,
				period_type: event.period_type || null,
				purchased_at: event.purchased_at_ms ? new Date(parseInt(event.purchased_at_ms)).toISOString() : null,
				expires_at: expiresAt,
				environment: event.environment || null,
				store: event.store || null,
				is_trial_conversion: Boolean(event.is_trial_conversion) || false,
				price: event.price ? parseFloat(event.price) : null,
				currency: event.currency || null,
				country_code: event.country_code || null,
				app_id: event.app_id || null,
				raw_data: webhookData,
				processed_at: new Date().toISOString()
			};

			logger.log('DEBUG', 'Storing RevenueCat webhook event', {
				eventType: webhookRecord.event_type,
				userId: webhookRecord.user_id,
				productId: webhookRecord.product_id
			});

			let { data: storedEvent, error } = await supabase
				.from('revenuecat_webhook_events')
				.insert(webhookRecord)
				.select()
				.single();

			// If we get a foreign key constraint error, try again with user_id set to null
			if (error && error.code === '23503' && error.message.includes('user_id_fkey') && userId !== null) {
				logger.log('WARN', 'Foreign key constraint error for user_id, retrying with null', {
					userId: userId,
					eventType: webhookRecord.event_type
				});

				webhookRecord.user_id = null;
				const retryResult = await supabase
					.from('revenuecat_webhook_events')
					.insert(webhookRecord)
					.select()
					.single();

				storedEvent = retryResult.data;
				error = retryResult.error;
			}

			if (error) {
				logger.log('ERROR', 'Failed to store RevenueCat webhook event', {
					error: error.message,
					code: error.code,
					details: error.details,
					hint: error.hint,
					eventType: webhookRecord.event_type,
					userId: webhookRecord.user_id
				});
				throw error;
			}

			logger.log('INFO', 'RevenueCat webhook event stored successfully', {
				eventId: storedEvent.id,
				eventType: storedEvent.event_type,
				userId: storedEvent.user_id
			});

			// Also create/update user subscription if this is a purchase event
			if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION'].includes(event.type) && userId && event.product_id) {
				try {
					// Get product information to determine page limit
					const product = await DatabaseUtils.getProductById(event.product_id, env, logger);
					if (product) {
						const subscriptionData = {
							userId: userId,
							productId: event.product_id,
							subscriptionId: event.subscription_id,
							entitlementId: entitlementId,
							purchasedAt: event.purchased_at_ms ? new Date(parseInt(event.purchased_at_ms)).toISOString() : new Date().toISOString(),
							expiresAt: expiresAt,
							pageLimit: product.page_limit || 0
						};

						const userSubscription = await DatabaseUtils.createOrUpdateUserSubscription(subscriptionData, env, logger);
						if (userSubscription) {
							logger.log('INFO', 'User subscription created/updated from webhook', {
								userId: userId,
								productId: event.product_id,
								subscriptionId: userSubscription.id
							});
						}
					}
				} catch (subscriptionError) {
					logger.log('ERROR', 'Failed to create/update user subscription from webhook', {
						error: subscriptionError.message,
						userId: userId,
						productId: event.product_id
					});
				}
			}

			// Deactivate user subscription if this is a cancellation or expiration event
			if (['CANCELLATION', 'EXPIRATION'].includes(event.type) && userId && event.product_id) {
				try {
					// Find the active subscription for this user and product
					const userSubscriptions = await DatabaseUtils.getUserSubscriptions(userId, { activeOnly: true }, env, logger);
					const subscriptionToDeactivate = userSubscriptions.find(sub => 
						sub.product_id === event.product_id && sub.is_active
					);

					if (subscriptionToDeactivate) {
						await DatabaseUtils.deactivateUserSubscription(subscriptionToDeactivate.id, env, logger);
						logger.log('INFO', 'User subscription deactivated from webhook', {
							userId: userId,
							productId: event.product_id,
							subscriptionId: subscriptionToDeactivate.id
						});
					}
				} catch (deactivationError) {
					logger.log('ERROR', 'Failed to deactivate user subscription from webhook', {
						error: deactivationError.message,
						userId: userId,
						productId: event.product_id
					});
				}
			}

			return storedEvent;
		} catch (error) {
			logger.log('ERROR', 'Error storing RevenueCat webhook event', {
				error: error.message,
				stack: error.stack,
				eventType: webhookData?.event?.type
			});
			return null;
		}
	}

	/**
	 * Update user subscription status based on webhook event
	 * @param {Object} webhookData - The webhook data
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The updated user record or null if failed
	 */
			static async updateUserSubscriptionStatus(webhookData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, skipping user subscription update');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);
			const event = webhookData.event || {};

			// Use original_app_user_id for user identification
			const userId = event.original_app_user_id;
			if (!userId) {
				logger.log('WARN', 'No original_app_user_id in webhook data, skipping subscription update');
				return null;
			}

			// Skip subscription updates for TEST events
			if (event.type === 'TEST') {
				logger.log('INFO', 'Skipping subscription update for TEST event', {
					userId: userId,
					eventType: event.type
				});
				return null;
			}

			// Determine subscription status based on event type
			let subscriptionStatus = 'unknown';
			switch (event.type) {
				case 'INITIAL_PURCHASE':
				case 'RENEWAL':
				case 'UNCANCELLATION':
					subscriptionStatus = 'active';
					break;
				case 'CANCELLATION':
					subscriptionStatus = 'cancelled';
					break;
				case 'EXPIRATION':
					subscriptionStatus = 'expired';
					break;
				case 'BILLING_ISSUE':
					subscriptionStatus = 'billing_issue';
					break;
			}

			// Calculate expiration date based on product configuration
			let subscriptionExpiresAt = null;
			if (event.product_id && event.purchased_at_ms) {
				const product = await DatabaseUtils.getProductById(event.product_id, env, logger);
				if (product) {
					const purchaseDate = new Date(parseInt(event.purchased_at_ms));
					const expirationDate = DatabaseUtils.calculateExpirationDate(product, purchaseDate, logger);
					if (expirationDate) {
						subscriptionExpiresAt = expirationDate.toISOString();
					}
				}
			}

			// If we couldn't calculate expiration from product, use the webhook's expires_at if available
			if (!subscriptionExpiresAt && event.expires_at_ms) {
				subscriptionExpiresAt = new Date(parseInt(event.expires_at_ms)).toISOString();
			}

			const updateData = {
				subscription_status: subscriptionStatus,
				subscription_product_id: event.product_id,
				subscription_expires_at: subscriptionExpiresAt,
				subscription_purchased_at: event.purchased_at_ms ? new Date(parseInt(event.purchased_at_ms)).toISOString() : null,
				subscription_store: event.store,
				subscription_environment: event.environment,
				updated_at: new Date().toISOString()
			};

			logger.log('DEBUG', 'Updating user subscription status', {
				userId: userId,
				status: subscriptionStatus,
				productId: event.product_id
			});

			const { data: updatedUser, error } = await supabase
				.from('profiles')
				.update(updateData)
				.eq('id', userId)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to update user subscription status', {
					error: error.message,
					userId: userId
				});
				throw error;
			}

			logger.log('INFO', 'User subscription status updated successfully', {
				userId: updatedUser.id,
				status: updatedUser.subscription_status
			});

			return updatedUser;
		} catch (error) {
			logger.log('ERROR', 'Error updating user subscription status', {
				error: error.message,
				userId: webhookData?.event?.original_app_user_id
			});
			return null;
		}
	}

	/**
	 * Get user subscription information
	 * @param {string} userId - The user ID
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The user subscription data or null if not found
	 */
	static async getUserSubscription(userId, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get user subscription');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);

			const { data: user, error } = await supabase
				.from('profiles')
				.select('subscription_status, subscription_product_id, subscription_expires_at, subscription_purchased_at, subscription_store, subscription_environment')
				.eq('id', userId)
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to get user subscription', {
					error: error.message,
					userId: userId
				});
				return null;
			}

			return user;
		} catch (error) {
			logger.log('ERROR', 'Error getting user subscription', {
				error: error.message,
				userId: userId
			});
			return null;
		}
	}

	/**
	 * Get product information by product ID
	 * @param {string} productId - The product ID
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The product data or null if not found
	 */
	static async getProductById(productId, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get product information');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);

			const { data: product, error } = await supabase
				.from('products')
				.select('*')
				.eq('product_id', productId)
				.eq('is_active', true)
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to get product information', {
					error: error.message,
					productId: productId
				});
				return null;
			}

			return product;
		} catch (error) {
			logger.log('ERROR', 'Error getting product information', {
				error: error.message,
				productId: productId
			});
			return null;
		}
	}

	/**
	 * Calculate expiration date based on product configuration
	 * @param {Object} product - The product data
	 * @param {Date} purchasedAt - The purchase date
	 * @param {Object} logger - Logger instance
	 * @returns {Date|null} - The calculated expiration date or null if calculation fails
	 */
	static calculateExpirationDate(product, purchasedAt, logger) {
		try {
			if (!product || !purchasedAt) {
				logger.log('WARN', 'Missing product or purchase date for expiration calculation');
				return null;
			}

			const purchaseDate = new Date(purchasedAt);
			let expirationDate = new Date(purchaseDate);

			// Use expire_days if available, otherwise use expire_period
			if (product.expire_days && product.expire_days > 0) {
				expirationDate.setDate(purchaseDate.getDate() + product.expire_days);
				logger.log('DEBUG', 'Using expire_days for expiration calculation', {
					productId: product.product_id,
					expireDays: product.expire_days
				});
			} else if (product.expire_period) {
				switch (product.expire_period) {
					case 'day':
						expirationDate.setDate(purchaseDate.getDate() + 1);
						break;
					case 'week':
						expirationDate.setDate(purchaseDate.getDate() + 7);
						break;
					case 'month':
						expirationDate.setMonth(purchaseDate.getMonth() + 1);
						break;
					case 'year':
						expirationDate.setFullYear(purchaseDate.getFullYear() + 1);
						break;
					default:
						// Fallback to month if invalid period
						logger.log('WARN', 'Invalid expire_period, using month as fallback', {
							productId: product.product_id,
							expirePeriod: product.expire_period
						});
						expirationDate.setMonth(purchaseDate.getMonth() + 1);
				}
				logger.log('DEBUG', 'Using expire_period for expiration calculation', {
					productId: product.product_id,
					expirePeriod: product.expire_period
				});
			} else {
				// Fallback to month if no expiration configuration
				logger.log('WARN', 'No expiration configuration found, using month as fallback', {
					productId: product.product_id
				});
				expirationDate.setMonth(purchaseDate.getMonth() + 1);
			}

			return expirationDate;
		} catch (error) {
			logger.log('ERROR', 'Error calculating expiration date', {
				error: error.message,
				productId: product?.product_id
			});
			// Return null to indicate calculation failure
			return null;
		}
	}

	/**
	 * Create or update user subscription/package
	 * @param {Object} subscriptionData - The subscription data
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The created/updated subscription or null if failed
	 */
	static async createOrUpdateUserSubscription(subscriptionData, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot create/update user subscription');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);
			const {
				userId,
				productId,
				subscriptionId,
				entitlementId,
				purchasedAt,
				expiresAt,
				pageLimit
			} = subscriptionData;

			// Validate required fields
			if (!userId || !productId || !purchasedAt) {
				logger.log('ERROR', 'Missing required fields for user subscription', {
					userId: !!userId,
					productId: !!productId,
					purchasedAt: !!purchasedAt
				});
				return null;
			}

			// Get product information to determine if it's a subscription
			const product = await DatabaseUtils.getProductById(productId, env, logger);
			if (!product) {
				logger.log('ERROR', 'Product not found for user subscription', {
					productId: productId,
					userId: userId
				});
				return null;
			}

			// For subscription type, we need to handle the unique constraint at application level
			// since PostgreSQL doesn't support subqueries in index predicates
			if (product.type === 'subscription') {
				// Check if user already has a subscription
				const { data: existingSubscriptions, error: checkError } = await supabase
					.from('user_subscriptions')
					.select(`
						*,
						products!inner(type)
					`)
					.eq('user_id', userId)
					.eq('is_active', true)
					.eq('products.type', 'subscription');

				if (checkError) {
					logger.log('ERROR', 'Failed to check existing subscription', {
						error: checkError.message,
						userId: userId
					});
					return null;
				}

				const existingSubscription = existingSubscriptions?.[0];

				if (existingSubscription) {
					// Update existing subscription
					const updateData = {
						product_id: productId,
						subscription_id: subscriptionId,
						entitlement_id: entitlementId,
						purchased_at: purchasedAt,
						expires_at: expiresAt,
						page_limit: pageLimit || 0,
						pages_used: 0, // Reset pages used for new subscription
						updated_at: new Date().toISOString()
					};

					const { data: updatedSubscription, error: updateError } = await supabase
						.from('user_subscriptions')
						.update(updateData)
						.eq('id', existingSubscription.id)
						.select()
						.single();

					if (updateError) {
						logger.log('ERROR', 'Failed to update existing subscription', {
							error: updateError.message,
							userId: userId,
							subscriptionId: existingSubscription.id
						});
						return null;
					}

					logger.log('INFO', 'Updated existing subscription', {
						userId: userId,
						subscriptionId: updatedSubscription.id,
						productId: productId
					});

					return updatedSubscription;
				}
			}

			// Create new subscription/package
			const newSubscriptionData = {
				user_id: userId,
				product_id: productId,
				subscription_id: subscriptionId,
				entitlement_id: entitlementId,
				purchased_at: purchasedAt,
				expires_at: expiresAt,
				page_limit: pageLimit || 0,
				pages_used: 0,
				is_active: true
			};

			const { data: newSubscription, error: insertError } = await supabase
				.from('user_subscriptions')
				.insert(newSubscriptionData)
				.select()
				.single();

			if (insertError) {
				logger.log('ERROR', 'Failed to create new user subscription', {
					error: insertError.message,
					userId: userId,
					productId: productId
				});
				return null;
			}

			logger.log('INFO', 'Created new user subscription', {
				userId: userId,
				subscriptionId: newSubscription.id,
				productId: productId,
				productType: product.type
			});

			return newSubscription;
		} catch (error) {
			logger.log('ERROR', 'Error creating/updating user subscription', {
				error: error.message,
				userId: subscriptionData?.userId
			});
			return null;
		}
	}

	/**
	 * Get user subscriptions
	 * @param {string} userId - The user ID
	 * @param {Object} options - Query options
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Array>} - Array of user subscriptions
	 */
	static async getUserSubscriptions(userId, options = {}, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get user subscriptions');
				return [];
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);
			const { activeOnly = true, productType = null } = options;

			let query = supabase
				.from('user_subscriptions')
				.select(`
					*,
					products (
						product_id,
						display_name,
						description,
						page_limit,
						expire_days,
						expire_period,
						type
					)
				`)
				.eq('user_id', userId)
				.order('created_at', { ascending: false });

			if (activeOnly) {
				query = query.eq('is_active', true);
			}

			if (productType) {
				query = query.eq('products.type', productType);
			}

			const { data: subscriptions, error } = await query;

			if (error) {
				logger.log('ERROR', 'Failed to get user subscriptions', {
					error: error.message,
					userId: userId
				});
				return [];
			}

			return subscriptions || [];
		} catch (error) {
			logger.log('ERROR', 'Error getting user subscriptions', {
				error: error.message,
				userId: userId
			});
			return [];
		}
	}

	/**
	 * Deactivate user subscription
	 * @param {string} subscriptionId - The subscription ID
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The deactivated subscription or null if failed
	 */
	static async deactivateUserSubscription(subscriptionId, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot deactivate user subscription');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);

			const { data: deactivatedSubscription, error } = await supabase
				.from('user_subscriptions')
				.update({ is_active: false })
				.eq('id', subscriptionId)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to deactivate user subscription', {
					error: error.message,
					subscriptionId: subscriptionId
				});
				return null;
			}

			logger.log('INFO', 'Deactivated user subscription', {
				subscriptionId: subscriptionId,
				userId: deactivatedSubscription.user_id
			});

			return deactivatedSubscription;
		} catch (error) {
			logger.log('ERROR', 'Error deactivating user subscription', {
				error: error.message,
				subscriptionId: subscriptionId
			});
			return null;
		}
	}

	/**
	 * Update pages used for a user subscription
	 * @param {string} subscriptionId - The subscription ID
	 * @param {number} pagesUsed - The number of pages used
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Object|null>} - The updated subscription or null if failed
	 */
	static async updatePagesUsed(subscriptionId, pagesUsed, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot update pages used');
				return null;
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);

			const { data: updatedSubscription, error } = await supabase
				.from('user_subscriptions')
				.update({ pages_used: pagesUsed })
				.eq('id', subscriptionId)
				.select()
				.single();

			if (error) {
				logger.log('ERROR', 'Failed to update pages used', {
					error: error.message,
					subscriptionId: subscriptionId,
					pagesUsed: pagesUsed
				});
				return null;
			}

			logger.log('INFO', 'Updated pages used', {
				subscriptionId: subscriptionId,
				pagesUsed: pagesUsed
			});

			return updatedSubscription;
		} catch (error) {
			logger.log('ERROR', 'Error updating pages used', {
				error: error.message,
				subscriptionId: subscriptionId
			});
			return null;
		}
	}

	/**
	 * Get webhook events for a user
	 * @param {string} userId - The user ID
	 * @param {Object} options - Query options
	 * @param {Object} env - Environment variables
	 * @param {Object} logger - Logger instance
	 * @returns {Promise<Array>} - Array of webhook events
	 */
	static async getUserWebhookEvents(userId, options = {}, env, logger) {
		try {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
				logger.log('WARN', 'Supabase not configured, cannot get user webhook events');
				return [];
			}

			const supabase = DatabaseUtils.getSupabaseAdminClient(env);
			const { limit = 50, offset = 0, eventType = null } = options;

			let query = supabase
				.from('revenuecat_webhook_events')
				.select('*')
				.eq('user_id', userId)
				.order('processed_at', { ascending: false })
				.range(offset, offset + limit - 1);

			if (eventType) {
				query = query.eq('event_type', eventType);
			}

			const { data: events, error } = await query;

			if (error) {
				logger.log('ERROR', 'Failed to get user webhook events', {
					error: error.message,
					userId: userId
				});
				return [];
			}

			return events || [];
		} catch (error) {
			logger.log('ERROR', 'Error getting user webhook events', {
				error: error.message,
				userId: userId
			});
			return [];
		}
	}
} 
