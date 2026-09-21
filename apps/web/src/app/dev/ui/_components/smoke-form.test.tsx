import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SmokeForm } from "./smoke-form"

afterEach(cleanup)

describe("SmokeForm", () => {
  it("blocks submission and renders every schema error inline", async () => {
    const onParsed = vi.fn()
    render(<SmokeForm onParsed={onParsed} />)

    fireEvent.click(screen.getByRole("button", { name: "Parse" }))

    expect(await screen.findByText("Name needs at least 3 characters.")).toBeDefined()
    expect(screen.getByText("Choose a strategy.")).toBeDefined()
    expect(screen.getByText("Enter a budget in whole dollars.")).toBeDefined()
    expect(screen.getByText("Confirm before continuing.")).toBeDefined()
    expect(screen.getByRole("status").textContent).toContain("4 fields need attention")
    expect(onParsed).not.toHaveBeenCalled()
  })

  it("round-trips valid input through the schema, including transforms", async () => {
    const onParsed = vi.fn()
    render(
      <SmokeForm
        onParsed={onParsed}
        defaultValues={{
          taskName: "  Hunter yield play  ",
          strategy: "yield",
          maxBudget: 850_000,
          acknowledged: true,
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Parse" }))

    await waitFor(() =>
      expect(onParsed).toHaveBeenCalledWith({
        taskName: "Hunter yield play",
        strategy: "yield",
        maxBudget: 850_000,
        acknowledged: true,
      }),
    )
  })
})
