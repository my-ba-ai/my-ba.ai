import type { ScreeningStage } from "@my-ba/shared"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScreeningStagePanel } from "./screening-stage-panel"

vi.mock("@/app/(app)/tasks/[taskId]/actions", () => ({ runScreening: vi.fn() }))
// The poll loop is StagePoller's (stage-poller.test.tsx); here, only whether it is mounted.
vi.mock("./stage-poller", () => ({
  StagePoller: ({ version }: { version: string }) => (
    <span data-testid="stage-poller" data-version={version} />
  ),
}))

afterEach(() => {
  cleanup()
})

const poller = () => screen.queryByTestId("stage-poller")

const TASK_ID = "aaaaaaaa-2222-4333-8444-555555555555"

const stage = (overrides: Partial<ScreeningStage>): ScreeningStage => ({
  state: "running",
  stalled: false,
  version: "10-20-0",
  attempt: 1,
  gate: null,
  gateStatus: null,
  failureReason: null,
  costAud: "0.7300",
  totalCostAud: "0.7300",
  ...overrides,
})

describe("ScreeningStagePanel (P1-6 AC 11)", () => {
  it("polls while the worker has the stage, from the rendered version", () => {
    render(
      <ScreeningStagePanel taskId={TASK_ID} stage={stage({ state: "queued", attempt: null })} />,
    )
    expect(screen.getByRole("heading", { name: "Queued" })).toBeDefined()
    expect(poller()?.dataset.version).toBe("10-20-0")
  })

  it("stops polling once the stage settles", () => {
    render(<ScreeningStagePanel taskId={TASK_ID} stage={stage({ state: "rejected" })} />)
    expect(poller()).toBeNull()
  })

  it("explains a typed failure and offers Retry", () => {
    render(
      <ScreeningStagePanel
        taskId={TASK_ID}
        stage={stage({ state: "failed", failureReason: "HTAG_BALANCE_EXHAUSTED" })}
      />,
    )
    expect(screen.getByText(/balance has run out/)).toBeDefined()
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined()
  })

  it("offers Retry and stops polling once the stage stalls", () => {
    render(<ScreeningStagePanel taskId={TASK_ID} stage={stage({ stalled: true })} />)
    expect(screen.getByRole("heading", { name: "Not responding" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined()
    expect(poller()).toBeNull()
  })

  it("shows spend across attempts when the stage looped", () => {
    render(
      <ScreeningStagePanel
        taskId={TASK_ID}
        stage={stage({ attempt: 2, costAud: "0.7300", totalCostAud: "1.4600" })}
      />,
    )
    expect(screen.getByText(/Attempt 2 · A\$0\.73 · A\$1\.46 across all attempts/)).toBeDefined()
  })
})
