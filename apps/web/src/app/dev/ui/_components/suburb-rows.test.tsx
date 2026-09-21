import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SUBURB_ROWS } from "./fixtures"
import { SuburbRows } from "./suburb-rows"

afterEach(cleanup)

function bodyRowNames() {
  const [, body] = screen.getAllByRole("rowgroup")
  return within(body!)
    .getAllByRole("row")
    .map((row) => row.getAttribute("aria-label"))
}

describe("SuburbRows", () => {
  it("renders card rows, not <table> markup", () => {
    const { container } = render(<SuburbRows rows={SUBURB_ROWS} />)

    expect(container.querySelector("table")).toBeNull()
    expect(bodyRowNames()).toHaveLength(SUBURB_ROWS.length)
  })

  it("sorts by score descending, then toggles to ascending", () => {
    render(<SuburbRows rows={SUBURB_ROWS} />)

    expect(bodyRowNames()[0]).toBe("Open Maitland")

    fireEvent.click(screen.getByRole("button", { name: /score/i }))

    expect(bodyRowNames()[0]).toBe("Open Liverpool")
  })
})
