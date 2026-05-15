import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '../../database/connection';
import { payments, paymentTransactions } from '../../database/schema/payments';
import { PaymentsService } from './payments.service';

export interface CreateRefundDto {
  paymentId: string;
  amount?: number;
  reason?: string;
  description?: string;
}

export interface RefundResponseDto {
  id: string;
  paymentId: string;
  amount: number;
  status: string;
  reason?: string;
  createdAt: string;
}

@Injectable()
export class RefundsService {
  constructor(private readonly paymentsService: PaymentsService) {}

  async createRefund(
    userId: string,
    refundDto: CreateRefundDto,
  ): Promise<RefundResponseDto> {
    const payment = await this.findStudentPayment(userId, refundDto.paymentId);
    const requestedAmount = refundDto.amount;
    const paymentAmount = parseFloat(payment.totalAmount);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      throw new BadRequestException('Pagamento não pode ser reembolsado');
    }

    if (
      typeof requestedAmount === 'number' &&
      requestedAmount > 0 &&
      requestedAmount !== paymentAmount
    ) {
      throw new BadRequestException(
        'Reembolso parcial ainda não está habilitado no cutover Stripe',
      );
    }

    await this.paymentsService.refundPayment(
      payment.id,
      refundDto.reason || refundDto.description || 'Solicitação do cliente',
    );

    const updatedPayment = await db.query.payments.findFirst({
      where: eq(payments.id, payment.id),
    });

    return {
      id: updatedPayment?.stripeRefundId || payment.id,
      paymentId: payment.id,
      amount: paymentAmount,
      status: updatedPayment?.status || 'refunded',
      reason: refundDto.reason,
      createdAt: (updatedPayment?.refundedAt || new Date()).toISOString(),
    };
  }

  async getPaymentRefunds(userId: string, paymentId: string): Promise<any[]> {
    await this.findStudentPayment(userId, paymentId);

    const refunds = await db.query.paymentTransactions.findMany({
      where: and(
        eq(paymentTransactions.paymentId, paymentId),
        eq(paymentTransactions.type, 'refund'),
      ),
      orderBy: (transactions, { desc }) => [desc(transactions.createdAt)],
    });

    return refunds.map((refund) => this.formatRefundTransaction(refund));
  }

  async getRefund(
    userId: string,
    paymentId: string,
    refundId: string,
  ): Promise<any> {
    await this.findStudentPayment(userId, paymentId);

    const idCondition = this.isUuid(refundId)
      ? or(
          eq(paymentTransactions.id, refundId),
          eq(paymentTransactions.stripeRefundId, refundId),
        )
      : eq(paymentTransactions.stripeRefundId, refundId);

    const refund = await db.query.paymentTransactions.findFirst({
      where: and(
        eq(paymentTransactions.paymentId, paymentId),
        eq(paymentTransactions.type, 'refund'),
        idCondition,
      ),
    });

    if (!refund) {
      throw new NotFoundException('Reembolso não encontrado');
    }

    return this.formatRefundTransaction(refund);
  }

  async getUserRefunds(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<any[]> {
    const refunds = await db.query.paymentTransactions.findMany({
      where: and(
        eq(paymentTransactions.userId, userId),
        eq(paymentTransactions.type, 'refund'),
      ),
      limit,
      offset,
      orderBy: [desc(paymentTransactions.createdAt)],
    });

    return refunds.map((refund) => this.formatRefundTransaction(refund));
  }

  private async findStudentPayment(userId: string, paymentId: string) {
    const payment = await db.query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.studentId, userId)),
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    if (payment.provider && payment.provider !== 'stripe') {
      throw new BadRequestException(
        'Pagamentos legados não podem ser reembolsados após o cutover Stripe',
      );
    }

    return payment;
  }

  private formatRefundTransaction(refund: any) {
    return {
      id: refund.stripeRefundId || refund.id,
      paymentId: refund.paymentId,
      amount: parseFloat(refund.amount),
      status: refund.status,
      reason: refund.description,
      createdAt: refund.createdAt,
      updatedAt: refund.processedAt || refund.createdAt,
    };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
