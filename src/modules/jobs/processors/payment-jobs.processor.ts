import { Process, Processor } from '@nestjs/bull';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bull';
import { PaymentTimeoutJobData } from '../jobs.service';
import { PaymentsService } from '../../payments/payments.service';

@Processor('payment-jobs')
export class PaymentJobsProcessor {
  private readonly logger = new Logger(PaymentJobsProcessor.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Process('timeout-payment')
  async handlePaymentTimeout(job: Job<PaymentTimeoutJobData>): Promise<void> {
    const { paymentId, proposalId, classId, timeoutMinutes } = job.data;
    
    this.logger.log(`⏰ Processando timeout de pagamento: ${paymentId}`);

    try {
      // Buscar pagamento atual
      const payment = await this.paymentsService.getPayment(paymentId);

      if (!payment) {
        this.logger.warn(`⚠️ Pagamento não encontrado: ${paymentId}`);
        return;
      }

      // Verificar se ainda está pendente
      if (payment.status !== 'pending') {
        this.logger.log(`✅ Pagamento ${paymentId} já foi processado (status: ${payment.status})`);
        return;
      }

      // Processar timeout baseado no tipo
      if (proposalId) {
        await this.handleProposalPaymentTimeout(paymentId, proposalId);
      } else if (classId) {
        await this.handleClassPaymentTimeout(paymentId, classId);
      } else {
        await this.handleGenericPaymentTimeout(paymentId);
      }

      this.logger.log(`✅ Timeout do pagamento ${paymentId} processado com sucesso`);

    } catch (error) {
      this.logger.error(`❌ Erro ao processar timeout do pagamento ${paymentId}:`, error);
      throw error;
    }
  }

  @Process('capture-payment')
  async handlePaymentCapture(job: Job<{ paymentId: string; classId: string }>): Promise<void> {
    const { paymentId, classId } = job.data;
    
    this.logger.log(`💰 Processando captura de pagamento: ${paymentId} para aula ${classId}`);

    try {
      await this.paymentsService.capturePaymentAfterClass(classId, paymentId);
      this.logger.log(`✅ Pagamento ${paymentId} capturado com sucesso`);

    } catch (error) {
      this.logger.error(`❌ Erro ao capturar pagamento ${paymentId}:`, error);
      throw error;
    }
  }

  @Process('process-refund')
  async handleRefundProcessing(job: Job<{ paymentId: string; reason: string }>): Promise<void> {
    const { paymentId, reason } = job.data;
    
    this.logger.log(`💸 Processando reembolso: ${paymentId} - ${reason}`);

    try {
      await this.paymentsService.refundPayment(paymentId, reason);
      this.logger.log(`✅ Reembolso ${paymentId} processado com sucesso`);

    } catch (error) {
      this.logger.error(`❌ Erro ao processar reembolso ${paymentId}:`, error);
      throw error;
    }
  }

  @Process('sync-payment-status')
  async handlePaymentStatusSync(job: Job<{ paymentId: string }>): Promise<void> {
    const { paymentId } = job.data;
    
    this.logger.log(`🔄 Sincronizando status do pagamento: ${paymentId}`);

    try {
      // Buscar status atual no Mercado Pago
      const payment = await this.paymentsService.getPayment(paymentId);
      
      if (payment && payment.mpPaymentId) {
        const mpPayment = await this.paymentsService['mercadoPagoService'].getPayment(payment.mpPaymentId);
        
        if (mpPayment) {
          const newStatus = this.paymentsService['mercadoPagoService'].mapPaymentStatus(
            mpPayment.status,
            mpPayment.status_detail
          );

          if (newStatus !== payment.status) {
            await this.paymentsService.updatePaymentStatus(paymentId, newStatus, payment.mpPaymentId, mpPayment);
            this.logger.log(`🔄 Status atualizado: ${paymentId} -> ${newStatus}`);
          }
        }
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao sincronizar status do pagamento ${paymentId}:`, error);
      throw error;
    }
  }

  private async handleProposalPaymentTimeout(paymentId: string, proposalId: string): Promise<void> {
    this.logger.log(`📋 Processando timeout de pagamento de proposta: ${proposalId}`);

    try {
      // Cancelar proposta e processar reembolso
      await this.paymentsService.cancelPaymentBeforeClass(proposalId, 'Timeout de pagamento');
      
      // Atualizar status da proposta
      await this.db
        .update(this.db.proposals)
        .set({
          status: 'cancelled',
          paymentStatus: 'timeout',
          updatedAt: new Date(),
        })
        .where(eq(this.db.proposals.id, proposalId));

    } catch (error) {
      this.logger.error(`❌ Erro no timeout da proposta ${proposalId}:`, error);
      throw error;
    }
  }

  private async handleClassPaymentTimeout(paymentId: string, classId: string): Promise<void> {
    this.logger.log(`🏋️ Processando timeout de pagamento de aula: ${classId}`);

    try {
      // Cancelar pagamento da aula
      await this.paymentsService.cancelPaymentBeforeClass(classId, 'Timeout de pagamento da aula');

    } catch (error) {
      this.logger.error(`❌ Erro no timeout da aula ${classId}:`, error);
      throw error;
    }
  }

  private async handleGenericPaymentTimeout(paymentId: string): Promise<void> {
    this.logger.log(`💳 Processando timeout genérico de pagamento: ${paymentId}`);

    try {
      // Cancelar pagamento genérico
      await this.paymentsService.refundPayment(paymentId, 'Timeout de pagamento');

    } catch (error) {
      this.logger.error(`❌ Erro no timeout genérico ${paymentId}:`, error);
      throw error;
    }
  }
}
