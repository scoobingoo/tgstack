import { applyDecorators, Controller, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { errorResponseSchema, SESSION_COOKIE } from "@tgstack/shared";
import { AdminGuard } from "../guards/admin.guard.js";

/**
 * `@Controller("admin/<path>")` + {@link AdminGuard}. Use it for every admin
 * endpoint so none can be published without authentication by accident.
 */
export function AdminController(path: string, tag: string): ClassDecorator {
  return applyDecorators(
    Controller(`admin/${path}`),
    UseGuards(AdminGuard),
    ApiTags(tag),
    ApiCookieAuth(SESSION_COOKIE),
    ApiUnauthorizedResponse({
      description: "No valid session",
      standardSchema: errorResponseSchema,
    }),
    ApiForbiddenResponse({ description: "Not an admin", standardSchema: errorResponseSchema }),
  );
}
