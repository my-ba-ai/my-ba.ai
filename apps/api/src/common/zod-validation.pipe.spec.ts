import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { ZodValidationPipe } from "./zod-validation.pipe"

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(z.object({ message: z.string().trim().min(1) }))

  it("returns the parsed value", () => {
    expect(pipe.transform({ message: "  hi  ", extra: true })).toEqual({ message: "hi" })
  })

  it("throws BadRequest with issue paths", () => {
    try {
      pipe.transform({ message: "" })
      expect.fail("expected a BadRequestException")
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException)
      const body = (error as BadRequestException).getResponse() as { issues: { path: string }[] }
      expect(body.issues[0]?.path).toBe("message")
    }
  })
})
