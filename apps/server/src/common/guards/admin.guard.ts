import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { User } from "@tgstack/db";
import { SESSION_COOKIE } from "@tgstack/shared";
import type { Request } from "express";
import { AuthService } from "../../modules/auth/auth.service.js";

export interface AuthenticatedRequest extends Request {
  admin?: { user: User; sessionId: string; expiresAt: Date };
}

/**
 * Protects every `/api/admin/*` route: requires a valid session cookie of a user
 * who is still an ADMIN. `401` without a usable session, `403` for non-admins.
 * Apply it with `@AdminController()`.
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
