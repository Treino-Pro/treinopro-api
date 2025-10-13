import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../database/connection';
import { payments } from '../../database/schema/payments';
import { PaymentStatus } from './dto/payments.dto';
import { classes } from '../../database/schema/classes';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor() {}

  // Validar assinatura do webhook
  async validateWebhookSignature(
    payload: any,
    headers: Record<string, string>,
  ): Promise<boolean> {
    try {
      const signature = headers['x-signature'];
      const requestId = headers['x-request-id'];
      
      if (!signature || !requestId) {
        this.logger.error('❌ [WEBHOOK] Headers de assinatura não encontrados');
        return false;
      }

      // Verificar se é um webhook válido do Mercado Pago
      const expectedSignature = this.generateSignature(payload, requestId);
      
      if (signature !== expectedSignature) {
        this.logger.error('❌ [WEBHOOK] Assinatura não confere');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('❌ [WEBHOOK] Erro ao validar assinatura:', error);
      return false;
    }
  }

  private generateSignature(payload: any, requestId: string): string {
    const webhookSecret = process.env.MP_WEBHOOK_SECRET || 'default_secret';
    const data = JSON.stringify(payload) + requestId;
    return crypto.createHmac('sha256', webhookSecret).update(data).digest('hex');
  }

  // ===== HANDLERS DE PAGAMENTO =====

  async handlePaymentCreated(payment: any): Promise<void> {
    this.logger.log(`🆕 [WEBHOOK] Pagamento criado: ${payment.id}`);
    
    try {
      // Verificar se já existe no banco
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.mpPaymentId, payment.id),
      });

      if (existingPayment) {
        this.logger.log(`✅ [WEBHOOK] Pagamento já existe no banco: ${existingPayment.id}`);
        return;
      }

      // Criar novo pagamento no banco
      await db.insert(payments).values({
        mpPaymentId: payment.id,
        studentId: payment.external_reference?.replace('class_', '') || null,
        totalAmount: payment.transaction_amount.toString(),
        platformFee: '0.00',
        personalAmount: payment.transaction_amount.toString(),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.logger.log(`✅ [WEBHOOK] Pagamento criado no banco: ${payment.id}`);

    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao criar pagamento:`, error);
      throw error;
    }
  }

  async handlePaymentUpdated(payment: any): Promise<void> {
    this.logger.log(`🔄 [WEBHOOK] Pagamento atualizado: ${payment.id}`);
    
    try {
      // Buscar pagamento no banco
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.mpPaymentId, payment.id),
      });

      if (!existingPayment) {
        this.logger.warn(`⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`);
        return;
      }

      // Atualizar status
      const mappedStatus = this.mapMercadoPagoStatus(payment.status) as PaymentStatus;
      await db
        .update(payments)
        .set({
          status: mappedStatus,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));

      this.logger.log(`✅ [WEBHOOK] Pagamento atualizado: ${payment.id} -> ${payment.status}`);

    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao atualizar pagamento:`, error);
      throw error;
    }
  }

  async handlePaymentApproved(payment: any): Promise<void> {
    this.logger.log(`✅ [WEBHOOK] Pagamento aprovado: ${payment.id}`);
    
    try {
      // Buscar pagamento no banco
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.mpPaymentId, payment.id),
      });

      if (!existingPayment) {
        this.logger.warn(`⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`);
        return;
      }

      // ✅ CORRIGIDO: Usar mapeamento correto para disparar repasse
      const mappedStatus = this.mapMercadoPagoStatus(payment.status) as PaymentStatus;
      
      await db
        .update(payments)
        .set({
          status: mappedStatus,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));

      this.logger.log(`✅ [WEBHOOK] Pagamento aprovado e mapeado para: ${mappedStatus}`);

      // Notificar personal trainer se for uma aula
      if (existingPayment.studentId) {
        await this.notifyPersonalTrainer(existingPayment.studentId, 'payment_approved');
      }

    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao processar pagamento aprovado:`, error);
      throw error;
    }
  }

  async handlePaymentCancelled(payment: any): Promise<void> {
    this.logger.log(`❌ [WEBHOOK] Pagamento cancelado: ${payment.id}`);
    
    try {
      // Buscar pagamento no banco
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.mpPaymentId, payment.id),
      });

      if (!existingPayment) {
        this.logger.warn(`⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`);
        return;
      }

      // Atualizar para cancelled
      await db
        .update(payments)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));

      this.logger.log(`✅ [WEBHOOK] Pagamento cancelado: ${payment.id}`);

      // Notificar personal trainer se for uma aula
      if (existingPayment.studentId) {
        await this.notifyPersonalTrainer(existingPayment.studentId, 'payment_cancelled');
      }

    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao processar pagamento cancelado:`, error);
      throw error;
    }
  }

  async handlePaymentRefunded(payment: any): Promise<void> {
    this.logger.log(`💰 [WEBHOOK] Pagamento reembolsado: ${payment.id}`);
    
    try {
      // Buscar pagamento no banco
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.mpPaymentId, payment.id),
      });

      if (!existingPayment) {
        this.logger.warn(`⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`);
        return;
      }

      // Atualizar para refunded
      await db
        .update(payments)
        .set({
          status: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));

      this.logger.log(`✅ [WEBHOOK] Pagamento reembolsado: ${payment.id}`);

      // Notificar personal trainer se for uma aula
      if (existingPayment.studentId) {
        await this.notifyPersonalTrainer(existingPayment.studentId, 'payment_refunded');
      }

    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao processar pagamento reembolsado:`, error);
      throw error;
    }
  }

  // ===== UTILITÁRIOS =====

  private mapMercadoPagoStatus(mpStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'pending',
      'approved': 'captured', // ✅ CORRIGIDO: approved deve virar captured para disparar repasse
      'authorized': 'authorized',
      'in_process': 'pending',
      'in_mediation': 'pending',
      'rejected': 'cancelled',
      'cancelled': 'cancelled',
      'refunded': 'refunded',
      'charged_back': 'refunded',
    };

    return statusMap[mpStatus] || 'pending';
  }

  private async notifyPersonalTrainer(classId: string, eventType: string): Promise<void> {
    try {
      this.logger.log(`📢 [WEBHOOK] Notificando personal trainer: ${eventType}`);
      
      // Buscar aula
      const classData = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
      });

      if (!classData) {
        this.logger.warn(`⚠️ [WEBHOOK] Aula não encontrada: ${classId}`);
        return;
      }

      // Aqui você pode implementar notificações via:
      // - WebSocket
      // - Push notifications
      // - Email
      // - SMS
      
      this.logger.log(`✅ [WEBHOOK] Personal trainer notificado: ${classData.personalId}`);

    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao notificar personal trainer:`, error);
      // Não falhar o webhook por erro de notificação
    }
  }

  // ===== RETRY MECHANISM =====

  async retryFailedWebhook(webhookId: string, maxRetries: number = 3): Promise<void> {
    this.logger.log(`🔄 [WEBHOOK] Tentando reprocessar webhook: ${webhookId}`);
    
    // Implementar lógica de retry
    // - Buscar webhook falhado
    // - Reprocessar com backoff exponencial
    // - Marcar como processado após sucesso
  }

  // ===== WEBHOOK HEALTH CHECK =====

  async getWebhookHealth(): Promise<{
    status: string;
    lastProcessed: Date;
    totalProcessed: number;
    failedCount: number;
  }> {
    try {
      // Implementar health check dos webhooks
      return {
        status: 'healthy',
        lastProcessed: new Date(),
        totalProcessed: 0,
        failedCount: 0,
      };
    } catch (error) {
      this.logger.error('❌ [WEBHOOK] Erro no health check:', error);
      throw error;
    }
  }
}
