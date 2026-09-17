import { BadRequestException, type PipeTransform } from "@nestjs/common"
import type { z } from "zod"

/**
 * Parse, don't cast. `@Body(new ZodValidationPipe(schema))` hands the handler
 * the schema's output type, and a body that does not match never reaches it.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        message: "Request validation failed",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      })
    }
    return result.data
  }
}
