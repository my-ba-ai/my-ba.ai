import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import type { AuthContext } from "@my-ba/shared"
import type { NextFunction, Request, Response } from "express"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AuthenticatedRequest } from "../auth/authenticated-request"
import { PurchaseTasksController } from "./purchase-tasks.controller"
import { PurchaseTasksService } from "./purchase-tasks.service"

const AUTH: AuthContext = {
  externalAuthId: "user_2abc",
  userId: "11111111-2222-4333-8444-555555555555",
  tenantId: "99999999-2222-4333-8444-555555555555",
  email: "brian@example.com",
  displayName: "Brian Liu",
  role: "investor",
  sessionId: "sess_1",
  provisioned: false,
}

/**
 * Over real HTTP, because the thing under test is the wiring — the route path
 * and the param pipe — which a direct method call would bypass. The guard is
 * not in this module (it is covered by auth.guard.spec); a middleware stands in
 * for what it attaches.
 */
describe("PurchaseTasksController (HTTP)", () => {
  let app: INestApplication
  let base: string
  const service = {
    list: vi.fn(async () => ({ items: [] })),
    get: vi.fn(async () => ({})),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PurchaseTasksController],
      providers: [{ provide: PurchaseTasksService, useValue: service }],
    }).compile()

    // forceCloseConnections: fetch (undici) keeps sockets alive, and without it
    // app.close() waits on them until the hook times out.
    app = moduleRef.createNestApplication({ logger: false, forceCloseConnections: true })
    app.setGlobalPrefix("api")
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).auth = AUTH
      next()
    })
    // Explicit IPv4 loopback and port from the socket, not app.getUrl(): its
    // host depends on how the OS resolved "::", which is not portable.
    await app.listen(0, "127.0.0.1")
    const { port } = app.getHttpServer().address() as AddressInfo
    base = `http://127.0.0.1:${port}/api`
  })

  afterAll(async () => {
    await app.close()
  })

  it("GET /purchase-tasks passes the caller's auth context to the service", async () => {
    const response = await fetch(`${base}/purchase-tasks`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [] })
    expect(service.list).toHaveBeenCalledWith(AUTH)
  })

  it("GET /purchase-tasks/:taskId rejects a non-uuid id with 400 before the service runs", async () => {
    service.get.mockClear()
    const response = await fetch(`${base}/purchase-tasks/not-a-uuid`)
    expect(response.status).toBe(400)
    expect(service.get).not.toHaveBeenCalled()
  })

  it("GET /purchase-tasks/:taskId forwards a valid uuid", async () => {
    const id = "aaaaaaaa-2222-4333-8444-555555555555"
    await fetch(`${base}/purchase-tasks/${id}`)
    expect(service.get).toHaveBeenCalledWith(AUTH, id)
  })
})
