import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { MercadoPagoService } from './mercadopago.service';
import { db } from '../../database/connection';
import { payments } from '../../database/schema/payments';
import { eq, and } from 'drizzle-orm';

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
  constructor(
    private readonly mercadoPagoService: MercadoPagoService,
    // usar conexão db exportada
  ) {}

  // Criar reembolso
  async createRefund(
    userId: string,
    refundDto: CreateRefundDto,
  ): Promise<RefundResponseDto> {
    try {
      console.log('💰 [REFUND] Criando reembolso...');
      console.log('🔍 [REFUND] User ID:', userId);
      console.log('🔍 [REFUND] Payment ID:', refundDto.paymentId);

      // Verificar se o pagamento existe e pertence ao usuário
      const payment = await db.query.payments.findFirst({
        where: and(
          eq(payments.id, refundDto.paymentId),
          eq(payments.studentId, userId),
        ),
      });

      if (!payment) {
        throw new NotFoundException('Pagamento não encontrado');
      }

      console.log('✅ [REFUND] Pagamento encontrado:', {
        id: payment.id,
        totalAmount: payment.totalAmount,
        status: payment.status,
        mpPaymentId: payment.mpPaymentId,
      });

      // Verificar se o pagamento pode ser reembolsado
      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        throw new BadRequestException('Pagamento não pode ser reembolsado');
      }

      // Criar reembolso no Mercado Pago
      const mpRefund = await this.mercadoPagoService.createRefund(
        payment.mpPaymentId,
        {
          amount: refundDto.amount,
          reason: refundDto.reason || 'Solicitação do cliente',
        },
      );

      console.log('✅ [REFUND] Reembolso criado no MP:', mpRefund.id);

      // Atualizar status do pagamento no banco
      await db
        .update(payments)
        .set({
          status: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      console.log('✅ [REFUND] Status do pagamento atualizado para refunded');

      return {
        id: mpRefund.id,
        paymentId: payment.id,
        amount: mpRefund.amount || parseFloat(payment.totalAmount),
        status: mpRefund.status,
        reason: refundDto.reason,
        createdAt: mpRefund.date_created,
      };
    } catch (error) {
      console.error('❌ [REFUND] Erro ao criar reembolso:', error);
      throw new BadRequestException(
        `Erro ao criar reembolso: ${error.message}`,
      );
    }
  }

  // Listar reembolsos de um pagamento
  async getPaymentRefunds(userId: string, paymentId: string): Promise<any[]> {
    try {
      console.log('📋 [REFUND] Listando reembolsos do pagamento...');
      console.log('🔍 [REFUND] User ID:', userId);
      console.log('🔍 [REFUND] Payment ID:', paymentId);

      // Verificar se o pagamento existe e pertence ao usuário
      const payment = await db.query.payments.findFirst({
        where: and(eq(payments.id, paymentId), eq(payments.studentId, userId)),
      });

      if (!payment) {
        throw new NotFoundException('Pagamento não encontrado');
      }

      // Buscar reembolsos no Mercado Pago
      const refunds = await this.mercadoPagoService.getPaymentRefunds(
        payment.mpPaymentId,
      );

      console.log('✅ [REFUND] Reembolsos encontrados:', refunds.length);

      return refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.date_created,
        updatedAt: refund.date_updated,
      }));
    } catch (error) {
      console.error('❌ [REFUND] Erro ao listar reembolsos:', error);
      throw new BadRequestException(
        `Erro ao listar reembolsos: ${error.message}`,
      );
    }
  }

  // Consultar reembolso específico
  async getRefund(
    userId: string,
    paymentId: string,
    refundId: string,
  ): Promise<any> {
    try {
      console.log('🔍 [REFUND] Consultando reembolso específico...');
      console.log('🔍 [REFUND] User ID:', userId);
      console.log('🔍 [REFUND] Payment ID:', paymentId);
      console.log('🔍 [REFUND] Refund ID:', refundId);

      // Verificar se o pagamento existe e pertence ao usuário
      const payment = await db.query.payments.findFirst({
        where: and(eq(payments.id, paymentId), eq(payments.studentId, userId)),
      });

      if (!payment) {
        throw new NotFoundException('Pagamento não encontrado');
      }

      // Buscar reembolso no Mercado Pago
      const refund = await this.mercadoPagoService.getRefund(
        payment.mpPaymentId,
        refundId,
      );

      console.log('✅ [REFUND] Reembolso encontrado:', refund.id);

      return {
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.date_created,
        updatedAt: refund.date_updated,
      };
    } catch (error) {
      console.error('❌ [REFUND] Erro ao consultar reembolso:', error);
      throw new BadRequestException(
        `Erro ao consultar reembolso: ${error.message}`,
      );
    }
  }

  // Listar todos os reembolsos do usuário
  async getUserRefunds(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<any[]> {
    try {
      console.log('📋 [REFUND] Listando reembolsos do usuário...');
      console.log('🔍 [REFUND] User ID:', userId);

      // Buscar pagamentos reembolsados do usuário
      const refundedPayments = await db.query.payments.findMany({
        where: and(
          eq(payments.studentId, userId),
          eq(payments.status, 'refunded'),
        ),
        limit,
        offset,
        orderBy: (payments, { desc }) => [desc(payments.updatedAt)],
      });

      console.log(
        '✅ [REFUND] Pagamentos reembolsados encontrados:',
        refundedPayments.length,
      );

      // Para cada pagamento, buscar os reembolsos
      const allRefunds = [];
      for (const payment of refundedPayments) {
        try {
          const refunds = await this.mercadoPagoService.getPaymentRefunds(
            payment.mpPaymentId,
          );
          allRefunds.push(
            ...refunds.map((refund) => ({
              id: refund.id,
              paymentId: payment.id,
              amount: refund.amount,
              status: refund.status,
              reason: refund.reason,
              createdAt: refund.date_created,
              updatedAt: refund.date_updated,
            })),
          );
        } catch (error) {
          console.error(
            '⚠️ [REFUND] Erro ao buscar reembolsos do pagamento:',
            payment.id,
            error,
          );
          // Continuar mesmo se falhar
        }
      }

      console.log(
        '✅ [REFUND] Total de reembolsos encontrados:',
        allRefunds.length,
      );

      return allRefunds;
    } catch (error) {
      console.error('❌ [REFUND] Erro ao listar reembolsos do usuário:', error);
      throw new BadRequestException(
        `Erro ao listar reembolsos: ${error.message}`,
      );
    }
  }
}
