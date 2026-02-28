import { Injectable, Logger, Inject } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { InAppNotificationService } from './services/in-app-notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { FirebaseNotificationService } from './services/firebase-notification.service';
import { users, userPushTokens } from '../../database/schema';
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
    private readonly firebaseNotificationService: FirebaseNotificationService,
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

  async sendDirectPushNotification(
    userId: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
  ): Promise<{ delivered: boolean; reason?: string }> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`Usuário não encontrado: ${userId}`);
      }

      if (!this.firebaseNotificationService.isConfigured()) {
        const reason = 'Firebase Admin não configurado no backend';
        await this.saveNotificationRecord(
          userId,
          'push',
          'manual-test',
          { title, body, ...data },
          'skipped',
          reason,
        );
        this.logger.warn(`⚠️ Push de teste não entregue para ${userId}: ${reason}`);
        return { delivered: false, reason };
      }

      const tokens = await this.getUserPushTokens(userId);
      if (tokens.length === 0) {
        const reason = 'Usuário sem token FCM salvo (users.fcmToken/user_push_tokens)';
        await this.saveNotificationRecord(
          userId,
          'push',
          'manual-test',
          { title, body, ...data },
          'skipped',
          reason,
        );
        this.logger.warn(`⚠️ Push de teste não entregue para ${userId}: ${reason}`);
        return { delivered: false, reason };
      }

      const response = await this.firebaseNotificationService.sendToUser(userId, {
        title,
        body,
        data: this.normalizePushData(data),
      });

      const delivered = Boolean(response);
      const reason = delivered
        ? undefined
        : 'Envio FCM retornou sem messageId (verificar logs de erro do Firebase)';
      await this.saveNotificationRecord(
        userId,
        'push',
        'manual-test',
        { title, body, ...data },
        delivered ? 'sent' : 'skipped',
        reason,
      );

      if (!delivered) {
        this.logger.warn(
          `⚠️ Push de teste não entregue para usuário ${userId}: ${reason}`,
        );
      }

      return { delivered, reason };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro inesperado';
      this.logger.error(
        `❌ Erro ao enviar push de teste para usuário ${userId}:`,
        error,
      );
      await this.saveNotificationRecord(
        userId,
        'push',
        'manual-test',
        { title, body, ...data },
        'failed',
        errorMessage,
      );
      throw error;
    }
  }

  async sendDirectPushNotificationToAllUsers(
    title: string,
    body: string,
    data: Record<string, any> = {},
  ): Promise<{
    totalUsers: number;
    deliveredUsers: number;
    skippedUsers: number;
    failedUsers: number;
  }> {
    const usersList = await this.db.select({ id: users.id }).from(users);

    if (!usersList.length) {
      return {
        totalUsers: 0,
        deliveredUsers: 0,
        skippedUsers: 0,
        failedUsers: 0,
      };
    }

    const normalizedData = this.normalizePushData(data);
    const userIds = usersList.map((user) => user.id as string).filter(Boolean);

    let deliveredUsers = 0;
    let skippedUsers = 0;
    let failedUsers = 0;

    const batchSize = 50;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((userId) =>
          this.firebaseNotificationService.sendToUser(userId, {
            title,
            body,
            data: normalizedData,
          }),
        ),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          failedUsers += 1;
          continue;
        }

        if (result.value) {
          deliveredUsers += 1;
        } else {
          skippedUsers += 1;
        }
      }
    }

    this.logger.log(
      `📣 Broadcast push concluído. Total: ${userIds.length}, Entregues: ${deliveredUsers}, Sem token/Firebase: ${skippedUsers}, Falhas: ${failedUsers}`,
    );

    return {
      totalUsers: userIds.length,
      deliveredUsers,
      skippedUsers,
      failedUsers,
    };
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

      case 'dispute-created':
        await this.inAppService.createDisputeCreatedNotification(userId, data);
        break;

      case 'payment-received':
        await this.inAppService.createPaymentReceivedNotification(userId, data);
        break;

      case 'mission-completed':
        await this.inAppService.createMissionCompletedNotification(
          userId,
          data,
        );
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
      // 1. Buscar tokens da tabela multi-device (user_push_tokens)
      const multiTokens = await this.db
        .select({ token: userPushTokens.token })
        .from(userPushTokens)
        .where(eq(userPushTokens.userId, userId));

      if (multiTokens.length > 0) {
        const tokens = multiTokens
          .map((t) => t.token)
          .filter((token): token is string => Boolean(token));

        if (tokens.length > 0) {
          this.logger.debug(
            `📱 Encontrados ${tokens.length} tokens multi-device para usuário ${userId}`,
          );
          return Array.from(new Set<string>(tokens));
        }
      }

      // 2. Fallback: token legado na tabela users
      const [user] = await this.db
        .select({ fcmToken: users.fcmToken })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user?.fcmToken) {
        this.logger.debug(
          `📱 Usando token legado (users.fcmToken) para usuário ${userId}`,
        );
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

      // 1. Buscar da tabela multi-device (com userId para saber quem já tem)
      const multiTokenRows = await this.db
        .select({ token: userPushTokens.token, userId: userPushTokens.userId })
        .from(userPushTokens)
        .where(inArray(userPushTokens.userId, userIds));

      const tokensFromMulti: string[] = multiTokenRows
        .map((t) => t.token)
        .filter((token): token is string => Boolean(token));

      // IDs de usuários que já têm tokens na tabela multi-device
      const usersWithMultiTokenIds = new Set<string>(
        multiTokenRows.map((t) => t.userId as string),
      );

      // 2. Buscar tokens legados APENAS de usuários SEM tokens multi-device
      const usersNeedingLegacy = userIds.filter(
        (id) => !usersWithMultiTokenIds.has(id),
      );

      let tokensFromLegacy: string[] = [];
      if (usersNeedingLegacy.length > 0) {
        const legacyRows = await this.db
          .select({ fcmToken: users.fcmToken })
          .from(users)
          .where(
            and(
              inArray(users.id, usersNeedingLegacy),
              sql`${users.fcmToken} IS NOT NULL`,
            ),
          );

        tokensFromLegacy = legacyRows
          .map((user) => user.fcmToken)
          .filter((token): token is string => Boolean(token));
      }

      // Combinar e deduplicar
      const allTokens = Array.from(
        new Set<string>([...tokensFromMulti, ...tokensFromLegacy]),
      );

      this.logger.log(
        `📱 Encontrados ${allTokens.length} tokens FCM de ${userIds.length} usuários (${tokensFromMulti.length} multi-device, ${tokensFromLegacy.length} legado)`,
      );

      return allTokens;
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

  private normalizePushData(data: Record<string, any>): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        normalized[key] = String(value);
      }
    }

    return normalized;
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
