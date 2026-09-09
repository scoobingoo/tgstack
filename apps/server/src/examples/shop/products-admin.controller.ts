// EXAMPLE: shop catalogue management for the admin dashboard.
import { Body, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger";
import {
  type CreateProductBody,
  createProductSchema,
  errorResponseSchema,
  type ListProductsQuery,
  listProductsQuerySchema,
  type Paginated,
  type ProductDto,
  paginatedSchema,
  productSchema,
  type UpdateProductBody,
  updateProductSchema,
} from "@tgstack/shared";
import { AdminController } from "../../common/admin-controller.decorator.js";
import { ProductsService } from "./products.service.js";

@AdminController("products", "admin: products (example)")
export class ProductsAdminController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: "List products, including inactive ones by default" })
  @ApiOkResponse({ standardSchema: paginatedSchema(productSchema) })
  list(
    @Query({ schema: listProductsQuerySchema }) query: ListProductsQuery,
  ): Promise<Paginated<ProductDto>> {
    return this.products.list(query);
  }

  @Post()
  @ApiOperation({ summary: "Create a product" })
  @ApiCreatedResponse({ standardSchema: productSchema })
  create(@Body({ schema: createProductSchema }) body: CreateProductBody): Promise<ProductDto> {
    return this.products.create(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a product (any subset of fields)" })
  @ApiOkResponse({ standardSchema: productSchema })
  @ApiNotFoundResponse({ standardSchema: errorResponseSchema })
  update(
    @Param("id") id: string,
    @Body({ schema: updateProductSchema }) body: UpdateProductBody,
  ): Promise<ProductDto> {
    return this.products.update(id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Deactivate a product (soft delete: isActive=false)" })
  @ApiOkResponse({ standardSchema: productSchema })
  @ApiNotFoundResponse({ standardSchema: errorResponseSchema })
  remove(@Param("id") id: string): Promise<ProductDto> {
    return this.products.deactivate(id);
  }
}
