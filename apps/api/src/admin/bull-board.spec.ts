import type { NextFunction, Request, Response } from "express"
import { describe, expect, it, vi } from "vitest"
import { basicAuth, parseBasicAuth } from "./basic-auth"
import { decideBullBoard } from "./bull-board"

const header = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`

describe("decideBullBoard", () => {
  const creds = { user: "admin", password: "correct-horse-battery" }

  it("mounts in development with both credentials", () => {
    expect(decideBullBoard({ nodeEnv: "development", ...creds })).toEqual({
      mount: true,
      credentials: creds,
    })
  })

  it("never mounts in production, even with credentials", () => {
    expect(decideBullBoard({ nodeEnv: "production", ...creds }).mount).toBe(false)
  })

  it("skips quietly when neither credential is set", () => {
    expect(decideBullBoard({ nodeEnv: "development", user: undefined, password: "" }).mount).toBe(
      false,
    )
  })

  it("refuses to boot when half-configured", () => {
    expect(() =>
      decideBullBoard({ nodeEnv: "development", user: "admin", password: undefined }),
    ).toThrow(/both/)
  })

  it("refuses a short password", () => {
    expect(() =>
      decideBullBoard({ nodeEnv: "development", user: "admin", password: "short" }),
    ).toThrow(/at least 12/)
  })
})

describe("parseBasicAuth", () => {
  it("keeps colons inside the password", () => {
    expect(parseBasicAuth(header("admin", "a:b:c"))).toEqual({ user: "admin", password: "a:b:c" })
  })

  const noColon = `Basic ${Buffer.from("nocolon").toString("base64")}`

  it.each([undefined, "", "Bearer abc", "Basic", noColon])("returns null for %s", (value) => {
    expect(parseBasicAuth(value)).toBeNull()
  })
})

describe("basicAuth middleware", () => {
  const middleware = basicAuth({ user: "admin", password: "correct-horse-battery" }, "test")

  function run(authorization: string | undefined) {
    const req = { headers: { authorization } } as unknown as Request
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    }
    const next = vi.fn() as unknown as NextFunction
    middleware(req, res as unknown as Response, next)
    return { res, next }
  }

  it("calls next for the right credentials", () => {
    const { next, res } = run(header("admin", "correct-horse-battery"))
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it.each([
    ["no header", undefined],
    ["wrong password", header("admin", "nope")],
    ["wrong user", header("root", "correct-horse-battery")],
  ])("challenges on %s", (_label, value) => {
    const { next, res } = run(value)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", expect.stringContaining("Basic"))
  })
})
