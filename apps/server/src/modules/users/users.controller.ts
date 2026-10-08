import { Body, Get, Param, Patch, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger";
import type { User } from "@tgstack/db";
import {
  errorResponseSchema,
  type ListUsersQuery,
  listUsersQuerySchema,
  type Paginated,
  paginatedSchema,
  type UpdateUserBody,
  type UserDetailDto,
  type UserDto,
  updateUserSchema,
  userDetailSchema,
  userSchema,
} from "@tgstack/shared";
import { CurrentAdmin } from "../auth/admin.guard.js";
import { AdminController } from "../common/admin-controller.decorator.js";
import { UsersAdminService } from "./users-admin.service.js";

@AdminController("users", "admin: users")
export class UsersAdminController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  @ApiOperation({ summary: "Search users (username, name or Telegram ID), filter by role/blocked" })
  @ApiOkResponse({ standardSchema: paginatedSchema(userSchema) })
  list(
    @Query({ schema: listUsersQuerySchema }) query: ListUsersQuery,
  ): Promise<Paginated<UserDto>> {
    return this.users.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "A user with their recent payments" })
  @ApiOkResponse({ standardSchema: userDetailSchema })
  @ApiNotFoundResponse({ standardSchema: errorResponseSchema })
  get(@Param("id") id: string): Promise<UserDetailDto> {
    return this.users.get(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Change a user's role" })
  @ApiOkResponse({ standardSchema: userSchema })
  @ApiBadRequestResponse({
    description: "Invalid body or own role",
    standardSchema: errorResponseSchema,
  })
  @ApiNotFoundResponse({ standardSchema: errorResponseSchema })
  update(
    @Param("id") id: string,
    @Body({ schema: updateUserSchema }) body: UpdateUserBody,
    @CurrentAdmin() admin: User,
  ): Promise<UserDto> {
    return this.users.update(id, body, admin);
  }
}
