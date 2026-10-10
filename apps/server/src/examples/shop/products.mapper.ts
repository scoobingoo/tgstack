// EXAMPLE: shop — Prisma → JSON mapper for products.
import type { Product } from "@tgstack/db";
import type { ProductDto } from "@tgstack/shared";

export function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    priceStars: product.priceStars,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  };
}
