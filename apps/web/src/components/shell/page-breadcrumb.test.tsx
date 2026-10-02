import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { breadcrumbs } from "@/lib/breadcrumbs"
import { PageBreadcrumb } from "./page-breadcrumb"

afterEach(cleanup)

const TASK = { id: "aaaaaaaa-2222-4333-8444-555555555555", name: "QLD cashflow" }

describe("PageBreadcrumb", () => {
  it("renders ancestors as links and the current page as aria-current", () => {
    render(<PageBreadcrumb items={breadcrumbs.taskEdit(TASK)} />)
    const nav = screen.getByRole("navigation", { name: "breadcrumb" })

    const links = within(nav)
      .getAllByRole("link")
      .filter((el) => el.tagName === "A")
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Tasks", "/tasks"],
      ["QLD cashflow", `/tasks/${TASK.id}`],
    ])

    const current = within(nav).getByText("Edit")
    expect(current.getAttribute("aria-current")).toBe("page")
    expect(current.tagName).toBe("SPAN")
  })

  it("puts a separator between crumbs, not after the last", () => {
    const { container } = render(<PageBreadcrumb items={breadcrumbs.task(TASK)} />)
    expect(container.querySelectorAll('[data-slot="breadcrumb-separator"]')).toHaveLength(1)
  })
})
