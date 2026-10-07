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
    create: vi.fn(async () => ({ id: "created" })),
    update: vi.fn(async () => ({ id: "updated" })),
    screeningEstimate: vi.fn(() => ({ ceilingAud: 1, budgetAud: 20, lines: [] })),
  }
  const ID = "aaaaaaaa-2222-4333-8444-555555555555"
  const send = (method: string, path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })

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

  it("GET /purchase-tasks/screening-estimate is routed to the estimate, not parsed as an id", async () => {
    service.get.mockClear()
    const response = await fetch(`${base}/purchase-tasks/screening-estimate`)
    expect(response.status).toBe(200)
    expect(service.screeningEstimate).toHaveBeenCalled()
    expect(service.get).not.toHaveBeenCalled()
  })

  it("POST /purchase-tasks saves a partial draft (P1-3 AC 6)", async () => {
    const body = { intent: "draft", name: "QLD cashflow", criteria: { states: ["QLD"] } }
    const response = await send("POST", "/purchase-tasks", body)
    expect(response.status).toBe(201)
    expect(service.create).toHaveBeenCalledWith(AUTH, body)
  })

  it("POST /purchase-tasks with intent run rejects partial criteria with 400 (P1-3 AC 6)", async () => {
    service.create.mockClear()
    const body = { intent: "run", name: "QLD cashflow", criteria: { states: ["QLD"] } }
    const response = await send("POST", "/purchase-tasks", body)
    expect(response.status).toBe(400)
    expect(service.create).not.toHaveBeenCalled()
  })

  it("POST /purchase-tasks rejects unknown criteria keys even for a draft", async () => {
    service.create.mockClear()
    const body = { intent: "draft", name: "x", criteria: { demandSupplyMin: 55 } }
    expect((await send("POST", "/purchase-tasks", body)).status).toBe(400)
    expect(service.create).not.toHaveBeenCalled()
  })

  it("PATCH /purchase-tasks/:taskId validates the id and body, then forwards", async () => {
    const body = { intent: "draft", name: "Renamed", criteria: {} }
    expect((await send("PATCH", "/purchase-tasks/not-a-uuid", body)).status).toBe(400)
    const response = await send("PATCH", `/purchase-tasks/${ID}`, body)
    expect(response.status).toBe(200)
    expect(service.update).toHaveBeenCalledWith(AUTH, ID, body)
  })
})
