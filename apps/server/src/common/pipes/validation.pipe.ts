import { BadRequestException, StandardSchemaValidationPipe } from "@nestjs/common";

/**
 * Global pipe: every `@Body({ schema })`, `@Query({ schema })` and `@Param(…, { schema })`
 * is validated (and coerced) by its zod schema from `@tgstack/shared`.
 * Failures become `400 { message: "Validation failed", issues: [{ path, message }] }`.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        issues: issues.map((issue) => ({
          path: (issue.path ?? [])
            .map((segment) => (typeof segment === "object" ? String(segment.key) : String(segment)))
            .join("."),
          message: issue.message,
        })),
      }),
  });
}
