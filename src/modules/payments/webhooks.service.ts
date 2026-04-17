import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../database/connection';
import { payments } from '../../database/schema/payments';
import { proposals } from '../../database/schema/proposals';
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

      // Proteção contra replay attack: rejeitar webhooks com timestamp > 5 min
      const nowSeconds = Math.floor(Date.now() / 1000);
      const tsSeconds = parseInt(ts, 10);
      if (isNaN(tsSeconds) || Math.abs(nowSeconds - tsSeconds) > 300) {
        this.logger.error(
          `❌ [WEBHOOK] Timestamp fora da janela de 5 minutos (ts=${ts}, now=${nowSeconds})`,
        );
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

      // timingSafeEqual lança exceção se os buffers tiverem tamanhos diferentes,
      // o que causaria um crash por input malicioso. Validar comprimento antes.
      if (
        v1.length !== expectedHash.length ||
        !crypto.timingSafeEqual(
          Buffer.from(v1, 'hex'),
          Buffer.from(expectedHash, 'hex'),
        )
      ) {
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

  private resolveInternalStatusTransition(
    currentStatus: string | null | undefined,
    nextStatus: string,
  ): string {
    const current = String(currentStatus || '').toLowerCase();
    const next = String(nextStatus || '').toLowerCase();

    if (!current) return next;
    if (current === 'refunded' || current === 'cancelled') return current;
    if (current === 'captured' && next !== 'refunded') return current;
    if (current === 'authorized' && next === 'pending') return current;

    return next;
  }

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

      // O external_reference pode ser:
      // (a) o UUID de um registro em payments — tentativa legada
      // (b) o UUID de uma proposal — caso de checkout MP redirect (fallback)
      const byPaymentId = payment.external_reference
        ? await db.query.payments.findFirst({
            where: eq(payments.id, payment.external_reference),
          })
        : null;

      if (byPaymentId) {
        await db
          .update(payments)
          .set({ mpPaymentId: payment.id, updatedAt: new Date() })
          .where(eq(payments.id, byPaymentId.id));
        this.logger.log(
          `✅ [WEBHOOK] mpPaymentId vinculado ao registro de pagamento ${byPaymentId.id}`,
        );
        return;
      }

      // Tentar vincular pelo proposalId (checkout MP redirect)
      const byProposalId = payment.external_reference
        ? await db.query.payments.findFirst({
            where: eq(payments.proposalId, payment.external_reference),
          })
        : null;

      if (byProposalId) {
        await db
          .update(payments)
          .set({ mpPaymentId: payment.id, updatedAt: new Date() })
          .where(eq(payments.id, byProposalId.id));
        this.logger.log(
          `✅ [WEBHOOK] mpPaymentId vinculado via proposalId ao registro ${byProposalId.id}`,
        );
        return;
      }

      // Sem registro localizável — sem dados suficientes para criar com segurança.
      this.logger.warn(
        `⚠️ [WEBHOOK] Pagamento MP ${payment.id} não encontrado no banco — ignorando criação`,
      );
    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao criar pagamento:`, error);
      throw error;
    }
  }

  async handlePaymentUpdated(payment: any): Promise<void> {
    this.logger.log(`🔄 [WEBHOOK] Pagamento atualizado: ${payment.id}`);

    try {
      const mappedStatus = this.mapMercadoPagoStatus(
        payment.status,
      ) as PaymentStatus;

      // Buscar e atualizar dentro da mesma transação para minimizar race conditions.
      const handled = await db.transaction(async (tx) => {
        const existingPayment = await tx.query.payments.findFirst({
          where: eq(payments.mpPaymentId, payment.id),
        });

        if (!existingPayment) return null;

        const resolvedStatus = this.resolveInternalStatusTransition(
          existingPayment.status,
          mappedStatus,
        ) as PaymentStatus;

        await tx
          .update(payments)
          .set({ status: resolvedStatus, updatedAt: new Date() })
          .where(eq(payments.id, existingPayment.id));

        if (existingPayment.proposalId) {
          await tx
            .update(proposals)
            .set({ paymentStatus: resolvedStatus, updatedAt: new Date() })
            .where(eq(proposals.id, existingPayment.proposalId));
        }

        return { existingPayment, resolvedStatus };
      });

      if (handled) {
        this.logger.log(
          `✅ [WEBHOOK] Pagamento atualizado: ${payment.id} -> ${handled.resolvedStatus}`,
        );
        if (handled.existingPayment.proposalId) {
          this.logger.log(
            `✅ [WEBHOOK] Proposta ${handled.existingPayment.proposalId} paymentStatus sincronizado para ${handled.resolvedStatus} (via payment.updated)`,
          );
        }
        // Notificar personal trainer quando pagamento for aprovado/autorizado
        if (
          handled.existingPayment.classId &&
          (handled.resolvedStatus === 'authorized' ||
            handled.resolvedStatus === 'captured')
        ) {
          await this.notifyPersonalTrainer(
            handled.existingPayment.classId,
            'payment_approved',
          );
        }
        return;
      }

      // Fallback: Pagamento PIX de proposta sem registro em payments ainda.
      // ATENÇÃO: este caminho indica que o Bug 2 (INSERT após createPixPayment)
      // não funcionou corretamente. Logar como CRITICAL para investigação.
      if (payment.external_reference) {
        const proposal = await db.query.proposals.findFirst({
          where: eq(proposals.id, payment.external_reference),
        });

        if (proposal) {
          const resolvedStatus = this.resolveInternalStatusTransition(
            proposal.paymentStatus,
            mappedStatus,
          );

          this.logger.error(
            `🚨 [WEBHOOK] CRITICAL: pagamento MP ${payment.id} chegou via webhook mas não tem registro em payments (proposalId=${proposal.id}). Registro faltante deve ser investigado.`,
          );

          await db
            .update(proposals)
            .set({ paymentStatus: resolvedStatus, updatedAt: new Date() })
            .where(eq(proposals.id, proposal.id));

          this.logger.log(
            `✅ [WEBHOOK] Proposta ${proposal.id} paymentStatus atualizado para ${resolvedStatus} (via payment.updated fallback)`,
          );
          return;
        }
      }

      this.logger.warn(
        `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
      );
    } catch (error) {
      this.logger.error(`❌ [WEBHOOK] Erro ao atualizar pagamento:`, error);
      throw error;
    }
  }

  async handlePaymentApproved(payment: any): Promise<void> {
    this.logger.log(`✅ [WEBHOOK] Pagamento aprovado: ${payment.id}`);

    try {
      const mappedStatus = this.mapMercadoPagoStatus(
        payment.status,
      ) as PaymentStatus;

      // Buscar e atualizar dentro da mesma transação para minimizar race conditions.
      const handled = await db.transaction(async (tx) => {
        const existingPayment = await tx.query.payments.findFirst({
          where: eq(payments.mpPaymentId, payment.id),
        });

        if (!existingPayment) return null;

        const resolvedStatus = this.resolveInternalStatusTransition(
          existingPayment.status,
          mappedStatus,
        ) as PaymentStatus;

        await tx
          .update(payments)
          .set({ status: resolvedStatus, updatedAt: new Date() })
          .where(eq(payments.id, existingPayment.id));

        if (existingPayment.proposalId) {
          await tx
            .update(proposals)
            .set({ paymentStatus: resolvedStatus, updatedAt: new Date() })
            .where(eq(proposals.id, existingPayment.proposalId));
        }

        return { existingPayment, resolvedStatus };
      });

      if (handled) {
        this.logger.log(
          `✅ [WEBHOOK] Pagamento aprovado e mapeado para: ${handled.resolvedStatus}`,
        );

        if (handled.existingPayment.proposalId) {
          this.logger.log(
            `✅ [WEBHOOK] Proposta ${handled.existingPayment.proposalId} paymentStatus sincronizado para ${handled.resolvedStatus} (via payment.approved)`,
          );
        }

        if (handled.existingPayment.classId) {
          await this.notifyPersonalTrainer(
            handled.existingPayment.classId,
            'payment_approved',
          );
        }
        return;
      }

      // Fallback: Pagamento PIX de proposta sem registro em payments ainda.
      // ATENÇÃO: este caminho indica que o Bug 2 (INSERT após createPixPayment)
      // não funcionou corretamente. Logar como CRITICAL para investigação.
      if (payment.external_reference) {
        const proposal = await db.query.proposals.findFirst({
          where: eq(proposals.id, payment.external_reference),
        });

        if (proposal) {
          const resolvedStatus = this.resolveInternalStatusTransition(
            proposal.paymentStatus,
            mappedStatus,
          );

          this.logger.error(
            `🚨 [WEBHOOK] CRITICAL: pagamento MP ${payment.id} chegou via webhook mas não tem registro em payments (proposalId=${proposal.id}). Registro faltante deve ser investigado.`,
          );

          await db
            .update(proposals)
            .set({ paymentStatus: resolvedStatus, updatedAt: new Date() })
            .where(eq(proposals.id, proposal.id));

          this.logger.log(
            `✅ [WEBHOOK] Proposta ${proposal.id} paymentStatus atualizado para ${resolvedStatus} (via payment.approved fallback)`,
          );
          return;
        }
      }

      this.logger.warn(
        `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
      );
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
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.mpPaymentId, payment.id),
      });

      if (!existingPayment) {
        this.logger.warn(
          `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
        );
        return;
      }

      const resolvedStatus = this.resolveInternalStatusTransition(
        existingPayment.status,
        'cancelled',
      ) as PaymentStatus;

      await db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({ status: resolvedStatus, updatedAt: new Date() })
          .where(eq(payments.id, existingPayment.id));

        if (existingPayment.proposalId) {
          await tx
            .update(proposals)
            .set({ paymentStatus: resolvedStatus, updatedAt: new Date() })
            .where(eq(proposals.id, existingPayment.proposalId));
        }
      });

      this.logger.log(
        `✅ [WEBHOOK] Pagamento cancelado: ${payment.id} -> ${resolvedStatus}`,
      );

      if (existingPayment.proposalId) {
        this.logger.log(
          `✅ [WEBHOOK] Proposta ${existingPayment.proposalId} paymentStatus marcado como ${resolvedStatus}`,
        );
      }

      // Notificar personal trainer se for uma aula
      if (existingPayment.classId) {
        await this.notifyPersonalTrainer(
          existingPayment.classId,
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
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.mpPaymentId, payment.id),
      });

      if (!existingPayment) {
        this.logger.warn(
          `⚠️ [WEBHOOK] Pagamento não encontrado no banco: ${payment.id}`,
        );
        return;
      }

      const resolvedStatus = this.resolveInternalStatusTransition(
        existingPayment.status,
        'refunded',
      ) as PaymentStatus;

      await db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({ status: resolvedStatus, updatedAt: new Date() })
          .where(eq(payments.id, existingPayment.id));

        if (existingPayment.proposalId) {
          await tx
            .update(proposals)
            .set({ paymentStatus: resolvedStatus, updatedAt: new Date() })
            .where(eq(proposals.id, existingPayment.proposalId));
        }
      });

      this.logger.log(
        `✅ [WEBHOOK] Pagamento reembolsado: ${payment.id} -> ${resolvedStatus}`,
      );

      if (existingPayment.proposalId) {
        this.logger.log(
          `✅ [WEBHOOK] Proposta ${existingPayment.proposalId} paymentStatus marcado como ${resolvedStatus}`,
        );
      }

      // Notificar personal trainer se for uma aula
      if (existingPayment.classId) {
        await this.notifyPersonalTrainer(
          existingPayment.classId,
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
      approved: 'authorized', // Pago no MP, mas ainda em custódia até concluir a aula
      authorized: 'authorized',
      captured: 'captured', // Captura confirmada após autorização
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
