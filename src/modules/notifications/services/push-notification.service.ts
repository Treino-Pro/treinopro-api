import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly configService: ConfigService;
  private isFirebaseInitialized = false;

  constructor(configService: ConfigService) {
    this.configService = configService;
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      if (admin.apps.length === 0) {
        const firebaseConfig = {
          projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
          privateKey: this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
          clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        };

        if (!firebaseConfig.projectId || !firebaseConfig.privateKey || !firebaseConfig.clientEmail) {
          this.logger.warn('❌ Firebase Admin não configurado - variáveis de ambiente ausentes no PushNotificationService');
          return;
        }

        admin.initializeApp({
          credential: admin.credential.cert(firebaseConfig),
          projectId: firebaseConfig.projectId,
        });

        this.logger.log('🔥 PushNotificationService: Firebase Admin inicializado com sucesso');
        this.isFirebaseInitialized = true;
      } else {
        this.logger.log('🔥 PushNotificationService: Firebase Admin já estava inicializado');
        this.isFirebaseInitialized = true;
      }
    } catch (error) {
      this.logger.error('❌ Erro ao inicializar Firebase Admin no PushNotificationService:', error);
      this.isFirebaseInitialized = false;
    }
  }

  async sendToToken(token: string, template: string, data: Record<string, any>): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn('📱 [MOCK] Push notification enviado (Firebase não configurado)');
      return;
    }

    try {
      const notification = this.getNotificationTemplate(template, data);
      
      const message = {
        token: token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          template: template,
          ...this.stringifyDataValues(data),
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#4CAF50',
            sound: 'default',
            priority: 'high' as const,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`📱 Push notification enviado com sucesso: ${response}`);

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar push notification para token ${token}:`, error);
      throw error;
    }
  }

  async sendToTokens(tokens: string[], template: string, data: Record<string, any>): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(`📱 [MOCK] ${tokens.length} push notifications enviados (Firebase não configurado)`);
      return;
    }

    if (tokens.length === 0) {
      this.logger.warn('⚠️ Nenhum token fornecido para envio de push notification');
      return;
    }

    try {
      const notification = this.getNotificationTemplate(template, data);
      
      const message = {
        tokens: tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          template: template,
          ...this.stringifyDataValues(data),
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#4CAF50',
            sound: 'default',
            priority: 'high' as const,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      
      this.logger.log(`📱 Push notifications enviados: ${response.successCount}/${tokens.length} com sucesso`);
      
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            this.logger.error(`❌ Falha no token ${tokens[idx]}: ${resp.error?.message}`);
          }
        });
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar push notifications para ${tokens.length} tokens:`, error);
      throw error;
    }
  }

  async sendToTopic(topic: string, template: string, data: Record<string, any>): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(`📱 [MOCK] Push notification para tópico ${topic} enviado (Firebase não configurado)`);
      return;
    }

    try {
      const notification = this.getNotificationTemplate(template, data);
      
      const message = {
        topic: topic,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          template: template,
          ...this.stringifyDataValues(data),
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`📱 Push notification enviado para tópico ${topic}: ${response}`);

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar push notification para tópico ${topic}:`, error);
      throw error;
    }
  }

  private getNotificationTemplate(template: string, data: Record<string, any>): { title: string; body: string } {
    switch (template) {
      case 'proposal-match':
        return {
          title: '🎯 Nova Proposta!',
          body: `${data.studentName} quer treinar em ${data.location} por R$ ${data.price}`,
        };

      case 'payment-confirmation':
        return {
          title: '✅ Pagamento Confirmado',
          body: `Sua aula de R$ ${data.amount} foi confirmada!`,
        };

      case 'payment-reminder':
        return {
          title: data.reminderType === 'final' ? '🚨 Último Aviso!' : '⏰ Finalize seu Pagamento',
          body: data.reminderType === 'final' 
            ? 'Sua proposta expira em 5 minutos!'
            : 'Finalize seu pagamento para garantir sua aula',
        };

      case 'class-reminder':
        return {
          title: '🏋️ Sua Aula é Hoje!',
          body: `${data.time} em ${data.location} com ${data.partnerName}`,
        };

      case 'class-started':
        return {
          title: '▶️ Aula Iniciada',
          body: `${data.partnerName} iniciou a aula. Confirme sua presença!`,
        };

      case 'class-cancellation':
        return {
          title: '❌ Aula Cancelada',
          body: `Sua aula de ${data.date} foi cancelada. ${data.refundInfo ? 'Reembolso processado.' : ''}`,
        };

      case 'refund-processed':
        return {
          title: '💰 Reembolso Processado',
          body: `R$ ${data.amount} será creditado em ${data.estimatedDays} dias úteis`,
        };

      case 'profile-reminder':
        return {
          title: '👤 Complete seu Perfil',
          body: 'Finalize seu perfil para receber mais propostas!',
        };

      case 'new-message':
        return {
          title: `💬 ${data.senderName}`,
          body: data.messagePreview || 'Enviou uma nova mensagem',
        };

      case 'rating-request':
        return {
          title: '⭐ Avalie sua Aula',
          body: `Como foi sua aula com ${data.partnerName}?`,
        };

      case 'dispute-update':
        return {
          title: '⚖️ Atualização da Disputa',
          body: `Sua disputa foi ${data.status}. Verifique os detalhes.`,
        };

      default:
        return {
          title: 'TreinoPro',
          body: `Notificação: ${template}`,
        };
    }
  }

  private stringifyDataValues(data: Record<string, any>): Record<string, string> {
    const stringified: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        stringified[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
    
    return stringified;
  }

  // ===== GERENCIAMENTO DE TOKENS =====

  async subscribeToTopic(token: string, topic: string): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(`📱 [MOCK] Token inscrito no tópico ${topic} (Firebase não configurado)`);
      return;
    }

    try {
      await admin.messaging().subscribeToTopic([token], topic);
      this.logger.log(`📱 Token inscrito no tópico ${topic}`);
    } catch (error) {
      this.logger.error(`❌ Erro ao inscrever token no tópico ${topic}:`, error);
      throw error;
    }
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(`📱 [MOCK] Token desinscrito do tópico ${topic} (Firebase não configurado)`);
      return;
    }

    try {
      await admin.messaging().unsubscribeFromTopic([token], topic);
      this.logger.log(`📱 Token desinscrito do tópico ${topic}`);
    } catch (error) {
      this.logger.error(`❌ Erro ao desinscrever token do tópico ${topic}:`, error);
      throw error;
    }
  }

  async validateToken(token: string): Promise<boolean> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn('📱 [MOCK] Token validado (Firebase não configurado)');
      return true;
    }

    try {
      // Tentar enviar uma mensagem de teste (dry run)
      // await admin.messaging().send({
      //   token: token,
      //   notification: {
      //     title: 'Test',
      //     body: 'Test',
      //   },
      // }, true); // dry run

      return true;
    } catch (error) {
      this.logger.warn(`⚠️ Token inválido: ${token} - ${error.message}`);
      return false;
    }
  }

  // ===== TEMPLATES ESPECÍFICOS =====

  async sendProposalMatchNotification(tokens: string[], proposalData: any): Promise<void> {
    await this.sendToTokens(tokens, 'proposal-match', proposalData);
  }

  async sendPaymentReminderNotification(tokens: string[], reminderData: any): Promise<void> {
    await this.sendToTokens(tokens, 'payment-reminder', reminderData);
  }

  async sendClassStartedNotification(tokens: string[], classData: any): Promise<void> {
    await this.sendToTokens(tokens, 'class-started', classData);
  }

  async sendNewMessageNotification(tokens: string[], messageData: any): Promise<void> {
    await this.sendToTokens(tokens, 'new-message', messageData);
  }

  // ===== NOTIFICAÇÕES POR TÓPICO =====

  async sendToAllUsers(template: string, data: Record<string, any>): Promise<void> {
    await this.sendToTopic('all-users', template, data);
  }

  async sendToStudents(template: string, data: Record<string, any>): Promise<void> {
    await this.sendToTopic('students', template, data);
  }

  async sendToPersonalTrainers(template: string, data: Record<string, any>): Promise<void> {
    await this.sendToTopic('personal-trainers', template, data);
  }
}
