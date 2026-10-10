import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from "@nestjs/common";
import { TelegramExecutionContext } from "@tgstack/nestjs-grammy";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import type { BotContext } from "../../bot/bot.context.js";
import { BotErrorHandler } from "../../bot/middlewares/error-boundary.js";

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  /** Validation issues, when the request failed schema validation. */
  issues?: { path: string; message: string }[];
}

/**
 * Turns every exception thrown while handling an HTTP request into a consistent
 * JSON body. In bot handlers, a `ForbiddenException` (e.g. from a guard) becomes a
 * polite reply; anything else is re-thrown to the bot's error handler.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("HTTP");

  constructor(@Optional() private readonly botErrors?: BotErrorHandler) {}

  catch(exception: unknown, host: ArgumentsHost): unknown {
    if (TelegramExecutionContext.isTelegram(host)) return this.catchBot(exception, host);
    if (host.getType() !== "http") throw exception;

    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const custom = this.customPayload(exception);
    if (custom) {
      // Exceptions with a bespoke body (e.g. the /health report) are passed through as-is.
      if (!response.headersSent) response.status(custom.status).json(custom.body);
      return custom.body;
    }

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    if (!response.headersSent) response.status(body.statusCode).json(body);
    return body;
  }

  private catchBot(exception: unknown, host: ArgumentsHost): Promise<true> {
    if (!(exception instanceof ForbiddenException) || !this.botErrors) throw exception;
    const ctx = TelegramExecutionContext.create(host).getContext<BotContext>();
    this.logger.warn(`Bot: user ${ctx.from?.id} was denied (${exception.message})`);
    // Returning a value marks the exception as handled.
    return this.botErrors.reply(ctx, "error-forbidden").then(() => true as const);
  }

  private customPayload(exception: unknown): { status: number; body: object } | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const response = exception.getResponse();
    if (typeof response !== "object" || response === null || "statusCode" in response) {
      return undefined;
    }
    return { status: exception.getStatus(), body: response };
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: "Bad Request",
        message: "Validation failed",
        issues: exception.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const payload =
        typeof response === "string"
          ? { message: response }
          : (response as Record<string, unknown>);
      const message = Array.isArray(payload.message)
        ? payload.message.join("; ")
        : String(payload.message ?? exception.message);
      return {
        statusCode: status,
        error: typeof payload.error === "string" ? payload.error : (HttpStatus[status] ?? "Error"),
        message,
        ...(Array.isArray(payload.issues) ? { issues: payload.issues as ErrorBody["issues"] } : {}),
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: "Something went wrong",
    };
  }
}
