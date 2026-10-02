import { describe, expect, it } from "vitest"
import { breadcrumbs } from "./breadcrumbs"

const TASK = { id: "aaaaaaaa-2222-4333-8444-555555555555", name: "QLD cashflow" }

describe("breadcrumbs factory", () => {
  it("links every ancestor and leaves the current page unlinked", () => {
    expect(breadcrumbs.taskEdit(TASK)).toEqual([
      { label: "Tasks", href: "/tasks" },
      { label: "QLD cashflow", href: `/tasks/${TASK.id}` },
      { label: "Edit" },
    ])
  })

  it("builds each route's trail from its parent's", () => {
    expect(breadcrumbs.task(TASK)).toEqual([
      { label: "Tasks", href: "/tasks" },
      { label: "QLD cashflow" },
    ])
    expect(breadcrumbs.newTask()).toEqual([{ label: "Tasks", href: "/tasks" }, { label: "New" }])
  })

  it("still leads back when the task couldn't load", () => {
    expect(breadcrumbs.taskUnavailable()).toEqual([
      { label: "Tasks", href: "/tasks" },
      { label: "Task" },
    ])
  })

  it("returns a fresh array each call", () => {
    const a = breadcrumbs.newTask()
    a.pop()
    expect(breadcrumbs.newTask()).toHaveLength(2)
  })
})
