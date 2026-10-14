import type { IncomingMessage } from "node:http";
import { LoggerModule } from "nestjs-pino";
import { AppConfig } from "../../config/app-config.js";

/** Pino logging: pretty, single-line output in development; JSON in production. */
export const LoggingModule = LoggerModule.forRootAsync({
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({
    pinoHttp: {
      level: config.env.LOG_LEVEL,
      ...(config.isProduction || config.isTest
        ? {}
        : {
            transport: {
              target: "pino-pretty",
              options: {
                singleLine: true,
                translateTime: "SYS:HH:MM:ss.l",
                ignore: "pid,hostname",
              },
            },
          }),
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'req.headers["x-telegram-bot-api-secret-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: "[redacted]",
      },
      autoLogging: {
        // Health probes and webhook calls would drown everything else.
        ignore: (req: IncomingMessage) =>
          req.url === "/health" || (req.url?.startsWith("/telegram/") ?? false),
      },
    },
  }),
});
