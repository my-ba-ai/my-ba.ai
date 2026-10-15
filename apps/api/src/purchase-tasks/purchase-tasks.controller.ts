import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common"
import type { Response } from "express"
import {
  type ApproveScreeningRequest,
  approveScreeningRequestSchema,
  type AuthContext,
  type ListPurchaseTasksResponse,
  type PurchaseTaskDetail,
  type SavePurchaseTaskRequest,
  type ScreeningCostEstimate,
  type ScreeningStageStatus,
  purchaseTaskIdParamSchema,
  type RejectScreeningRequest,
  rejectScreeningRequestSchema,
  savePurchaseTaskRequestSchema,
} from "@my-ba/shared"
import { CurrentUser } from "../auth/current-user.decorator"
import { ZodValidationPipe } from "../common/zod-validation.pipe"
import { PurchaseTasksService } from "./purchase-tasks.service"
import { ScreeningRunService } from "./screening-run.service"

@Controller("purchase-tasks")
export class PurchaseTasksController {
  constructor(
    private readonly tasks: PurchaseTasksService,
    private readonly screening: ScreeningRunService,
  ) {}

  @Get()
  async list(@CurrentUser() auth: AuthContext): Promise<ListPurchaseTasksResponse> {
    return this.tasks.list(auth)
  }

  /** Declared before `:taskId` so the literal segment is not parsed as an id. */
  @Get("screening-estimate")
  screeningEstimate(): ScreeningCostEstimate {
    return this.tasks.screeningEstimate()
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodValidationPipe(savePurchaseTaskRequestSchema)) body: SavePurchaseTaskRequest,
  ): Promise<PurchaseTaskDetail> {
    return this.tasks.create(auth, body)
  }

  @Patch(":taskId")
  async update(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
    @Body(new ZodValidationPipe(savePurchaseTaskRequestSchema)) body: SavePurchaseTaskRequest,
  ): Promise<PurchaseTaskDetail> {
    return this.tasks.update(auth, taskId, body)
  }

  @Get(":taskId")
  async get(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
  ): Promise<PurchaseTaskDetail> {
    return this.tasks.get(auth, taskId)
  }

  /**
   * The detail page's poll (P1-6). The ETag is the stage `version`; a matching
   * `If-None-Match` gets `304` with no body. Compared here rather than left to
   * Express: a conditional `fetch` also sends `Cache-Control: no-cache`, which
   * Express's freshness check treats as a forced reload, so it never 304s.
   */
  @Get(":taskId/stage")
  async stage(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const status: ScreeningStageStatus = await this.tasks.stageStatus(auth, taskId)
    const etag = `"${status.version}"`
    response.setHeader("ETag", etag)
    // Per user, and only worth anything fresh: never stored by a shared cache.
    response.setHeader("Cache-Control", "private, no-cache")
    if (etagMatches(ifNoneMatch, etag)) {
      response.status(HttpStatus.NOT_MODIFIED).end()
      return
    }
    response.status(HttpStatus.OK).json(status)
  }

  /** Run screening, or Retry a failed attempt (P1-6). 202: the worker does the work. */
  @Post(":taskId/run")
  @HttpCode(HttpStatus.ACCEPTED)
  async run(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
  ): Promise<PurchaseTaskDetail> {
    return this.screening.run(auth, taskId)
  }

  /** Approve the screening approval gate (P1-6). 202: the worker resumes the graph. */
  @Post(":taskId/approve")
  @HttpCode(HttpStatus.ACCEPTED)
  async approve(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
    @Body(new ZodValidationPipe(approveScreeningRequestSchema)) body: ApproveScreeningRequest,
  ): Promise<PurchaseTaskDetail> {
    return this.screening.approve(auth, taskId, body)
  }

  /** Reject & Adjust (P1-6): back to DRAFT, nothing enqueued. */
  @Post(":taskId/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
    @Body(new ZodValidationPipe(rejectScreeningRequestSchema)) body: RejectScreeningRequest,
  ): Promise<PurchaseTaskDetail> {
    return this.screening.reject(auth, taskId, body)
  }
}

/** `If-None-Match` names `etag` (a list, `*`, and weak forms per RFC 9110 weak comparison). */
function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag)
}
