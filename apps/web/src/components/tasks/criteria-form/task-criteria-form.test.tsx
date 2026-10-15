import { type CriteriaFormValues, applyPreset, emptyFormValues } from "@/lib/criteria-form"
import type { SaveTaskInput } from "@/app/(app)/tasks/(overview)/actions"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TaskCriteriaForm } from "./task-criteria-form"

const saveTask = vi.fn(async (_taskId: string | null, _input: SaveTaskInput) => ({
  ok: false as const,
  message: "stubbed",
  issues: [],
}))
vi.mock("@/app/(app)/tasks/(overview)/actions", () => ({
  saveTask: (taskId: string | null, input: SaveTaskInput) => saveTask(taskId, input),
}))

afterEach(() => {
  cleanup()
  saveTask.mockClear()
})

const prefilled = (): CriteriaFormValues => ({
  ...applyPreset(emptyFormValues(), "cashflow", "low"),
  name: "QLD cashflow",
  states: ["QLD"],
})

const renderForm = (initialValues: CriteriaFormValues = prefilled()) =>
  render(<TaskCriteriaForm taskId={null} initialValues={initialValues} estimate={null} />)

describe("TaskCriteriaForm — preset switching (P1-3 AC 3)", () => {
  it("switches preset without asking when nothing was customised", () => {
    renderForm()
    fireEvent.click(screen.getByRole("radio", { name: /^Growth/ }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("radio", { name: /^Growth/ }).getAttribute("aria-checked")).toBe("true")
  })

  it("asks before replacing customised filters, and keeps them on cancel", async () => {
    const values = prefilled()
    values.filters.maxVacancyRatePct = { enabled: true, value: 2 }
    renderForm(values)

    fireEvent.click(screen.getByRole("radio", { name: /^Growth/ }))
    expect(await screen.findByRole("dialog", { name: "Replace your edits?" })).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Keep my edits" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.getByRole("radio", { name: /^Cashflow/ }).getAttribute("aria-checked")).toBe(
      "true",
    )
  })
})

describe("TaskCriteriaForm — Save as Draft (P1-3 AC 6)", () => {
  it("saves partial criteria as a draft through the server action", async () => {
    renderForm({ ...emptyFormValues(), name: "Later" })
    fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }))
    await waitFor(() => expect(saveTask).toHaveBeenCalledTimes(1))
    expect(saveTask).toHaveBeenCalledWith(null, {
      intent: "draft",
      name: "Later",
      criteria: expect.objectContaining({ states: [], profile: {} }),
    })
    expect(await screen.findByRole("alert")).toBeDefined()
  })

  it("does not save without a name", async () => {
    renderForm({ ...emptyFormValues() })
    fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }))
    expect(await screen.findByText("Purchase task name is required")).toBeDefined()
    expect(saveTask).not.toHaveBeenCalled()
  })
})

describe("TaskCriteriaForm — steps as tabs", () => {
  it("renders the three steps as tabs with the first selected", () => {
    renderForm()
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((t) => t.textContent)).toEqual(["Strategy & risk", "Criteria", "Review"])
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true")
  })

  it("moves forward only when the steps being left are valid", async () => {
    renderForm({ ...emptyFormValues() })
    fireEvent.click(screen.getByRole("tab", { name: "Criteria" }))
    expect(await screen.findByText("Purchase task name is required")).toBeDefined()
    expect(screen.getByRole("tab", { name: "Strategy & risk" }).getAttribute("aria-selected")).toBe(
      "true",
    )
  })

  it("advances to a later tab when the form is valid", async () => {
    renderForm()
    fireEvent.click(screen.getByRole("tab", { name: "Review" }))
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Review" }).getAttribute("aria-selected")).toBe(
        "true",
      ),
    )
    expect(screen.getByRole("tabpanel", { name: "Review" })).toBeDefined()
  })
})

const openReview = async () => {
  fireEvent.click(screen.getByRole("tab", { name: "Review" }))
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Review" }).getAttribute("aria-selected")).toBe("true"),
  )
}

describe("TaskCriteriaForm — Create Task & Run Screening (P1-6)", () => {
  it("saves with intent run when the criteria can run", async () => {
    renderForm({ ...prefilled(), propertyType: "house" })
    await openReview()
    const button = screen.getByRole("button", { name: "Create Task & Run Screening" })
    expect(button.hasAttribute("disabled")).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(saveTask).toHaveBeenCalledTimes(1))
    expect(saveTask).toHaveBeenCalledWith(null, expect.objectContaining({ intent: "run" }))
  })

  it("stays disabled while the criteria can't run (AC 11)", async () => {
    const values = {
      ...prefilled(),
      propertyType: "house" as const,
      weights: { ...prefilled().weights },
    }
    for (const key of Object.keys(values.weights) as Array<keyof typeof values.weights>) {
      values.weights[key] = 0
    }
    renderForm(values)
    await openReview()
    const button = screen.getByRole("button", { name: "Create Task & Run Screening" })
    expect(button.getAttribute("aria-disabled") === "true" || button.hasAttribute("disabled")).toBe(
      true,
    )
    fireEvent.click(button)
    expect(saveTask).not.toHaveBeenCalled()
  })
})
