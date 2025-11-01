import { Process, Processor } from '@nestjs/bull';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bull';
import { isProposalExpired } from '../../proposals/proposals.utils';
import { eq, and, lt } from 'drizzle-orm';
import { proposals } from '../../../database/schema';
import { ProposalExpirationJobData } from '../jobs.service';
import { PaymentsService } from '../../payments/payments.service';

@Processor('proposal-jobs')
export class ProposalJobsProcessor {
  private readonly logger = new Logger(ProposalJobsProcessor.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Process('expire-proposal')
  async handleProposalExpiration(
    job: Job<ProposalExpirationJobData>,
  ): Promise<void> {
    const { proposalId, studentId, createdAt, expirationTime } = job.data;

    this.logger.log(`⏰ Processando expiração da proposta: ${proposalId}`);

    try {
      // Buscar proposta atual
      const [proposal] = await this.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposalId))
        .limit(1);

      if (!proposal) {
        this.logger.warn(`⚠️ Proposta não encontrada: ${proposalId}`);
        return;
      }

      // Verificar se ainda está pendente
      if (proposal.status !== 'pending') {
        this.logger.log(
          `✅ Proposta ${proposalId} já foi processada (status: ${proposal.status})`,
        );
        return;
      }

      // Verificar se o pagamento ainda está pendente
      if (proposal.paymentStatus !== 'pending') {
        this.logger.log(
          `💳 Proposta ${proposalId} pagamento já processado (status: ${proposal.paymentStatus})`,
        );
        return;
      }

      // Cancelar proposta
      await this.db
        .update(proposals)
        .set({
          status: 'cancelled',
          paymentStatus: 'expired',
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      // Processar reembolso se necessário
      if (proposal.paymentId) {
        await this.processRefundForExpiredProposal(proposal);
      }

      this.logger.log(
        `✅ Proposta ${proposalId} expirada e processada com sucesso`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao processar expiração da proposta ${proposalId}:`,
        error,
      );
      throw error; // Re-throw para que o Bull tente novamente
    }
  }

  @Process('cleanup-expired-proposals')
  async handleExpiredProposalsCleanup(job: Job): Promise<void> {
    this.logger.log('🧹 Iniciando limpeza de propostas expiradas');

    try {
      const now = new Date();

      // Buscar candidatas (até amanhã) e validar expiração combinando data + hora
      const candidates = await this.db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.status, 'pending'),
            lt(
              proposals.trainingDate,
              new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
            ),
          ),
        );

      const expiredProposals = candidates.filter((p: any) =>
        isProposalExpired(now, p),
      );

      this.logger.log(
        `📋 Encontradas ${expiredProposals.length} propostas expiradas para limpeza`,
      );

      for (const proposal of expiredProposals) {
        try {
          // Marcar proposta como cancelada por expiração do horário
          await this.db
            .update(proposals)
            .set({
              status: 'cancelled',
              paymentStatus: 'expired',
              updatedAt: new Date(),
            })
            .where(eq(proposals.id, proposal.id));

          // Processar reembolso
          if (proposal.paymentId) {
            await this.processRefundForExpiredProposal(proposal);
          }

          this.logger.log(`✅ Proposta ${proposal.id} limpa com sucesso`);
        } catch (error) {
          this.logger.error(
            `❌ Erro ao limpar proposta ${proposal.id}:`,
            error,
          );

          // Marcar como erro para análise manual
          await this.db
            .update(proposals)
            .set({
              paymentStatus: 'cleanup_error',
              updatedAt: new Date(),
            })
            .where(eq(proposals.id, proposal.id));
        }
      }

      this.logger.log(
        `🧹 Limpeza concluída: ${expiredProposals.length} propostas processadas`,
      );
    } catch (error) {
      this.logger.error('❌ Erro na limpeza de propostas expiradas:', error);
      throw error;
    }
  }

  private async processRefundForExpiredProposal(proposal: any): Promise<void> {
    try {
      this.logger.log(
        `💸 Processando reembolso para proposta expirada: ${proposal.id}`,
      );

      // Verificar se é pagamento real ou simulado
      if (proposal.paymentId.startsWith('proposal_')) {
        // Pagamento real via Mercado Pago
        this.logger.log(
          `💳 Processando reembolso real via MP: ${proposal.paymentId}`,
        );

        try {
          // Buscar pagamento no sistema
          const payment = await this.findPaymentByExternalReference(
            proposal.paymentId,
          );

          if (payment) {
            await this.paymentsService.refundPayment(
              payment.id,
              'Proposta expirada automaticamente',
            );
          } else {
            this.logger.warn(
              `⚠️ Pagamento não encontrado no sistema: ${proposal.paymentId}`,
            );
          }
        } catch (error) {
          this.logger.error(`❌ Erro no reembolso MP: ${error.message}`);
        }
      } else {
        // Pagamento simulado - apenas log
        this.logger.log(
          `🎭 Simulando reembolso para pagamento mock: ${proposal.paymentId}`,
        );
      }

      // Atualizar status do pagamento
      await this.db
        .update(proposals)
        .set({
          paymentStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id));

      this.logger.log(`✅ Reembolso processado para proposta: ${proposal.id}`);
    } catch (error) {
      this.logger.error(
        `❌ Erro no reembolso da proposta ${proposal.id}:`,
        error,
      );

      // Marcar como erro de reembolso
      await this.db
        .update(proposals)
        .set({
          paymentStatus: 'refund_error',
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id));
    }
  }

  private async findPaymentByExternalReference(
    externalReference: string,
  ): Promise<any> {
    try {
      const payment = await this.db.query.payments?.findFirst({
        where: (payments: any) =>
          eq(payments.externalReference, externalReference),
      });

      return payment;
    } catch (error) {
      this.logger.warn(`⚠️ Erro ao buscar pagamento: ${error.message}`);
      return null;
    }
  }
}
