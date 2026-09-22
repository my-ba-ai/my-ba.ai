import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SidebarNav } from "./sidebar-nav"

vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks/aaaaaaaa-2222-4333-8444-555555555555",
}))

afterEach(cleanup)

describe("SidebarNav", () => {
  it("marks Tasks as the current page on a nested task route", () => {
    render(<SidebarNav />)
    const tasks = screen.getByRole("link", { name: "Tasks" })
    expect(tasks.getAttribute("href")).toBe("/tasks")
    expect(tasks.getAttribute("aria-current")).toBe("page")
  })

  it.each([
    ["Agents", "Phase 4"],
    ["Reports", "Phase 2"],
    ["Settings", "Phase 2"],
  ])("renders %s as a disabled button naming %s, not a link", (label, phase) => {
    render(<SidebarNav />)
    const item = screen.getByRole("button", { name: `${label}, arrives in ${phase}` })
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(screen.queryByRole("link", { name: new RegExp(`^${label}`) })).toBeNull()
    expect(item.textContent).toContain(phase)
  })
})
