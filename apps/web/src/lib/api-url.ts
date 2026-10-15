/**
 * Base URL of `apps/api`. Public (`NEXT_PUBLIC_`), so both the server-side
 * `apiFetch` and the browser's stage poll (`stage-status.ts`) read it from here.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"
