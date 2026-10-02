import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TaskListEmpty } from "./task-list-empty"

afterEach(cleanup)

describe("TaskListEmpty", () => {
  it("explains the workflow in three steps", () => {
    render(<TaskListEmpty />)
    const steps = within(screen.getByRole("list")).getAllByRole("listitem")
    expect(steps).toHaveLength(3)
    expect(steps.map((step) => within(step).getByRole("heading").textContent)).toEqual([
      "Define the brief",
      "Approve each stage",
      "Contact agents",
    ])
  })

  it("says why the list is empty and how to start", () => {
    render(<TaskListEmpty />)
    expect(screen.getByRole("heading", { name: "No purchase tasks yet" })).toBeDefined()
    expect(screen.getByText(/Start one with New\s+Purchase Task/)).toBeDefined()
  })
})
