import { Injectable, Logger, Inject } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { InAppNotificationService } from './services/in-app-notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { users } from '../../database/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

export interface NotificationData {
  userId: string;
  type: 'email' | 'in-app' | 'push';
  template: string;
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly emailService: EmailService,
    private readonly inAppService: InAppNotificationService,
    private readonly pushService: PushNotificationService,
  ) {}

  // ===== MÉTODOS PRINCIPAIS =====

  async sendEmail(
    userId: string,
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    try {
      // Buscar dados do usuário
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`Usuário não encontrado: ${userId}`);
      }

      // Enviar email
      await this.emailService.sendTemplateEmail(user.email, template, {
        ...data,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
      });

      // Salvar registro da notificação
      await this.saveNotificationRecord(
        userId,
        'email',
        template,
        data,
        'sent',
      );

      this.logger.log(
        `📧 Email enviado com sucesso para ${user.email} (${template})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar email para usuário ${userId}:`,
        error,
      );
      await this.saveNotificationRecord(
        userId,
        'email',
        template,
        data,
        'failed',
        error.message,
      );
      throw error;
    }
  }

  async sendEmailToAddress(
    email: string,
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    try {
      // Enviar email diretamente para o endereço fornecido
      await this.emailService.sendTemplateEmail(email, template, data);

      this.logger.log(
        `📧 Email enviado com sucesso para ${email} (${template})`,
      );
    } catch (error) {
      this.logger.error(`❌ Erro ao enviar email para ${email}:`, error);
      throw error;
    }
  }

  async sendInAppNotification(
    userId: string,
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    try {
      // Buscar dados do usuário
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`Usuário não encontrado: ${userId}`);
      }

      // Criar notificação in-app baseada no template
      await this.createInAppNotificationFromTemplate(userId, template, {
        ...data,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
      });

      // Salvar registro da notificação
      await this.saveNotificationRecord(
        userId,
        'in-app',
        template,
        data,
        'sent',
      );

      this.logger.log(
        `🔔 Notificação in-app criada para usuário ${userId} (${template})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao criar notificação in-app para usuário ${userId}:`,
        error,
      );
      await this.saveNotificationRecord(
        userId,
        'in-app',
        template,
        data,
        'failed',
        error.message,
      );
      throw error;
    }
  }

  async sendPushNotification(
    userId: string,
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    try {
      // Buscar dados do usuário e tokens de push
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`Usuário não encontrado: ${userId}`);
      }

      const pushTokens = await this.getUserPushTokens(userId);
      if (pushTokens.length === 0) {
        this.logger.warn(
          `⚠️ Usuário ${userId} não possui tokens de push notification`,
        );
        await this.saveNotificationRecord(
          userId,
          'push',
          template,
          data,
          'skipped',
          'No push tokens',
        );
        return;
      }

      // Enviar push notification
      await this.pushService.sendToTokens(pushTokens, template, {
        ...data,
        userId: userId,
        userType: user.userType,
      });

      // Salvar registro da notificação
      await this.saveNotificationRecord(userId, 'push', template, data, 'sent');

      this.logger.log(
        `📱 Push notification enviado com sucesso para usuário ${userId} (${template})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar push notification para usuário ${userId}:`,
        error,
      );
      await this.saveNotificationRecord(
        userId,
        'push',
        template,
        data,
        'failed',
        error.message,
      );
      throw error;
    }
  }

  // ===== MÉTODOS DE CONVENIÊNCIA =====

  async sendMultiChannelNotification(
    userId: string,
    template: string,
    data: Record<string, any>,
    channels: ('email' | 'in-app' | 'push')[] = ['in-app', 'push', 'email'],
  ): Promise<void> {
    const promises = channels.map((channel) => {
      switch (channel) {
        case 'email':
          return this.sendEmail(userId, template, data);
        case 'in-app':
          return this.sendInAppNotification(userId, template, data);
        case 'push':
          return this.sendPushNotification(userId, template, data);
      }
    });

    await Promise.allSettled(promises);
  }

  async sendBulkNotifications(
    notifications: NotificationData[],
  ): Promise<void> {
    const promises = notifications.map((notification) => {
      const { userId, type, template, data } = notification;

      switch (type) {
        case 'email':
          return this.sendEmail(userId, template, data);
        case 'in-app':
          return this.sendInAppNotification(userId, template, data);
        case 'push':
          return this.sendPushNotification(userId, template, data);
      }
    });

    await Promise.allSettled(promises);
    this.logger.log(
      `📬 ${notifications.length} notificações em lote processadas`,
    );
  }

  // ===== CRIAÇÃO DE NOTIFICAÇÕES IN-APP BASEADAS EM TEMPLATES =====

  private async createInAppNotificationFromTemplate(
    userId: string,
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    switch (template) {
      case 'proposal-match':
        await this.inAppService.createProposalMatchNotification(userId, data);
        break;

      case 'payment-confirmation':
        await this.inAppService.createPaymentConfirmationNotification(
          userId,
          data,
        );
        break;

      case 'class-reminder':
        await this.inAppService.createClassReminderNotification(userId, data);
        break;

      case 'class-started':
        await this.inAppService.createClassStartedNotification(userId, data);
        break;

      case 'refund-processed':
        await this.inAppService.createRefundNotification(userId, data);
        break;

      case 'rating-request':
        await this.inAppService.createRatingRequestNotification(userId, data);
        break;

      case 'profile-reminder':
        await this.inAppService.createProfileReminderNotification(userId);
        break;

      case 'payment-reminder':
        await this.inAppService.createPaymentReminderNotification(userId, data);
        break;

      case 'class-cancellation':
        await this.inAppService.createClassCancellationNotification(
          userId,
          data,
        );
        break;

      case 'new-message':
        await this.inAppService.createNewMessageNotification(userId, data);
        break;

      case 'dispute-update':
        await this.inAppService.createDisputeUpdateNotification(userId, data);
        break;

      default:
        // Template genérico
        await this.inAppService.createNotification(
          userId,
          'TreinoPro',
          data.message || 'Você tem uma nova notificação',
          'info',
          data,
        );
    }
  }

  // ===== TEMPLATES ESPECÍFICOS =====

  async sendProposalMatchNotification(
    personalId: string,
    proposalData: any,
  ): Promise<void> {
    await this.sendMultiChannelNotification(
      personalId,
      'proposal-match',
      {
        proposalId: proposalData.id,
        studentName: proposalData.studentName,
        location: proposalData.locationName,
        date: proposalData.trainingDate,
        time: proposalData.trainingTime,
        price: proposalData.price,
        modality: proposalData.modalityName,
      },
      ['in-app', 'push', 'email'],
    );
  }

  /**
   * Enviar notificação de nova proposta para personal trainer
   * Busca token FCM do banco e envia push notification
   */
  async sendProposalNotificationToPersonal(
    personalId: string,
    proposalData: {
      proposalId: string;
      studentName: string;
      location: string;
      time: string;
      date?: string;
      modality: string;
      price: number;
      expiresIn: number;
    },
  ): Promise<void> {
    try {
      // Buscar token FCM do banco
      const tokens = await this.getUserPushTokens(personalId);

      if (tokens.length === 0) {
        this.logger.warn(
          `⚠️ Personal ${personalId} não possui token FCM - notificação não enviada`,
        );
        return;
      }

      // Enviar push notification usando PushNotificationService
      await this.pushService.sendProposalMatchNotification(tokens, {
        id: proposalData.proposalId,
        studentName: proposalData.studentName,
        location: proposalData.location,
        time: proposalData.time,
        date: proposalData.date,
        modality: proposalData.modality,
        price: proposalData.price,
        expiresIn: proposalData.expiresIn,
      });

      // Também criar notificação in-app
      await this.sendInAppNotification(personalId, 'proposal-match', {
        proposalId: proposalData.proposalId,
        studentName: proposalData.studentName,
        location: proposalData.location,
        date: proposalData.date,
        time: proposalData.time,
        price: proposalData.price,
        modality: proposalData.modality,
      });

      this.logger.log(
        `✅ Notificação de proposta enviada para personal ${personalId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar notificação de proposta para personal ${personalId}:`,
        error,
      );
      throw error;
    }
  }

  async sendPaymentConfirmationNotification(
    userId: string,
    paymentData: any,
  ): Promise<void> {
    await this.sendMultiChannelNotification(
      userId,
      'payment-confirmation',
      {
        paymentId: paymentData.id,
        amount: paymentData.totalAmount,
        method: paymentData.method,
        classDate: paymentData.classDate,
        location: paymentData.location,
      },
      ['in-app', 'push', 'email'],
    );
  }

  async sendClassReminderNotification(
    userId: string,
    classData: any,
  ): Promise<void> {
    await this.sendMultiChannelNotification(
      userId,
      'class-reminder',
      {
        classId: classData.id,
        date: classData.date,
        time: classData.time,
        location: classData.location,
        partnerName: classData.partnerName, // Nome do aluno ou personal
      },
      ['in-app', 'push'],
    );
  }

  async sendClassCancellationNotification(
    userId: string,
    classData: any,
    reason: string,
  ): Promise<void> {
    await this.sendMultiChannelNotification(
      userId,
      'class-cancellation',
      {
        classId: classData.id,
        date: classData.date,
        time: classData.time,
        location: classData.location,
        partnerName: classData.partnerName,
        reason: reason,
        refundInfo: classData.refundInfo,
      },
      ['in-app', 'push', 'email'],
    );
  }

  async sendRefundNotification(userId: string, refundData: any): Promise<void> {
    await this.sendMultiChannelNotification(
      userId,
      'refund-processed',
      {
        refundId: refundData.id,
        amount: refundData.amount,
        reason: refundData.reason,
        estimatedDays: refundData.estimatedDays || 5,
      },
      ['in-app', 'push', 'email'],
    );
  }

  // ===== MÉTODOS AUXILIARES =====

  private async getUserById(userId: string): Promise<any> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user;
  }

  private async getUserPushTokens(userId: string): Promise<string[]> {
    try {
      const [user] = await this.db
        .select({
          fcmToken: users.fcmToken,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Retornar array com token se existir, ou array vazio
      if (user?.fcmToken) {
        return [user.fcmToken];
      }

      this.logger.warn(
        `⚠️ Usuário ${userId} não possui token FCM no banco de dados`,
      );
      return [];
    } catch (error) {
      this.logger.error(
        `❌ Erro ao buscar token FCM do usuário ${userId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Buscar tokens FCM de múltiplos usuários
   * Útil para enviar notificações em massa (ex: proposta para vários personais)
   */
  async getUsersPushTokens(userIds: string[]): Promise<string[]> {
    try {
      if (userIds.length === 0) {
        return [];
      }

      const usersWithTokens = await this.db
        .select({
          fcmToken: users.fcmToken,
        })
        .from(users)
        .where(
          and(
            inArray(users.id, userIds),
            sql`${users.fcmToken} IS NOT NULL`,
          ),
        );

      const tokens = usersWithTokens
        .map((user) => user.fcmToken)
        .filter((token): token is string => Boolean(token));

      this.logger.log(
        `📱 Encontrados ${tokens.length} tokens FCM de ${userIds.length} usuários`,
      );

      return tokens;
    } catch (error) {
      this.logger.error(
        `❌ Erro ao buscar tokens FCM de múltiplos usuários:`,
        error,
      );
      return [];
    }
  }

  // ===== MÉTODOS ESPECÍFICOS PARA IN-APP =====

  async getUserNotifications(
    userId: string,
    limit: number = 50,
  ): Promise<any[]> {
    return this.inAppService.getUserNotifications(userId, limit);
  }

  async getUnreadNotifications(userId: string): Promise<any[]> {
    return this.inAppService.getUnreadNotifications(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.inAppService.getUnreadCount(userId);
  }

  async markNotificationAsRead(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    return this.inAppService.markAsRead(notificationId, userId);
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    return this.inAppService.markAllAsRead(userId);
  }

  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    return this.inAppService.deleteNotification(notificationId, userId);
  }

  private async saveNotificationRecord(
    userId: string,
    type: string,
    template: string,
    data: Record<string, any>,
    status: 'sent' | 'failed' | 'skipped',
    error?: string,
  ): Promise<void> {
    try {
      // TODO: Implementar tabela de notifications para histórico
      // await this.db.insert(notifications).values({
      //   userId,
      //   type,
      //   template,
      //   data: JSON.stringify(data),
      //   status,
      //   error,
      //   createdAt: new Date(),
      // });

      this.logger.debug(
        `📝 Registro de notificação salvo: ${userId} - ${type} - ${template} - ${status}`,
      );
    } catch (error) {
      this.logger.error('❌ Erro ao salvar registro de notificação:', error);
    }
  }

  // ===== PREFERÊNCIAS DE NOTIFICAÇÃO =====

  async getUserNotificationPreferences(userId: string): Promise<any> {
    // TODO: Implementar tabela de preferências
    return {
      email: true,
      push: true,
      sms: false,
      marketing: false,
      reminders: true,
      proposals: true,
      payments: true,
      classes: true,
    };
  }

  async updateUserNotificationPreferences(
    userId: string,
    preferences: any,
  ): Promise<void> {
    // TODO: Implementar atualização de preferências
    this.logger.log(
      `⚙️ Preferências de notificação atualizadas para usuário ${userId}`,
    );
  }

  // ===== ESTATÍSTICAS =====

  async getNotificationStats(userId?: string): Promise<any> {
    // TODO: Implementar estatísticas baseadas na tabela de notifications
    return {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      byType: {
        email: 0,
        push: 0,
        sms: 0,
      },
      byTemplate: {},
    };
  }
}
