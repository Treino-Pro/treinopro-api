import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { CrefValidationResult } from './interfaces/cref.interface';

export interface CrefValidationJobData {
  crefNumber: string;
  userType: 'personal' | 'student';
  retryCount?: number;
}

export interface CrefValidationJobResult {
  success: boolean;
  result?: CrefValidationResult;
  error?: string;
  retryCount: number;
}

@Injectable()
export class CrefQueueService {
  private readonly logger = new Logger(CrefQueueService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 segundos

  constructor(
    @InjectQueue('cref-validation') private crefQueue: Queue<CrefValidationJobData>,
  ) {
    this.setupQueueEventListeners();
  }

  /**
   * Adiciona uma validação CREF à fila
   */
  async addValidationJob(
    crefNumber: string,
    userType: 'personal' | 'student',
    priority: 'high' | 'normal' | 'low' = 'normal',
  ): Promise<Job<CrefValidationJobData>> {
    this.logger.log(`📋 [QUEUE] Adicionando validação CREF à fila: ${crefNumber}`);

    const job = await this.crefQueue.add(
      'validate-cref',
      {
        crefNumber,
        userType,
        retryCount: 0,
      },
      {
        priority: this.getPriorityValue(priority),
        delay: 0,
        attempts: this.MAX_RETRIES + 1,
        backoff: {
          type: 'exponential',
          delay: this.RETRY_DELAY,
        },
        removeOnComplete: 10, // Manter apenas os últimos 10 jobs completos
        removeOnFail: 5, // Manter apenas os últimos 5 jobs falhados
      },
    );

    this.logger.log(`✅ [QUEUE] Job ${job.id} adicionado à fila para CREF: ${crefNumber}`);
    return job;
  }


  /**
   * Configura os event listeners da fila
   */
  private setupQueueEventListeners(): void {
    // Event listeners
    this.crefQueue.on('completed', (job, result) => {
      this.logger.log(`✅ [QUEUE] Job ${job.id} completado: ${job.data.crefNumber}`);
    });

    this.crefQueue.on('failed', (job, err) => {
      this.logger.error(`❌ [QUEUE] Job ${job.id} falhou: ${job.data.crefNumber}`, err.message);
    });

    this.crefQueue.on('stalled', (job) => {
      this.logger.warn(`⚠️ [QUEUE] Job ${job.id} travado: ${job.data.crefNumber}`);
    });

    this.crefQueue.on('progress', (job, progress) => {
      this.logger.debug(`📊 [QUEUE] Job ${job.id} progresso: ${progress}%`);
    });
  }

  /**
   * Obtém estatísticas da fila
   */
  async getQueueStats(): Promise<any> {
    const waiting = await this.crefQueue.getWaiting();
    const active = await this.crefQueue.getActive();
    const completed = await this.crefQueue.getCompleted();
    const failed = await this.crefQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  /**
   * Limpa a fila
   */
  async clearQueue(): Promise<void> {
    await this.crefQueue.empty();
    this.logger.log('🧹 [QUEUE] Fila limpa');
  }

  /**
   * Pausa a fila
   */
  async pauseQueue(): Promise<void> {
    await this.crefQueue.pause();
    this.logger.log('⏸️ [QUEUE] Fila pausada');
  }

  /**
   * Resume a fila
   */
  async resumeQueue(): Promise<void> {
    await this.crefQueue.resume();
    this.logger.log('▶️ [QUEUE] Fila resumida');
  }

  /**
   * Obtém jobs por status
   */
  async getJobsByStatus(status: 'waiting' | 'active' | 'completed' | 'failed'): Promise<Job[]> {
    switch (status) {
      case 'waiting':
        return await this.crefQueue.getWaiting();
      case 'active':
        return await this.crefQueue.getActive();
      case 'completed':
        return await this.crefQueue.getCompleted();
      case 'failed':
        return await this.crefQueue.getFailed();
      default:
        return [];
    }
  }

  /**
   * Remove um job específico
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.crefQueue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`🗑️ [QUEUE] Job ${jobId} removido`);
    }
  }

  /**
   * Converte prioridade para valor numérico
   */
  private getPriorityValue(priority: 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'high':
        return 10;
      case 'normal':
        return 5;
      case 'low':
        return 1;
      default:
        return 5;
    }
  }
}
