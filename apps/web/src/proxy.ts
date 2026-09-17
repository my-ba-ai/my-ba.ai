import { clerkMiddleware } from "@clerk/nextjs/server"

/**
 * `proxy.ts`, not `middleware.ts` — Next 16 deprecated and renamed the
 * convention (see `node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md`). The old name still works; using it would
 * leave a deprecation to clean up later for no gain.
 *
 * Bare `clerkMiddleware()` on purpose: it makes the session available to server
 * components and `auth()`, and protects nothing. Route protection —
 * `createRouteMatcher`, redirect-to-sign-in, the authenticated layout — is P0-6,
 * where the routes it would protect actually exist.
 */
export default clerkMiddleware()

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless they carry a
    // query string. Clerk's recommended matcher, kept verbatim.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
}
