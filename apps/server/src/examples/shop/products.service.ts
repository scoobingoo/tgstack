// EXAMPLE: shop catalogue (products sold for Telegram Stars).
import { Injectable, NotFoundException } from "@nestjs/common";
import type { Product } from "@tgstack/db";
import type {
  CreateProductBody,
  ListProductsQuery,
  Paginated,
  ProductDto,
  UpdateProductBody,
} from "@tgstack/shared";
import { toProductDto } from "../../common/dto.js";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQuery): Promise<Paginated<ProductDto>> {
    const where = query.includeInactive ? {} : { isActive: true };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: items.map(toProductDto), total, page: query.page, limit: query.limit };
  }

  /** Active products, cheapest first (Mini App shop and `/buy`). */
  async listActive(): Promise<ProductDto[]> {
    const items = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ priceStars: "asc" }, { createdAt: "asc" }],
    });
    return items.map(toProductDto);
  }

  async getActive(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product?.isActive) throw new NotFoundException("Product not found");
    return product;
  }

  async create(body: CreateProductBody): Promise<ProductDto> {
    const product = await this.prisma.product.create({
      data: {
        title: body.title,
        description: body.description,
        priceStars: body.priceStars,
        imageUrl: body.imageUrl ?? null,
        isActive: body.isActive ?? true,
      },
    });
    return toProductDto(product);
  }

  async update(id: string, body: UpdateProductBody): Promise<ProductDto> {
    await this.ensureExists(id);
    const product = await this.prisma.product.update({ where: { id }, data: body });
    return toProductDto(product);
  }

  /** Soft delete: past payments keep pointing at the product. */
  async deactivate(id: string): Promise<ProductDto> {
    await this.ensureExists(id);
    const product = await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    return toProductDto(product);
  }

  private async ensureExists(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException("Product not found");
  }
}
