import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { User } from "@tgstack/db";
import { Redis } from "ioredis";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { AppConfig } from "../../config/app-config.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { InjectRedis } from "../../infra/redis/redis.module.js";

export const MAGIC_LINK_TTL_SECONDS = 5 * 60;
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const MAGIC_KEY = (hash: string) => `auth:magic:${hash}`;
const SESSION_KEY = (sid: string) => `auth:session:${sid}`;
const ISSUER = "tgstack";
const AUDIENCE = "tgstack-admin";

export interface AdminSession {
  token: string;
  expiresAt: Date;
  user: User;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Magic-link login for admins (decision D4):
 * 1. `/admin` in the bot → {@link createMagicLink} stores sha256(token) in Redis for 5 minutes.
 * 2. The admin app posts the token → {@link exchange} deletes it atomically (single use)
 *    and issues a JWT whose session id is also kept in Redis, so logout revokes it.
 */
@Injectable()
export class AuthService {
  private readonly secret: Uint8Array;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.secret = new TextEncoder().encode(config.env.JWT_SECRET);
  }

  /** Returns the one-time login URL for an admin. Only the token's hash is stored. */
  async createMagicLink(user: User): Promise<string> {
    if (user.role !== "ADMIN") throw new UnauthorizedException("Only admins can sign in");
    const token = randomBytes(32).toString("base64url");
    await this.redis.set(MAGIC_KEY(sha256(token)), user.id, "EX", MAGIC_LINK_TTL_SECONDS);
    const url = new URL("/auth/callback", this.config.env.ADMIN_URL);
    url.searchParams.set("token", token);
    return url.toString();
  }

  /** Consumes a magic-link token and opens a session. Fails for unknown, used or expired tokens. */
  async exchange(token: string): Promise<AdminSession> {
    // GETDEL is atomic: two concurrent requests can never both use the same token.
    const userId = await this.redis.getdel(MAGIC_KEY(sha256(token)));
    if (!userId) throw new UnauthorizedException("This login link is invalid or has expired");

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== "ADMIN") throw new UnauthorizedException("Admin access required");
    return this.createSession(user);
  }

  async createSession(user: User): Promise<AdminSession> {
    const sid = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    await this.redis.set(SESSION_KEY(sid), user.id, "EX", SESSION_TTL_SECONDS);
    const token = await new SignJWT({ sid })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);
    return { token, expiresAt, user };
  }

  /**
   * Resolves a session cookie to its admin. The user must still exist and still be
   * an admin: demoting someone ends their access on the next request.
   */
  async verify(token: string): Promise<{ user: User; sessionId: string; expiresAt: Date }> {
    let payload: { sub?: string; sid?: unknown; exp?: number };
    try {
      ({ payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ["HS256"],
      }));
    } catch (error) {
      if (error instanceof joseErrors.JOSEError) throw new UnauthorizedException("Invalid session");
      throw error;
    }
    const sessionId = typeof payload.sid === "string" ? payload.sid : undefined;
    if (!sessionId || !payload.sub) throw new UnauthorizedException("Invalid session");

    const userId = await this.redis.get(SESSION_KEY(sessionId));
    if (userId !== payload.sub) throw new UnauthorizedException("Session expired");

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Session expired");
    return { user, sessionId, expiresAt: new Date((payload.exp ?? 0) * 1000) };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.redis.del(SESSION_KEY(sessionId));
  }
}
