import { Injectable, Logger, Inject } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';

export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  data?: Record<string, any>;
  createdAt: Date;
}

@Injectable()
export class InAppNotificationService {
  private readonly logger = new Logger(InAppNotificationService.name);

  // Por enquanto, usar armazenamento em memória
  // TODO: Implementar tabela de notificações no banco
  private notifications: InAppNotification[] = [];

  constructor(@Inject('DATABASE_CONNECTION') private readonly db: any) {}

  // ===== MÉTODOS PRINCIPAIS =====

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    data?: Record<string, any>,
  ): Promise<InAppNotification> {
    const notification: InAppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      title,
      message,
      type,
      isRead: false,
      data,
      createdAt: new Date(),
    };

    this.notifications.push(notification);
    this.logger.log(
      `🔔 Notificação in-app criada para usuário ${userId}: ${title}`,
    );

    return notification;
  }

  async getUserNotifications(
    userId: string,
    limit: number = 50,
  ): Promise<InAppNotification[]> {
    const userNotifications = this.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    
    this.logger.log(
      `📋 [IN_APP] Buscando notificações para usuário ${userId}: ${this.notifications.length} total, ${userNotifications.length} do usuário`,
    );
    
    return userNotifications;
  }

  async getUnreadNotifications(userId: string): Promise<InAppNotification[]> {
    return this.notifications
      .filter((n) => n.userId === userId && !n.isRead)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getUnreadCount(userId: string): Promise<number> {
    const count = this.notifications.filter((n) => n.userId === userId && !n.isRead)
      .length;
    
    this.logger.log(
      `📊 [IN_APP] Contador de não lidas para usuário ${userId}: ${count} (total de notificações: ${this.notifications.length})`,
    );
    
    return count;
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = this.notifications.find(
      (n) => n.id === notificationId && n.userId === userId,
    );

    if (notification) {
      notification.isRead = true;
      this.logger.log(`✅ Notificação ${notificationId} marcada como lida`);
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    const userNotifications = this.notifications.filter(
      (n) => n.userId === userId && !n.isRead,
    );

    userNotifications.forEach((n) => (n.isRead = true));
    this.logger.log(
      `✅ ${userNotifications.length} notificações marcadas como lidas para usuário ${userId}`,
    );
  }

  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    const index = this.notifications.findIndex(
      (n) => n.id === notificationId && n.userId === userId,
    );

    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.logger.log(`🗑️ Notificação ${notificationId} deletada`);
    }
  }

  // ===== TEMPLATES ESPECÍFICOS =====

  async createProposalMatchNotification(
    userId: string,
    proposalData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '🎯 Nova Proposta Disponível!',
      `${proposalData.studentName} quer treinar em ${proposalData.location} por R$ ${proposalData.price}`,
      'info',
      {
        type: 'proposal_match',
        proposalId: proposalData.proposalId,
        studentName: proposalData.studentName,
        location: proposalData.location,
        price: proposalData.price,
        action: 'view_proposal',
      },
    );
  }

  async createPaymentConfirmationNotification(
    userId: string,
    paymentData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '✅ Pagamento Confirmado',
      `Sua aula de R$ ${paymentData.amount} foi confirmada!`,
      'success',
      {
        type: 'payment_confirmation',
        paymentId: paymentData.paymentId,
        amount: paymentData.amount,
        classDate: paymentData.classDate,
        action: 'view_class',
      },
    );
  }

  async createClassReminderNotification(
    userId: string,
    classData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '🏋️ Sua Aula é Hoje!',
      `${classData.time} em ${classData.location} com ${classData.partnerName}`,
      'info',
      {
        type: 'class_reminder',
        classId: classData.classId,
        time: classData.time,
        location: classData.location,
        partnerName: classData.partnerName,
        action: 'view_class',
      },
    );
  }

  async createClassStartedNotification(
    userId: string,
    classData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '▶️ Aula Iniciada',
      `${classData.partnerName} iniciou a aula. Confirme sua presença!`,
      'warning',
      {
        type: 'class_started',
        classId: classData.classId,
        partnerName: classData.partnerName,
        action: 'confirm_presence',
      },
    );
  }

  async createClassCancellationNotification(
    userId: string,
    classData: any,
  ): Promise<InAppNotification> {
    const refundMessage = classData.refundInfo ? ' Reembolso processado.' : '';

    return this.createNotification(
      userId,
      '❌ Aula Cancelada',
      `Sua aula de ${classData.date} foi cancelada.${refundMessage}`,
      'error',
      {
        type: 'class_cancellation',
        classId: classData.classId,
        date: classData.date,
        reason: classData.reason,
        refundInfo: classData.refundInfo,
        action: 'view_details',
      },
    );
  }

  async createRefundNotification(
    userId: string,
    refundData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '💰 Reembolso Processado',
      `R$ ${refundData.amount} será creditado em ${refundData.estimatedDays} dias úteis`,
      'success',
      {
        type: 'refund_processed',
        amount: refundData.amount,
        estimatedDays: refundData.estimatedDays,
        reason: refundData.reason,
        action: 'view_refund',
      },
    );
  }

  async createRatingRequestNotification(
    userId: string,
    classData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '⭐ Avalie sua Aula',
      `Como foi sua aula com ${classData.partnerName}?`,
      'info',
      {
        type: 'rating_request',
        classId: classData.classId,
        partnerName: classData.partnerName,
        action: 'rate_class',
      },
    );
  }

  async createProfileReminderNotification(
    userId: string,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '👤 Complete seu Perfil',
      'Finalize seu perfil para receber mais propostas!',
      'warning',
      {
        type: 'profile_reminder',
        action: 'complete_profile',
      },
    );
  }

  async createNewMessageNotification(
    userId: string,
    messageData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      `💬 ${messageData.senderName}`,
      messageData.messagePreview || 'Enviou uma nova mensagem',
      'info',
      {
        type: 'new_message',
        senderId: messageData.senderId,
        senderName: messageData.senderName,
        classId: messageData.classId,
        messagePreview: messageData.messagePreview,
        action: 'open_chat',
      },
    );
  }

  async createDisputeUpdateNotification(
    userId: string,
    disputeData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '⚖️ Atualização da Disputa',
      `Sua disputa foi ${disputeData.status}. Verifique os detalhes.`,
      'warning',
      {
        type: 'dispute_update',
        disputeId: disputeData.disputeId,
        status: disputeData.status,
        classId: disputeData.classId,
        action: 'view_dispute',
      },
    );
  }

  async createPaymentReminderNotification(
    userId: string,
    reminderData: any,
  ): Promise<InAppNotification> {
    const isUrgent = reminderData.reminderType === 'final';
    const timeLeft = isUrgent ? '5 minutos' : '20 minutos';

    return this.createNotification(
      userId,
      isUrgent ? '🚨 Último Aviso!' : '⏰ Finalize seu Pagamento',
      `Sua proposta expira em ${timeLeft}!`,
      isUrgent ? 'error' : 'warning',
      {
        type: 'payment_reminder',
        proposalId: reminderData.proposalId,
        timeLeft: timeLeft,
        reminderType: reminderData.reminderType,
        action: 'complete_payment',
      },
    );
  }

  async createDisputeCreatedNotification(
    userId: string,
    disputeData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '⚖️ Nova Disputa',
      disputeData.message || 'Uma disputa foi criada sobre sua aula',
      'warning',
      {
        type: 'dispute_created',
        disputeId: disputeData.disputeId,
        classId: disputeData.classId,
        paymentId: disputeData.paymentId,
        reason: disputeData.reason,
        action: 'view_dispute',
      },
    );
  }

  async createPaymentReceivedNotification(
    userId: string,
    paymentData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '💰 Repasse Realizado',
      `R$ ${paymentData.amount} foi transferido para sua carteira`,
      'success',
      {
        type: 'payment_received',
        classId: paymentData.classId,
        amount: paymentData.amount,
        description: paymentData.description,
        action: 'view_class',
      },
    );
  }

  async createMissionCompletedNotification(
    userId: string,
    missionData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '🎯 Missão Concluída!',
      `Você completou a missão "${missionData.title}" e ganhou ${missionData.xpReward} XP!`,
      'success',
      {
        type: 'mission_completed',
        missionId: missionData.missionId,
        title: missionData.title,
        xpReward: missionData.xpReward,
        action: 'view_profile',
      },
    );
  }

  // ===== NOTIFICAÇÕES ADMINISTRATIVAS =====

  async createSystemMaintenanceNotification(
    userId: string,
    maintenanceData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '🔧 Manutenção Programada',
      `Sistema em manutenção ${maintenanceData.date} das ${maintenanceData.startTime} às ${maintenanceData.endTime}`,
      'warning',
      {
        type: 'system_maintenance',
        date: maintenanceData.date,
        startTime: maintenanceData.startTime,
        endTime: maintenanceData.endTime,
        action: 'view_details',
      },
    );
  }

  async createPromotionNotification(
    userId: string,
    promotionData: any,
  ): Promise<InAppNotification> {
    return this.createNotification(
      userId,
      '🎉 Promoção Especial!',
      promotionData.message,
      'info',
      {
        type: 'promotion',
        promotionId: promotionData.id,
        discount: promotionData.discount,
        validUntil: promotionData.validUntil,
        action: 'view_promotion',
      },
    );
  }

  // ===== ESTATÍSTICAS =====

  async getNotificationStats(userId?: string): Promise<any> {
    let filteredNotifications = this.notifications;

    if (userId) {
      filteredNotifications = this.notifications.filter(
        (n) => n.userId === userId,
      );
    }

    const total = filteredNotifications.length;
    const unread = filteredNotifications.filter((n) => !n.isRead).length;
    const byType = filteredNotifications.reduce(
      (acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      read: total - unread,
      unread,
      byType,
      lastWeek: filteredNotifications.filter(
        (n) => n.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      ).length,
    };
  }

  // ===== LIMPEZA =====

  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const initialCount = this.notifications.length;

    this.notifications = this.notifications.filter(
      (n) => n.createdAt >= cutoffDate,
    );

    const removedCount = initialCount - this.notifications.length;
    this.logger.log(`🧹 ${removedCount} notificações antigas removidas`);

    return removedCount;
  }
}
