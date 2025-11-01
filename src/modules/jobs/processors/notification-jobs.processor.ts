import { Process, Processor } from '@nestjs/bull';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bull';
import { eq, and, or, gt, count } from 'drizzle-orm';
import { NotificationJobData } from '../jobs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { users, proposals, classes, messages } from '../../../database/schema';

@Processor('notification-jobs')
export class NotificationJobsProcessor {
  private readonly logger = new Logger(NotificationJobsProcessor.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Process('send-notification')
  async handleSendNotification(job: Job<NotificationJobData>): Promise<void> {
    const { userId, type, template, data, priority } = job.data;

    // Validar se userId é um UUID válido
    if (!userId || userId === '') {
      this.logger.error(
        `❌ Job de notificação recebido com userId vazio ou nulo`,
      );
      return;
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      this.logger.error(
        `❌ Job de notificação recebido com userId inválido: ${userId}`,
      );
      return;
    }

    this.logger.log(`📱 Enviando ${type} para usuário ${userId} (${template})`);

    try {
      switch (type) {
        case 'email':
          await this.notificationsService.sendEmail(userId, template, data);
          break;
        case 'push':
          await this.notificationsService.sendPushNotification(
            userId,
            template,
            data,
          );
          break;
        default:
          throw new Error(`Tipo de notificação não suportado: ${type}`);
      }

      this.logger.log(`✅ ${type} enviado com sucesso para usuário ${userId}`);
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar ${type} para usuário ${userId}:`,
        error,
      );
      throw error;
    }
  }

  @Process('daily-profile-reminder')
  async handleDailyProfileReminder(job: Job): Promise<void> {
    this.logger.log('📅 Processando lembretes diários de perfil');

    try {
      // Buscar usuários com perfil incompleto
      const incompleteUsers = await this.db
        .select()
        .from(users)
        .where(and(eq(users.isVerified, true), eq(users.profileImageId, null)));

      this.logger.log(
        `📋 Encontrados ${incompleteUsers.length} usuários com perfil incompleto`,
      );

      for (const user of incompleteUsers) {
        try {
          await this.notificationsService.sendEmail(
            user.id,
            'profile-reminder',
            {
              firstName: user.firstName,
              userType: user.userType,
              profileUrl: `${process.env.FRONTEND_URL}/profile`,
            },
          );

          // Também enviar push notification
          await this.notificationsService.sendPushNotification(
            user.id,
            'profile-reminder',
            {
              title: 'Complete seu perfil',
              body: 'Finalize seu perfil para receber mais propostas!',
            },
          );
        } catch (error) {
          this.logger.error(
            `❌ Erro ao enviar lembrete para usuário ${user.id}:`,
            error,
          );
        }
      }

      this.logger.log(
        `✅ Lembretes diários enviados para ${incompleteUsers.length} usuários`,
      );
    } catch (error) {
      this.logger.error(
        '❌ Erro no processamento de lembretes diários:',
        error,
      );
      throw error;
    }
  }

  @Process('weekly-activity-summary')
  async handleWeeklyActivitySummary(job: Job): Promise<void> {
    this.logger.log('📊 Processando resumos semanais de atividade');

    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Buscar usuários ativos (baseado na última atualização)
      const activeUsers = await this.db
        .select()
        .from(users)
        .where(
          and(eq(users.isVerified, true), gt(users.updatedAt, oneWeekAgo)),
        );

      this.logger.log(
        `📋 Processando resumo semanal para ${activeUsers.length} usuários ativos`,
      );

      for (const user of activeUsers) {
        try {
          // Buscar estatísticas da semana
          const weeklyStats = await this.getWeeklyStatsForUser(
            user.id,
            oneWeekAgo,
          );

          if (weeklyStats.hasActivity) {
            await this.notificationsService.sendEmail(
              user.id,
              'weekly-summary',
              {
                firstName: user.firstName,
                userType: user.userType,
                ...weeklyStats,
              },
            );
          }
        } catch (error) {
          this.logger.error(
            `❌ Erro ao processar resumo semanal para usuário ${user.id}:`,
            error,
          );
        }
      }

      this.logger.log(
        `✅ Resumos semanais processados para ${activeUsers.length} usuários`,
      );
    } catch (error) {
      this.logger.error('❌ Erro no processamento de resumos semanais:', error);
      throw error;
    }
  }

  @Process('payment-reminder')
  async handlePaymentReminder(
    job: Job<{ proposalId: string; reminderType: 'first' | 'final' }>,
  ): Promise<void> {
    const { proposalId, reminderType } = job.data;

    this.logger.log(
      `💳 Enviando lembrete de pagamento ${reminderType} para proposta ${proposalId}`,
    );

    try {
      // Buscar proposta e usuário
      const [proposal] = await this.db
        .select({
          id: proposals.id,
          studentId: proposals.studentId,
          locationName: proposals.locationName,
          price: proposals.price,
          paymentStatus: proposals.paymentStatus,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(proposals)
        .leftJoin(users, eq(proposals.studentId, users.id))
        .where(eq(proposals.id, proposalId))
        .limit(1);

      if (!proposal) {
        this.logger.warn(`⚠️ Proposta não encontrada: ${proposalId}`);
        return;
      }

      if (!proposal.studentId) {
        this.logger.warn(
          `⚠️ Proposta ${proposalId} não possui studentId válido`,
        );
        return;
      }

      if (proposal.paymentStatus !== 'pending') {
        this.logger.log(
          `✅ Proposta ${proposalId} já foi paga (status: ${proposal.paymentStatus})`,
        );
        return;
      }

      const template =
        reminderType === 'first'
          ? 'payment-reminder-first'
          : 'payment-reminder-final';
      const timeLeft = reminderType === 'first' ? '20 minutos' : '5 minutos';

      // Validar se studentId é um UUID válido
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(proposal.studentId)) {
        this.logger.error(
          `❌ Proposta ${proposalId} possui studentId inválido: ${proposal.studentId}`,
        );
        return;
      }

      await this.notificationsService.sendEmail(proposal.studentId, template, {
        firstName: proposal.firstName,
        proposalId: proposalId,
        location: proposal.locationName,
        price: proposal.price,
        timeLeft: timeLeft,
        paymentUrl: `${process.env.FRONTEND_URL}/proposals/${proposalId}/payment`,
      });

      // Push notification urgente
      await this.notificationsService.sendPushNotification(
        proposal.studentId,
        'payment-reminder',
        {
          title:
            reminderType === 'first'
              ? 'Finalize seu pagamento'
              : 'Pagamento expira em breve!',
          body: `Sua proposta expira em ${timeLeft}. Finalize agora!`,
          data: { proposalId, action: 'open_payment' },
        },
      );

      this.logger.log(
        `✅ Lembrete de pagamento ${reminderType} enviado para proposta ${proposalId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar lembrete de pagamento para proposta ${proposalId}:`,
        error,
      );
      throw error;
    }
  }

  private async getWeeklyStatsForUser(
    userId: string,
    since: Date,
  ): Promise<any> {
    try {
      // Buscar estatísticas da semana para o usuário
      const [proposalsCount, classesCount, messagesCount] = await Promise.all([
        this.db
          .select({ count: count() })
          .from(proposals)
          .where(
            and(
              eq(proposals.studentId, userId),
              gt(proposals.createdAt, since),
            ),
          ),
        this.db
          .select({ count: count() })
          .from(classes)
          .where(
            and(
              or(eq(classes.studentId, userId), eq(classes.personalId, userId)),
              gt(classes.createdAt, since),
            ),
          ),
        this.db
          .select({ count: count() })
          .from(messages)
          .where(
            and(eq(messages.senderId, userId), gt(messages.createdAt, since)),
          ),
      ]);

      const totalActivity =
        proposalsCount[0].count +
        classesCount[0].count +
        messagesCount[0].count;

      return {
        hasActivity: totalActivity > 0,
        proposalsCreated: proposalsCount[0].count,
        classesParticipated: classesCount[0].count,
        messagesSent: messagesCount[0].count,
        weekPeriod: {
          start: since.toLocaleDateString('pt-BR'),
          end: new Date().toLocaleDateString('pt-BR'),
        },
      };
    } catch (error) {
      this.logger.error(
        `❌ Erro ao buscar estatísticas semanais para usuário ${userId}:`,
        error,
      );
      return { hasActivity: false };
    }
  }
}
