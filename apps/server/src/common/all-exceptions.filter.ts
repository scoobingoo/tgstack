import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  /** Validation issues, when the request failed schema validation. */
  issues?: { path: string; message: string }[];
}

/**
 * Turns every exception thrown while handling an HTTP request into a consistent
 * JSON body. Exceptions from other contexts (bot handlers) are re-thrown so the
 * bot's own filter and error handler deal with them.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("HTTP");

  catch(exception: unknown, host: ArgumentsHost): unknown {
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
