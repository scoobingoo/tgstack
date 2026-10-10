import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { serializeBigInt } from "@tgstack/db";
import { map, type Observable } from "rxjs";

const containsBigInt = (value: unknown, depth = 0): boolean => {
  if (typeof value === "bigint") return true;
  if (value === null || typeof value !== "object" || depth > 32) return false;
  if (value instanceof Date) return false;
  return Object.values(value).some((child) => containsBigInt(child, depth + 1));
};

/**
 * Decision D6 / architecture rule 6: Telegram IDs are `BigInt` in the database and
 * strings in JSON. DTO mappers already convert them; this global interceptor is
 * the safety net, so a raw Prisma row can never crash `JSON.stringify` in a REST
 * response or a Server-Sent Event (`TypeError: Do not know how to serialize a BigInt`).
 * Responses without a `bigint` pass through untouched.
 */
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    return next.handle().pipe(
      // Works for SSE too: each emitted `MessageEvent` goes through the same map.
      map((value: unknown) => (containsBigInt(value) ? serializeBigInt(value) : value)),
    );
  }
}
