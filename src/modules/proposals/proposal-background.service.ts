import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { proposals } from '../../database/schema';
import { isProposalExpired } from './proposals.utils';
import { eq, and, lt } from 'drizzle-orm';
import { ProposalStatus } from './dto/proposals.dto';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class ProposalBackgroundService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProposalBackgroundService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly chatGateway: ChatGateway,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 [BACKGROUND] Iniciando serviço de verificação contínua de propostas...');
    this.startBackgroundCleanup();
  }

  async onModuleDestroy() {
    this.logger.log('🛑 [BACKGROUND] Parando serviço de verificação contínua...');
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
    this.logger.log('🔄 [BACKGROUND] Iniciando verificação contínua (intervalo: 30s)');

    this.intervalId = setInterval(async () => {
      try {
        await this.cleanupExpiredProposals();
      } catch (error) {
        this.logger.error('❌ [BACKGROUND] Erro na verificação contínua:', error);
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
            lt(proposals.trainingDate, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
          )
        );

      const expiredProposals = candidates.filter((p: any) => isProposalExpired(now, p));

      if (expiredProposals.length === 0) {
        return; // Nenhuma proposta expirada
      }

      this.logger.log(`🧹 [BACKGROUND] Encontradas ${expiredProposals.length} propostas expiradas (horário do treino já passou)`);

      // Deletar propostas expiradas
      for (const proposal of expiredProposals) {
        await this.db
          .delete(proposals)
          .where(eq(proposals.id, proposal.id));

        this.logger.log(`🗑️ [BACKGROUND] Proposta ${proposal.id} deletada (horário do treino expirado)`);

        // Notificar via WebSocket de forma assíncrona
        this.notifyProposalExpired(proposal);
      }

      this.logger.log(`✅ [BACKGROUND] Limpeza concluída: ${expiredProposals.length} propostas removidas`);

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
      // Emitir evento para todos os usuários conectados
      this.chatGateway.server.emit('proposal_expired', {
        action: 'proposal_expired',
        proposalId: proposal.id,
        studentId: proposal.studentId,
        location: proposal.locationName,
        trainingDate: proposal.trainingDate,
        trainingTime: proposal.trainingTime,
        reason: 'Horário de início expirado sem match',
        timestamp: new Date(),
      });

      this.logger.log(`📡 [BACKGROUND] Notificação de expiração enviada para proposta ${proposal.id}`);
    } catch (error) {
      this.logger.error(`❌ [BACKGROUND] Erro ao notificar sobre proposta expirada ${proposal.id}:`, error);
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
