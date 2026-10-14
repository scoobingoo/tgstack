import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@tgstack/db";
import type { ListPaymentsQuery, Paginated, PaymentDto } from "@tgstack/shared";
import { GrammyError } from "grammy";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
} from "./interfaces/payment-provider.interface.js";
import { paymentInclude, toPaymentDto } from "./payments.mapper.js";

/** Resolves providers by name and implements provider-independent operations. */
@Injectable()
export class PaymentsService {
  private readonly providers: Map<string, PaymentProvider>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDERS) providers: PaymentProvider[],
  ) {
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
  }

  /** Registered provider names, e.g. `["telegram-stars"]`. */
  get providerNames(): string[] {
    return [...this.providers.keys()];
  }

  getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider)
      throw new ServiceUnavailableException(`Payment provider "${name}" is not configured`);
    return provider;
  }

  /**
   * The provider that handles Telegram-native payments in `currency`
   * (`XTR` → Telegram Stars). Used for `pre_checkout_query` and `successful_payment`.
   */
  getProviderForCurrency(currency: string): PaymentProvider {
    const provider = [...this.providers.values()].find((p) => p.currency === currency);
    if (!provider)
      throw new ServiceUnavailableException(`No payment provider for currency ${currency}`);
    return provider;
  }

  async list(query: ListPaymentsQuery): Promise<Paginated<PaymentDto>> {
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items: items.map(toPaymentDto), total, page: query.page, limit: query.limit };
  }

  /** Refunds through the payment's provider, then marks it REFUNDED. */
  async refund(id: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status === "REFUNDED") throw new ConflictException("Payment was already refunded");

    try {
      await this.getProvider(payment.provider).refund(payment);
    } catch (error) {
      if (error instanceof GrammyError) {
        throw new BadGatewayException(`Telegram refused the refund: ${error.description}`);
      }
      throw error;
    }
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: "REFUNDED", refundedAt: new Date() },
      include: paymentInclude,
    });
    return toPaymentDto(updated);
  }
}
