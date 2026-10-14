import { applyDecorators, Controller, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { errorResponseSchema } from "@tgstack/shared";
import { MiniAppAuthGuard } from "../guards/mini-app-auth.guard.js";

/**
 * `@Controller("app/<path>")` + {@link MiniAppAuthGuard}. Use it for every Mini App
 * endpoint so none can be published without initData authentication by accident.
 */
export function MiniAppController(path: string, tag = "mini app"): ClassDecorator {
  return applyDecorators(
    Controller(path ? `app/${path}` : "app"),
    UseGuards(MiniAppAuthGuard),
    ApiTags(tag),
    ApiHeader({
      name: "Authorization",
      description: "tma <Telegram.WebApp.initData>",
      required: true,
    }),
    ApiUnauthorizedResponse({
      description: "Missing or invalid initData",
      standardSchema: errorResponseSchema,
    }),
  );
}
