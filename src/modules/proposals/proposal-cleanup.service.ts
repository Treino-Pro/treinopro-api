import { Injectable, Logger, Inject } from '@nestjs/common';
import { proposals } from '../../database/schema';
import { eq, and, lt } from 'drizzle-orm';
import { isProposalExpired } from './proposals.utils';
import { ProposalStatus } from './dto/proposals.dto';
import { ChatGateway } from '../chat/chat.gateway';
import { LiveActivityNotificationService } from '../notifications/services/live-activity-notification.service';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class ProposalCleanupService {
  private readonly logger = new Logger(ProposalCleanupService.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly chatGateway: ChatGateway,
    private readonly liveActivityNotificationService: LiveActivityNotificationService,
    private readonly jobsService: JobsService,
  ) {}

  /**
   * Executa limpeza de propostas expiradas em tempo real
   * Verifica propostas que passaram do horário de início sem match
   */
  async cleanupExpiredProposals() {
    try {
      this.logger.log(
        '🧹 [CLEANUP] Iniciando limpeza de propostas expiradas...',
      );

      const now = new Date();

      // Buscar propostas do passado/hoje (com possível horário já expirado)
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

      // Combinar trainingDate + trainingTime em memória para validar expiração precisa
      const expiredProposals = candidates.filter((p: any) =>
        isProposalExpired(now, p),
      );

      this.logger.log(
        `🔍 [CLEANUP] Encontradas ${expiredProposals.length} propostas expiradas`,
      );

      if (expiredProposals.length === 0) {
        this.logger.log('✅ [CLEANUP] Nenhuma proposta expirada encontrada');
        return;
      }

      // Deletar propostas expiradas
      for (const proposal of expiredProposals) {
        await this.jobsService.cancelProposalExpirationJob(proposal.id);
        await this.db.delete(proposals).where(eq(proposals.id, proposal.id));

        this.logger.log(
          `🗑️ [CLEANUP] Proposta ${proposal.id} deletada (expirada)`,
        );

        // Notificar o aluno sobre a expiração via WebSocket
        await this.notifyStudentProposalExpired(proposal);

        // ✅ Encerrar Live Activities associadas a esta proposta
        try {
          await this.liveActivityNotificationService.endProposalActivities(
            proposal.id,
          );
        } catch (error) {
          this.logger.warn(
            `⚠️ [CLEANUP] Erro ao encerrar Live Activity para proposta ${proposal.id}: ${error?.message || error}`,
          );
        }
      }

      this.logger.log(
        `✅ [CLEANUP] Limpeza concluída: ${expiredProposals.length} propostas removidas`,
      );
    } catch (error) {
      this.logger.error('❌ [CLEANUP] Erro na limpeza de propostas:', error);
    }
  }

  /**
   * Notifica o aluno sobre proposta expirada via WebSocket
   */
  private async notifyStudentProposalExpired(proposal: any) {
    try {
      // Emitir evento para o aluno específico
      this.chatGateway.server.emit('proposal_expired', {
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
      });

      this.logger.log(
        `📡 [CLEANUP] Notificação de expiração enviada para aluno ${proposal.studentId}`,
      );
    } catch (error) {
      this.logger.error(
        '❌ [CLEANUP] Erro ao notificar aluno sobre expiração:',
        error,
      );
    }
  }

  /**
   * Limpeza manual de propostas expiradas (para testes)
   */
  async manualCleanup() {
    this.logger.log('🔧 [CLEANUP] Executando limpeza manual...');
    await this.cleanupExpiredProposals();
  }
}
