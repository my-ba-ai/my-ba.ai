import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DRAFT_TASK, LOCKED_TASK, SCREENING_TASK } from "./fixtures"
import { TaskCard } from "./task-card"

afterEach(cleanup)

describe("TaskCard", () => {
  it("links the whole row to the task detail page", () => {
    render(<TaskCard task={DRAFT_TASK} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe(`/tasks/${DRAFT_TASK.id}`)
    expect(link.textContent).toContain("Brisbane growth corridor")
  })

  it("shows the status as a text label, not colour alone", () => {
    render(<TaskCard task={SCREENING_TASK} />)
    expect(screen.getByText("Screening")).toBeDefined()
  })

  it("exposes the pipeline position to assistive tech", () => {
    render(<TaskCard task={SCREENING_TASK} />)
    expect(screen.getByRole("img", { name: "Stage 2 of 9: Screening" })).toBeDefined()
  })

  it("marks done, current and remaining stages on the compact stepper", () => {
    const { container } = render(<TaskCard task={SCREENING_TASK} />)
    const states = [...container.querySelectorAll("[data-state]")].map((el) =>
      el.getAttribute("data-state"),
    )
    expect(states).toEqual([
      "done",
      "current",
      "todo",
      "todo",
      "todo",
      "todo",
      "todo",
      "todo",
      "todo",
    ])
  })

  it("shows the LOCKED chip only when lockedAt is set", () => {
    const { rerender } = render(<TaskCard task={DRAFT_TASK} />)
    expect(screen.queryByText("Locked")).toBeNull()

    rerender(<TaskCard task={LOCKED_TASK} />)
    expect(screen.getByText("Locked")).toBeDefined()
  })

  it("renders the machine-readable update time", () => {
    const { container } = render(<TaskCard task={DRAFT_TASK} />)
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(DRAFT_TASK.updatedAt)
  })
})
