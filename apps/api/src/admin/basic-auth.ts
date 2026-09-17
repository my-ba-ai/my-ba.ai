import { createHash, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

export interface BasicAuthCredentials {
  user: string
  password: string
}

/** Hash first so the comparison is constant-time regardless of input length. */
function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest()
  const right = createHash("sha256").update(b).digest()
  return timingSafeEqual(left, right)
}

/** Parses an `Authorization: Basic ...` header. Null for anything malformed. */
export function parseBasicAuth(header: string | undefined): BasicAuthCredentials | null {
  if (!header) return null
  const [scheme, encoded] = header.split(" ")
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null

  const decoded = Buffer.from(encoded, "base64").toString("utf8")
  const separator = decoded.indexOf(":")
  if (separator < 0) return null
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) }
}

/**
 * Express middleware, not a Nest guard: Bull Board is mounted on the raw
 * Express instance, so the global `AuthGuard` never runs for it. That is
 * exactly why this exists.
 */
export function basicAuth(expected: BasicAuthCredentials, realm: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const given = parseBasicAuth(req.headers.authorization)
    // Evaluate both comparisons every time; no short-circuit on the user name.
    const userOk = safeEqual(given?.user ?? "", expected.user)
    const passwordOk = safeEqual(given?.password ?? "", expected.password)

    if (given && userOk && passwordOk) {
      next()
      return
    }

    res.setHeader("WWW-Authenticate", `Basic realm="${realm}", charset="UTF-8"`)
    res.status(401).send("Authentication required")
  }
}
