import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface ProposalExpirationJobData {
  proposalId: string;
  studentId: string;
  createdAt: Date;
  expirationTime: number; // em minutos
}

export interface PaymentTimeoutJobData {
  paymentId: string;
  proposalId?: string;
  classId?: string;
  timeoutMinutes: number;
}

export interface NotificationJobData {
  userId: string;
  type: 'email' | 'push' | 'sms';
  template: string;
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue('proposal-jobs') private proposalQueue: Queue,
    @InjectQueue('payment-jobs') private paymentQueue: Queue,
    @InjectQueue('notification-jobs') private notificationQueue: Queue,
  ) {}

  // ===== JOBS DE PROPOSTAS =====

  async scheduleProposalExpiration(data: ProposalExpirationJobData): Promise<void> {
    const delay = data.expirationTime * 60 * 1000; // Converter minutos para ms
    
    await this.proposalQueue.add(
      'expire-proposal',
      data,
      {
        delay,
        jobId: `expire-proposal-${data.proposalId}`, // ID único para evitar duplicatas
      }
    );

    this.logger.log(`📅 Job agendado: Expirar proposta ${data.proposalId} em ${data.expirationTime} minutos`);
  }

  async cancelProposalExpirationJob(proposalId: string): Promise<void> {
    const jobId = `expire-proposal-${proposalId}`;
    const job = await this.proposalQueue.getJob(jobId);
    
    if (job) {
      await job.remove();
      this.logger.log(`❌ Job cancelado: Expiração da proposta ${proposalId}`);
    }
  }

  async scheduleProposalCleanup(): Promise<void> {
    // Executar limpeza de propostas expiradas a cada 15 minutos
    await this.proposalQueue.add(
      'cleanup-expired-proposals',
      {},
      {
        repeat: { cron: '*/15 * * * *' }, // A cada 15 minutos
        jobId: 'cleanup-expired-proposals', // Job único
      }
    );

    this.logger.log('📅 Job recorrente agendado: Limpeza de propostas expiradas a cada 15 minutos');
  }

  // ===== JOBS DE PAGAMENTOS =====

  async schedulePaymentTimeout(data: PaymentTimeoutJobData): Promise<void> {
    const delay = data.timeoutMinutes * 60 * 1000;
    
    await this.paymentQueue.add(
      'timeout-payment',
      data,
      {
        delay,
        jobId: `timeout-payment-${data.paymentId}`,
        priority: 1, // Alta prioridade para pagamentos
      }
    );

    this.logger.log(`💳 Job agendado: Timeout de pagamento ${data.paymentId} em ${data.timeoutMinutes} minutos`);
  }

  async cancelPaymentTimeoutJob(paymentId: string): Promise<void> {
    const jobId = `timeout-payment-${paymentId}`;
    const job = await this.paymentQueue.getJob(jobId);
    
    if (job) {
      await job.remove();
      this.logger.log(`❌ Job cancelado: Timeout do pagamento ${paymentId}`);
    }
  }

  async schedulePaymentCapture(paymentId: string, classId: string, delayMinutes: number = 0): Promise<void> {
    await this.paymentQueue.add(
      'capture-payment',
      { paymentId, classId },
      {
        delay: delayMinutes * 60 * 1000,
        jobId: `capture-payment-${paymentId}`,
        priority: 2, // Prioridade alta para captura
      }
    );

    this.logger.log(`💰 Job agendado: Capturar pagamento ${paymentId} para aula ${classId}`);
  }

  async scheduleRefundProcessing(paymentId: string, reason: string, delayMinutes: number = 0): Promise<void> {
    await this.paymentQueue.add(
      'process-refund',
      { paymentId, reason },
      {
        delay: delayMinutes * 60 * 1000,
        jobId: `refund-${paymentId}`,
        priority: 3, // Prioridade crítica para reembolsos
      }
    );

    this.logger.log(`💸 Job agendado: Processar reembolso ${paymentId} - ${reason}`);
  }

  // ===== JOBS DE NOTIFICAÇÕES =====

  async scheduleNotification(data: NotificationJobData, delayMinutes: number = 0): Promise<void> {
    const priority = this.getNotificationPriority(data.priority || 'normal');
    
    await this.notificationQueue.add(
      'send-notification',
      data,
      {
        delay: delayMinutes * 60 * 1000,
        priority,
      }
    );

    this.logger.log(`📱 Job agendado: Enviar ${data.type} para usuário ${data.userId} (${data.template})`);
  }

  async scheduleBulkNotifications(notifications: NotificationJobData[]): Promise<void> {
    const jobs = notifications.map(notification => ({
      name: 'send-notification',
      data: notification,
      opts: {
        priority: this.getNotificationPriority(notification.priority || 'normal'),
      },
    }));

    await this.notificationQueue.addBulk(jobs);
    this.logger.log(`📱 ${notifications.length} notificações em lote agendadas`);
  }

  async scheduleRecurringNotifications(): Promise<void> {
    // Lembrete diário para completar perfil
    await this.notificationQueue.add(
      'daily-profile-reminder',
      {},
      {
        repeat: { cron: '0 10 * * *' }, // Todo dia às 10h
        jobId: 'daily-profile-reminder',
      }
    );

    // Resumo semanal de atividades
    await this.notificationQueue.add(
      'weekly-activity-summary',
      {},
      {
        repeat: { cron: '0 9 * * 1' }, // Segunda-feira às 9h
        jobId: 'weekly-activity-summary',
      }
    );

    this.logger.log('📅 Jobs recorrentes de notificação configurados');
  }

  // ===== MÉTODOS AUXILIARES =====

  private getNotificationPriority(priority: string): number {
    const priorities = {
      low: 10,
      normal: 5,
      high: 1,
      critical: 0,
    };
    return priorities[priority] || 5;
  }

  // ===== MONITORAMENTO DE FILAS =====

  async getQueueStats(): Promise<any> {
    const [proposalStats, paymentStats, notificationStats] = await Promise.all([
      this.getQueueInfo(this.proposalQueue),
      this.getQueueInfo(this.paymentQueue),
      this.getQueueInfo(this.notificationQueue),
    ]);

    return {
      proposal: proposalStats,
      payment: paymentStats,
      notification: notificationStats,
      timestamp: new Date(),
    };
  }

  private async getQueueInfo(queue: Queue): Promise<any> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      name: queue.name,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  async clearAllQueues(): Promise<void> {
    await Promise.all([
      this.proposalQueue.empty(),
      this.paymentQueue.empty(),
      this.notificationQueue.empty(),
    ]);

    this.logger.warn('🧹 Todas as filas foram limpas');
  }

  async pauseAllQueues(): Promise<void> {
    await Promise.all([
      this.proposalQueue.pause(),
      this.paymentQueue.pause(),
      this.notificationQueue.pause(),
    ]);

    this.logger.warn('⏸️ Todas as filas foram pausadas');
  }

  async resumeAllQueues(): Promise<void> {
    await Promise.all([
      this.proposalQueue.resume(),
      this.paymentQueue.resume(),
      this.notificationQueue.resume(),
    ]);

    this.logger.log('▶️ Todas as filas foram retomadas');
  }
}
