import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { User } from "@tgstack/db";
import type { Request } from "express";
import { AuthService, SESSION_COOKIE } from "./auth.service.js";

export interface AuthenticatedRequest extends Request {
  admin?: { user: User; sessionId: string; expiresAt: Date };
}

/**
 * Protects every `/api/admin/*` route: requires a valid session cookie of a user
 * who is still an ADMIN. `401` without a usable session, `403` for non-admins.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (request.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException("Sign in by sending /admin to the bot");

    const session = await this.auth.verify(token);
    if (session.user.role !== "ADMIN") throw new ForbiddenException("Admin access required");
    request.admin = session;
    return true;
  }
}

/** The signed-in admin of the current request (routes protected by {@link AdminGuard}). */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.admin) throw new UnauthorizedException();
  return request.admin.user;
});
