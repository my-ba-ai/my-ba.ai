/** The two levels the client emits. Nest's `Logger` satisfies this shape. */
export interface HtagLogger {
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

export const consoleHtagLogger: HtagLogger = {
  warn: (message, context) => console.warn(`[htag-client] ${message}`, context ?? {}),
  error: (message, context) => console.error(`[htag-client] ${message}`, context ?? {}),
}
