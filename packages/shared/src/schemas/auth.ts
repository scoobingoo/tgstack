import { z } from "zod";
import { userSchema } from "./users.js";

export const exchangeTokenSchema = z.object({
  token: z.string().min(20).max(200),
});
export type ExchangeTokenBody = z.infer<typeof exchangeTokenSchema>;

export const sessionSchema = z.object({
  user: userSchema,
  expiresAt: z.iso.datetime({ offset: true }),
});
export type SessionDto = z.infer<typeof sessionSchema>;
