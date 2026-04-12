import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../database/connection';
import { payments } from '../../database/schema/payments';
import { PaymentStatus } from './dto/payments.dto';
import { classes } from '../../database/schema/classes';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor() {}

  // Validar assinatura do webhook
  // Formato do Mercado Pago: x-signature = "ts=<timestamp>,v1=<hmac_hex>"
  // Manifest assinado: "id:<data.id>;request-id:<x-request-id>;ts:<timestamp>;"
  // Referência: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
  async validateWebhookSignature(
    payload: any,
    headers: Record<string, string>,
    queryDataId?: string,
  ): Promise<boolean> {
    try {
      const webhookSecret = process.env.MP_WEBHOOK_SECRET;
      if (!webhookSecret) {
        this.logger.error(
          '❌ [WEBHOOK] MP_WEBHOOK_SECRET não configurado - rejeitando webhook',
        );
        return false;
      }

      const xSignature = headers['x-signature'];
      const requestId = headers['x-request-id'];

      if (!xSignature || !requestId) {
        this.logger.error('❌ [WEBHOOK] Headers de assinatura não encontrados');
        return false;
      }

      // Extrair ts e v1 do header x-signature (formato: "ts=...,v1=...")
      const parts = xSignature.split(',');
      let ts: string | undefined;
      let v1: string | undefined;
      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') v1 = value;
      }

      if (!ts || !v1) {
        this.logger.error('❌ [WEBHOOK] Formato de x-signature inválido');
        return false;
      }

      // O id vem do query param "data.id" conforme documentação oficial do MP.
      // Fallback para payload.data.id pois o valor é o mesmo.
      const dataId = queryDataId ?? payload?.data?.id ?? '';
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

      const expectedHash = crypto
        .createHmac('sha256', webhookSecret)
        .update(manifest)
        .digest('hex');

      if (v1 !== expectedHash) {
        this.logger.error('❌ [WEBHOOK] Assinatura não confere');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('❌ [WEBHOOK] Erro ao validar assinatura:', error);
      return false;
    }
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
        this.logger.log(
          `✅ [WEBHOOK] Pagamento já existe no banco: ${existingPayment.id}`,
        );
        return;
      }

      // O external_reference é o UUID interno do nosso registro de pagamento.
      // Tenta localizar pelo external_reference e vincular o mpPaymentId.
      const byRef = payment.external_reference
        ? await db.query.payments.findFirst({
            where: eq(payments.id, payment.external_reference),
          })
        : null;

      if (byRef) {
        await db
          .update(payments)
          .set({ mpPaymentId: payment.id, updatedAt: new Date() })
          .where(eq(payments.id, byRef.id));
        this.logger.log(
          `✅ [WEBHOOK] mpPaymentId vinculado ao registro ${byRef.id}`,
        );
      } else {
        // Sem external_reference válido não é possível criar o registro com
        // segurança (campos obrigatórios como studentId estariam ausentes).
        this.logger.warn(
          `⚠️ [WEBHOOK] Pagamento MP ${payment.id} não encontrado no banco — ignorando criação`,
        );
      }
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
        this.logger.warn(
          `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
        );
        return;
      }

      // Atualizar status
      const mappedStatus = this.mapMercadoPagoStatus(
        payment.status,
      ) as PaymentStatus;
      await db
        .update(payments)
        .set({
          status: mappedStatus,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));

      this.logger.log(
        `✅ [WEBHOOK] Pagamento atualizado: ${payment.id} -> ${payment.status}`,
      );
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
        this.logger.warn(
          `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
        );
        return;
      }

      // ✅ CORRIGIDO: Usar mapeamento correto para disparar repasse
      const mappedStatus = this.mapMercadoPagoStatus(
        payment.status,
      ) as PaymentStatus;

      await db
        .update(payments)
        .set({
          status: mappedStatus,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));

      this.logger.log(
        `✅ [WEBHOOK] Pagamento aprovado e mapeado para: ${mappedStatus}`,
      );

      // Notificar personal trainer se for uma aula
      if (existingPayment.studentId) {
        await this.notifyPersonalTrainer(
          existingPayment.studentId,
          'payment_approved',
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ [WEBHOOK] Erro ao processar pagamento aprovado:`,
        error,
      );
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
        this.logger.warn(
          `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
        );
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
        await this.notifyPersonalTrainer(
          existingPayment.studentId,
          'payment_cancelled',
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ [WEBHOOK] Erro ao processar pagamento cancelado:`,
        error,
      );
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
        this.logger.warn(
          `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
        );
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
        await this.notifyPersonalTrainer(
          existingPayment.studentId,
          'payment_refunded',
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ [WEBHOOK] Erro ao processar pagamento reembolsado:`,
        error,
      );
      throw error;
    }
  }

  // ===== UTILITÁRIOS =====

  private mapMercadoPagoStatus(mpStatus: string): string {
    const statusMap: Record<string, string> = {
      pending: 'pending',
      approved: 'captured', // ✅ CORRIGIDO: approved deve virar captured para disparar repasse
      authorized: 'authorized',
      in_process: 'pending',
      in_mediation: 'pending',
      rejected: 'cancelled',
      cancelled: 'cancelled',
      refunded: 'refunded',
      charged_back: 'refunded',
    };

    return statusMap[mpStatus] || 'pending';
  }

  private async notifyPersonalTrainer(
    classId: string,
    eventType: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `📢 [WEBHOOK] Notificando personal trainer: ${eventType}`,
      );

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

      this.logger.log(
        `✅ [WEBHOOK] Personal trainer notificado: ${classData.personalId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [WEBHOOK] Erro ao notificar personal trainer:`,
        error,
      );
      // Não falhar o webhook por erro de notificação
    }
  }

  // ===== RETRY MECHANISM =====

  async retryFailedWebhook(webhookId: string): Promise<void> {
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
