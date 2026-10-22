import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, User } from "@tgstack/db";
import type {
  ListUsersQuery,
  Paginated,
  UpdateUserBody,
  UserDetailDto,
  UserDto,
} from "@tgstack/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { paymentInclude } from "../payments/payments.mapper.js";
import { PaymentsService } from "../payments/payments.service.js";
import { toUserDto } from "./users.mapper.js";

const RECENT_PAYMENTS = 20;

@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const where = this.buildWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toUserDto), total, page: query.page, limit: query.limit };
  }

  async get(id: string): Promise<UserDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    const [payments, paymentsCount, spent] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId: id },
        include: paymentInclude,
        orderBy: { createdAt: "desc" },
        take: RECENT_PAYMENTS,
      }),
      this.prisma.payment.count({ where: { userId: id } }),
      this.prisma.payment.aggregate({
        where: { userId: id, status: "PAID", currency: "XTR" },
        _sum: { amount: true },
      }),
    ]);
    return {
      ...toUserDto(user),
      onboarding: user.onboarding,
      payments: payments.map((payment) => this.payments.toDto(payment)),
      paymentsCount,
      totalSpentStars: spent._sum.amount ?? 0,
    };
  }

  async update(id: string, body: UpdateUserBody, actor: User): Promise<UserDto> {
    if (id === actor.id && body.role !== actor.role) {
      throw new BadRequestException("You cannot change your own role");
    }
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("User not found");
    const user = await this.prisma.user.update({ where: { id }, data: { role: body.role } });
    return toUserDto(user);
  }

  private buildWhere(query: ListUsersQuery): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.blocked === undefined ? {} : { isBlocked: query.blocked }),
    };
    const search = query.search?.replace(/^@/, "");
    if (search) {
      const contains = { contains: search, mode: "insensitive" as const };
      where.OR = [{ username: contains }, { firstName: contains }, { lastName: contains }];
      if (/^\d{1,19}$/.test(search)) where.OR.push({ telegramId: BigInt(search) });
    }
    return where;
  }
}
