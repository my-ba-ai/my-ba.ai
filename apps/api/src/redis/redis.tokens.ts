/**
 * The API's general-purpose Redis client — cache and health checks. BullMQ
 * opens its own connections from `queue.module.ts`; this one is never handed to
 * a Queue, because BullMQ and a request-path cache want opposite retry settings.
 */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT")
