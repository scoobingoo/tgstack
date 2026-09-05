import { z } from "zod";
import { isoDateSchema, paginationQuerySchema, queryBooleanSchema } from "./common.js";

// EXAMPLE: shop products.
export const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priceStars: z.number().int().positive(),
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateSchema,
});
export type ProductDto = z.infer<typeof productSchema>;

const title = z.string().trim().min(1).max(32);
const description = z.string().trim().min(1).max(255);

/**
 * Limits follow the Bot API invoice rules: title 1-32 characters, description
 * 1-255 characters; Stars amounts are positive integers.
 */
export const createProductSchema = z.object({
  title,
  description,
  priceStars: z.number().int().min(1).max(100_000),
  imageUrl: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductBody = z.input<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductBody = z.input<typeof updateProductSchema>;

export const listProductsQuerySchema = paginationQuerySchema.extend({
  includeInactive: queryBooleanSchema.default(true),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
