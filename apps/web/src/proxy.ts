import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

/**
 * `proxy.ts`, not `middleware.ts` — Next 16 deprecated and renamed the
 * convention (see `node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md`).
 *
 * Deny by default: every route needs a session except the ones listed here.
 * An allowlist of public routes fails closed when a new route is added; a
 * blocklist of protected ones fails open.
 *
 * `auth.protect()` redirects a page request to NEXT_PUBLIC_CLERK_SIGN_IN_URL
 * and answers 404 to anything else. It is the only gate on the web side, and
 * the API's guard verifies the token again independently, so neither side
 * trusts the other to have checked.
 */
const isPublicRoute = createRouteMatcher(["/sign-in(.*)"])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless they carry a
    // query string. Clerk's recommended matcher, kept verbatim.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
}
