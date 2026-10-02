import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Badge } from "@/components/ui/badge"
import { FieldDescription } from "@/components/ui/field"

afterEach(cleanup)

/**
 * End to end through vendored shadcn components (D70): a design-system class
 * passed as `className` must survive the component's own `cn()` merge.
 */
describe("design-system classes on vendored components", () => {
  it("FieldDescription keeps text-value and the colour override", () => {
    render(<FieldDescription className="font-data text-value text-ink-3">x</FieldDescription>)
    const classes = screen.getByText("x").className.split(" ")
    expect(classes).toEqual(expect.arrayContaining(["font-data", "text-value", "text-ink-3"]))
    expect(classes).not.toContain("text-muted-foreground")
    expect(classes).not.toContain("text-sm")
  })

  it("Badge takes a design-system micro size over its text-xs", () => {
    render(<Badge className="text-micro-lg">y</Badge>)
    const classes = screen.getByText("y").className.split(" ")
    expect(classes).toContain("text-micro-lg")
    expect(classes).not.toContain("text-xs")
  })
})
