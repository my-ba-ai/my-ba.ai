import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import type { AuthContext } from "@my-ba/shared"
import type { NextFunction, Request, Response } from "express"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AuthenticatedRequest } from "../auth/authenticated-request"
import { PurchaseTasksController } from "./purchase-tasks.controller"
import { PurchaseTasksService } from "./purchase-tasks.service"
import { ScreeningRunService } from "./screening-run.service"

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
    stageStatus: vi.fn(async () => ({ state: "running", stalled: false, version: "10-20-0" })),
  }
  const screening = {
    run: vi.fn(async () => ({ id: "ran" })),
    approve: vi.fn(async () => ({ id: "approved" })),
    reject: vi.fn(async () => ({ id: "rejected" })),
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
      providers: [
        { provide: PurchaseTasksService, useValue: service },
        { provide: ScreeningRunService, useValue: screening },
      ],
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

  it("GET /purchase-tasks/:taskId/stage answers the status with its version as the ETag (P1-6)", async () => {
    expect((await fetch(`${base}/purchase-tasks/not-a-uuid/stage`)).status).toBe(400)
    const response = await fetch(`${base}/purchase-tasks/${ID}/stage`)
    expect(response.status).toBe(200)
    expect(response.headers.get("etag")).toBe('"10-20-0"')
    expect(response.headers.get("cache-control")).toBe("private, no-cache")
    expect(await response.json()).toEqual({ state: "running", stalled: false, version: "10-20-0" })
    expect(service.stageStatus).toHaveBeenCalledWith(AUTH, ID)
  })

  it("GET /purchase-tasks/:taskId/stage answers 304 with no body when the version is unchanged", async () => {
    const same = await fetch(`${base}/purchase-tasks/${ID}/stage`, {
      headers: { "if-none-match": '"10-20-0"' },
    })
    expect(same.status).toBe(304)
    expect(await same.text()).toBe("")
    // What a browser sends: a list, weak forms, and the `no-cache` a conditional fetch adds.
    const listed = await fetch(`${base}/purchase-tasks/${ID}/stage`, {
      headers: { "if-none-match": 'W/"10-19-0", "10-20-0"', "cache-control": "no-cache" },
    })
    expect(listed.status).toBe(304)
    const moved = await fetch(`${base}/purchase-tasks/${ID}/stage`, {
      headers: { "if-none-match": '"10-19-0"' },
    })
    expect(moved.status).toBe(200)
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

  it("POST /purchase-tasks/:taskId/run answers 202 and forwards (P1-6)", async () => {
    expect((await send("POST", "/purchase-tasks/not-a-uuid/run", {})).status).toBe(400)
    const response = await send("POST", `/purchase-tasks/${ID}/run`, {})
    expect(response.status).toBe(202)
    expect(screening.run).toHaveBeenCalledWith(AUTH, ID)
  })

  it("POST /purchase-tasks/:taskId/approve validates the body, then forwards with 202", async () => {
    screening.approve.mockClear()
    expect((await send("POST", `/purchase-tasks/${ID}/approve`, { approved: true })).status).toBe(
      400,
    )
    expect(screening.approve).not.toHaveBeenCalled()
    const response = await send("POST", `/purchase-tasks/${ID}/approve`, { keep: ["loc-a"] })
    expect(response.status).toBe(202)
    expect(screening.approve).toHaveBeenCalledWith(AUTH, ID, { keep: ["loc-a"] })
  })

  it("POST /purchase-tasks/:taskId/reject answers 200 and forwards", async () => {
    expect((await send("POST", `/purchase-tasks/${ID}/reject`, { keep: [] })).status).toBe(400)
    const response = await send("POST", `/purchase-tasks/${ID}/reject`, { note: "tighten" })
    expect(response.status).toBe(200)
    expect(screening.reject).toHaveBeenCalledWith(AUTH, ID, { note: "tighten" })
  })
})
