import { render, screen } from "@testing-library/react"
import { TASK_STATUS_ORDER } from "@my-ba/shared"
import { describe, expect, it } from "vitest"
import { PipelineOutline } from "./pipeline-outline"

describe("PipelineOutline", () => {
  it("renders every pipeline stage from the shared package", () => {
    render(<PipelineOutline stages={TASK_STATUS_ORDER} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(
      TASK_STATUS_ORDER.length,
    )
    expect(screen.getByText("contact agent")).toBeDefined()
  })
})
