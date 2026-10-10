import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { User } from "@tgstack/db";
import type { MiniAppRequest } from "../guards/mini-app-auth.guard.js";

/** The verified Mini App user of the request (routes protected by `MiniAppAuthGuard`). */
export const AppUser = createParamDecorator((_data: unknown, context: ExecutionContext): User => {
  const request = context.switchToHttp().getRequest<MiniAppRequest>();
  if (!request.miniApp) throw new UnauthorizedException();
  return request.miniApp.user;
});
