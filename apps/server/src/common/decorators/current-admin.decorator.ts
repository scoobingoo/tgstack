import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "../guards/admin.guard.js";

/** The signed-in admin of the current request (routes protected by `AdminGuard`). */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.admin) throw new UnauthorizedException();
  return request.admin.user;
});
