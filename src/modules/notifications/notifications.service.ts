import { Injectable, Logger, Inject } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { PushNotificationService } from './services/push-notification.service';
import { SMSService } from './services/sms.service';
import { users } from '../../database/schema';
import { eq } from 'drizzle-orm';

export interface NotificationData {
  userId: string;
  type: 'email' | 'push' | 'sms';
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
    private readonly pushService: PushNotificationService,
    private readonly smsService: SMSService,
  ) {}

  // ===== MÉTODOS PRINCIPAIS =====

  async sendEmail(userId: string, template: string, data: Record<string, any>): Promise<void> {
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
      await this.saveNotificationRecord(userId, 'email', template, data, 'sent');

      this.logger.log(`📧 Email enviado com sucesso para ${user.email} (${template})`);

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar email para usuário ${userId}:`, error);
      await this.saveNotificationRecord(userId, 'email', template, data, 'failed', error.message);
      throw error;
    }
  }

  async sendPushNotification(userId: string, template: string, data: Record<string, any>): Promise<void> {
    try {
      // Buscar dados do usuário e tokens de push
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`Usuário não encontrado: ${userId}`);
      }

      const pushTokens = await this.getUserPushTokens(userId);
      if (pushTokens.length === 0) {
        this.logger.warn(`⚠️ Usuário ${userId} não possui tokens de push notification`);
        await this.saveNotificationRecord(userId, 'push', template, data, 'skipped', 'No push tokens');
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

      this.logger.log(`📱 Push notification enviado com sucesso para usuário ${userId} (${template})`);

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar push notification para usuário ${userId}:`, error);
      await this.saveNotificationRecord(userId, 'push', template, data, 'failed', error.message);
      throw error;
    }
  }

  async sendSMS(userId: string, template: string, data: Record<string, any>): Promise<void> {
    try {
      // Buscar dados do usuário
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`Usuário não encontrado: ${userId}`);
      }

      if (!user.phone) {
        this.logger.warn(`⚠️ Usuário ${userId} não possui número de telefone`);
        await this.saveNotificationRecord(userId, 'sms', template, data, 'skipped', 'No phone number');
        return;
      }

      // Enviar SMS
      await this.smsService.sendTemplateSMS(user.phone, template, {
        ...data,
        firstName: user.firstName,
        userType: user.userType,
      });

      // Salvar registro da notificação
      await this.saveNotificationRecord(userId, 'sms', template, data, 'sent');

      this.logger.log(`📱 SMS enviado com sucesso para ${user.phone} (${template})`);

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar SMS para usuário ${userId}:`, error);
      await this.saveNotificationRecord(userId, 'sms', template, data, 'failed', error.message);
      throw error;
    }
  }

  // ===== MÉTODOS DE CONVENIÊNCIA =====

  async sendMultiChannelNotification(
    userId: string,
    template: string,
    data: Record<string, any>,
    channels: ('email' | 'push' | 'sms')[] = ['push', 'email']
  ): Promise<void> {
    const promises = channels.map(channel => {
      switch (channel) {
        case 'email':
          return this.sendEmail(userId, template, data);
        case 'push':
          return this.sendPushNotification(userId, template, data);
        case 'sms':
          return this.sendSMS(userId, template, data);
      }
    });

    await Promise.allSettled(promises);
  }

  async sendBulkNotifications(notifications: NotificationData[]): Promise<void> {
    const promises = notifications.map(notification => {
      const { userId, type, template, data } = notification;
      
      switch (type) {
        case 'email':
          return this.sendEmail(userId, template, data);
        case 'push':
          return this.sendPushNotification(userId, template, data);
        case 'sms':
          return this.sendSMS(userId, template, data);
      }
    });

    await Promise.allSettled(promises);
    this.logger.log(`📬 ${notifications.length} notificações em lote processadas`);
  }

  // ===== TEMPLATES ESPECÍFICOS =====

  async sendProposalMatchNotification(personalId: string, proposalData: any): Promise<void> {
    await this.sendMultiChannelNotification(personalId, 'proposal-match', {
      proposalId: proposalData.id,
      studentName: proposalData.studentName,
      location: proposalData.locationName,
      date: proposalData.trainingDate,
      time: proposalData.trainingTime,
      price: proposalData.price,
      modality: proposalData.modalityName,
    }, ['push', 'email']);
  }

  async sendPaymentConfirmationNotification(userId: string, paymentData: any): Promise<void> {
    await this.sendMultiChannelNotification(userId, 'payment-confirmation', {
      paymentId: paymentData.id,
      amount: paymentData.totalAmount,
      method: paymentData.method,
      classDate: paymentData.classDate,
      location: paymentData.location,
    }, ['push', 'email']);
  }

  async sendClassReminderNotification(userId: string, classData: any): Promise<void> {
    await this.sendMultiChannelNotification(userId, 'class-reminder', {
      classId: classData.id,
      date: classData.date,
      time: classData.time,
      location: classData.location,
      partnerName: classData.partnerName, // Nome do aluno ou personal
    }, ['push']);
  }

  async sendClassCancellationNotification(userId: string, classData: any, reason: string): Promise<void> {
    await this.sendMultiChannelNotification(userId, 'class-cancellation', {
      classId: classData.id,
      date: classData.date,
      time: classData.time,
      location: classData.location,
      partnerName: classData.partnerName,
      reason: reason,
      refundInfo: classData.refundInfo,
    }, ['push', 'email']);
  }

  async sendRefundNotification(userId: string, refundData: any): Promise<void> {
    await this.sendMultiChannelNotification(userId, 'refund-processed', {
      refundId: refundData.id,
      amount: refundData.amount,
      reason: refundData.reason,
      estimatedDays: refundData.estimatedDays || 5,
    }, ['push', 'email']);
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
    // TODO: Implementar tabela de push tokens
    // Por enquanto, retornar array vazio
    return [];
  }

  private async saveNotificationRecord(
    userId: string,
    type: string,
    template: string,
    data: Record<string, any>,
    status: 'sent' | 'failed' | 'skipped',
    error?: string
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

      this.logger.debug(`📝 Registro de notificação salvo: ${userId} - ${type} - ${template} - ${status}`);

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

  async updateUserNotificationPreferences(userId: string, preferences: any): Promise<void> {
    // TODO: Implementar atualização de preferências
    this.logger.log(`⚙️ Preferências de notificação atualizadas para usuário ${userId}`);
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
