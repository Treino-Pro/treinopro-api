import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { proposals } from '../../database/schema';
import { isProposalExpired } from './proposals.utils';
import { eq, and, lt } from 'drizzle-orm';
import { ProposalStatus } from './dto/proposals.dto';
import { ChatGateway } from '../chat/chat.gateway';
import { ProposalsService } from './proposals.service';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class ProposalBackgroundService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProposalBackgroundService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly chatGateway: ChatGateway,
    private readonly proposalsService: ProposalsService,
    private readonly jobsService: JobsService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      '🚀 [BACKGROUND] Iniciando serviço de verificação contínua de propostas...',
    );
    this.startBackgroundCleanup();
  }

  async onModuleDestroy() {
    this.logger.log(
      '🛑 [BACKGROUND] Parando serviço de verificação contínua...',
    );
    this.stopBackgroundCleanup();
  }

  /**
   * Inicia a verificação contínua em background
   * Verifica a cada 30 segundos se há propostas expiradas
   */
  private startBackgroundCleanup() {
    if (this.isRunning) {
      this.logger.warn('⚠️ [BACKGROUND] Serviço já está rodando');
      return;
    }

    this.isRunning = true;
    this.logger.log(
      '🔄 [BACKGROUND] Iniciando verificação contínua (intervalo: 30s)',
    );

    this.intervalId = setInterval(async () => {
      try {
        await this.cleanupExpiredProposals();
      } catch (error) {
        this.logger.error(
          '❌ [BACKGROUND] Erro na verificação contínua:',
          error,
        );
      }
    }, 30000); // 30 segundos
  }

  /**
   * Para a verificação contínua
   */
  private stopBackgroundCleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.logger.log('✅ [BACKGROUND] Verificação contínua parada');
  }

  /**
   * Executa limpeza de propostas expiradas
   * Roda de forma assíncrona e independente
   * CORRIGIDO: Agora exclui apenas propostas cuja data/hora do treino já passou
   */
  async cleanupExpiredProposals(): Promise<void> {
    try {
      const now = new Date();

      // Buscar candidatas (até amanhã), depois combinar data + hora em memória
      const candidates = await this.db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.status, ProposalStatus.PENDING),
            lt(
              proposals.trainingDate,
              new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
            ),
          ),
        );

      const expiredProposals = candidates.filter((p: any) => {
        const isExpired = isProposalExpired(now, p);

        // Log específico para recontratações
        if (p.targetPersonalId && isExpired) {
          console.log(
            `⚠️ [BACKGROUND] ATENÇÃO: Proposta de recontratação sendo removida:`,
            {
              id: p.id,
              targetPersonalId: p.targetPersonalId,
              trainingDate: p.trainingDate,
              trainingTime: p.trainingTime,
              now: now.toISOString(),
            },
          );
        }

        return isExpired;
      });

      if (expiredProposals.length === 0) {
        return; // Nenhuma proposta expirada
      }

      this.logger.log(
        `🧹 [BACKGROUND] Encontradas ${expiredProposals.length} propostas expiradas (horário do treino já passou)`,
      );

      // Processar propostas expiradas (reembolso + deleção)
      for (const proposal of expiredProposals) {
        this.logger.log(
          `🔄 [BACKGROUND] Processando proposta expirada: ${proposal.id}`,
        );
        let shouldDeleteProposal = true;

        // Processar reembolso se houver pagamento
        if (
          proposal.paymentId &&
          !['refunded', 'refund_error', 'cancelled', 'canceled'].includes(
            String(proposal.paymentStatus || '').toLowerCase(),
          )
        ) {
          try {
            await this.proposalsService.processAutomaticRefund(
              proposal.id,
              proposal.paymentId,
              'Proposta expirada - reembolso automático',
            );
            this.logger.log(
              `💰 [BACKGROUND] Reembolso processado para proposta ${proposal.id}`,
            );
          } catch (error) {
            shouldDeleteProposal = false;
            this.logger.error(
              `❌ [BACKGROUND] Erro ao processar reembolso da proposta ${proposal.id}:`,
              error,
            );

            await this.db
              .update(proposals)
              .set({
                paymentStatus: 'refund_error',
                updatedAt: new Date(),
              })
              .where(eq(proposals.id, proposal.id));
          }
        }

        if (!shouldDeleteProposal) {
          this.logger.warn(
            `⚠️ [BACKGROUND] Proposta ${proposal.id} mantida no banco porque o reembolso falhou`,
          );
          continue;
        }

        await this.jobsService.cancelProposalExpirationJob(proposal.id);

        // Deletar proposta após processar reembolso
        await this.db.delete(proposals).where(eq(proposals.id, proposal.id));

        this.logger.log(
          `🗑️ [BACKGROUND] Proposta ${proposal.id} deletada (horário do treino expirado)`,
        );

        // Notificar via WebSocket de forma assíncrona
        this.notifyProposalExpired(proposal);
      }

      this.logger.log(
        `✅ [BACKGROUND] Limpeza concluída: ${expiredProposals.length} propostas removidas`,
      );
    } catch (error) {
      this.logger.error('❌ [BACKGROUND] Erro na limpeza de propostas:', error);
    }
  }

  /**
   * Notifica sobre proposta expirada via WebSocket
   * Executa de forma assíncrona
   */
  private async notifyProposalExpired(proposal: any) {
    try {
      const eventData = {
        action: 'proposal_expired',
        proposal: {
          id: proposal.id,
          studentId: proposal.studentId,
          locationName: proposal.locationName,
          trainingDate: proposal.trainingDate,
          trainingTime: proposal.trainingTime,
          status: 'expired',
        },
        proposalId: proposal.id,
        studentId: proposal.studentId,
        location: proposal.locationName,
        trainingDate: proposal.trainingDate,
        trainingTime: proposal.trainingTime,
        reason: 'Horário de início expirado sem match',
        timestamp: new Date(),
      };

      this.logger.log(
        `📡 [BACKGROUND] Emitindo evento proposal_expired para proposta ${proposal.id}`,
      );
      this.logger.log(
        `📡 [BACKGROUND] Dados do evento:`,
        JSON.stringify(eventData, null, 2),
      );

      // Verificar se o servidor WebSocket está disponível
      if (!this.chatGateway.server) {
        this.logger.error(
          '❌ [BACKGROUND] Servidor WebSocket não está disponível',
        );
        return;
      }

      // Emitir evento para todos os usuários conectados
      this.chatGateway.server.emit('proposal_expired', eventData);

      this.logger.log(
        `✅ [BACKGROUND] Notificação de expiração enviada para proposta ${proposal.id}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [BACKGROUND] Erro ao notificar sobre proposta expirada ${proposal.id}:`,
        error,
      );
    }
  }

  /**
   * Força uma limpeza manual (para testes ou chamadas diretas)
   */
  async forceCleanup(): Promise<void> {
    this.logger.log('🧹 [BACKGROUND] Executando limpeza forçada...');
    await this.cleanupExpiredProposals();
    this.logger.log('✅ [BACKGROUND] Limpeza forçada concluída');
  }

  /**
   * Retorna o status do serviço
   */
  getStatus(): { isRunning: boolean; interval: number } {
    return {
      isRunning: this.isRunning,
      interval: 30000, // 30 segundos
    };
  }
}
