import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { users } from '../../../database/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class FirebaseNotificationService {
  private readonly logger = new Logger(FirebaseNotificationService.name);
  private app: admin.app.App;

  constructor(
    private configService: ConfigService,
    @Inject('DATABASE_CONNECTION') private readonly db: any,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      // Verificar se Firebase já foi inicializado
      if (admin.apps.length === 0) {
        // Configuração do Firebase Admin
        const firebaseConfig = {
          projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
          privateKey: this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
          clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        };

        this.logger.log('🔥 Tentando inicializar Firebase Admin...');
        this.logger.log(`🔥 Project ID: ${firebaseConfig.projectId ? '✅' : '❌'}`);
        this.logger.log(`🔥 Client Email: ${firebaseConfig.clientEmail ? '✅' : '❌'}`);
        this.logger.log(`🔥 Private Key: ${firebaseConfig.privateKey ? '✅' : '❌'}`);

        // Validar configurações
        if (!firebaseConfig.projectId || !firebaseConfig.privateKey || !firebaseConfig.clientEmail) {
          this.logger.warn('❌ Firebase Admin não configurado - variáveis de ambiente ausentes');
          return;
        }

        this.app = admin.initializeApp({
          credential: admin.credential.cert(firebaseConfig),
          projectId: firebaseConfig.projectId,
        });

        this.logger.log('🔥 Firebase Admin inicializado com sucesso');
      } else {
        this.app = admin.app();
        this.logger.log('Firebase Admin já estava inicializado');
      }
    } catch (error) {
      this.logger.error('Erro ao inicializar Firebase Admin:', error);
    }
  }

  /**
   * Enviar notificação push para um usuário específico
   */
  async sendToUser(userId: string, notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<string | null> {
    try {
      if (!this.app) {
        this.logger.warn('Firebase Admin não inicializado');
        return null;
      }

      // Buscar token FCM do usuário no banco de dados
      const user = await this.getUserFcmToken(userId);
      if (!user?.fcmToken) {
        this.logger.log(`Usuário ${userId} não tem token FCM`);
        return null;
      }

      // Preparar mensagem
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...notification.data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        token: user.fcmToken,
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'alert_proposal',
            channelId: 'proposals_urgent',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'alert_proposal.mp3',
              contentAvailable: true,
              badge: 1,
            },
          },
        },
      };

      // Enviar notificação
      const response = await admin.messaging().send(message);
      this.logger.log(`✅ Notificação enviada para ${userId}: ${response}`);
      return response;
    } catch (error) {
      this.logger.error(`❌ Erro ao enviar notificação para ${userId}:`, error);
      return null;
    }
  }

  /**
   * Enviar notificação de nova proposta para personal
   */
  async sendProposalNotification(personalId: string, proposal: {
    id: string;
    studentName: string;
    location: string;
    time: string;
    date?: string;
    modality: string;
    price: number;
    expiresIn: number;
  }): Promise<string | null> {
    return this.sendToUser(personalId, {
      title: '🎯 Nova Proposta de Treino!',
      body: `${proposal.studentName} em ${proposal.location}`,
      data: {
        type: 'new_proposal',
        proposalId: proposal.id,
        studentName: proposal.studentName,
        location: proposal.location,
        time: proposal.time,
        date: proposal.date || '',
        modality: proposal.modality,
        price: proposal.price.toString(),
        expiresIn: proposal.expiresIn.toString(),
      },
    });
  }

  /**
   * Enviar notificação de proposta aceita para aluno
   */
  async sendProposalAcceptedNotification(studentId: string, proposal: {
    id: string;
    personalName: string;
    personalPhoto?: string;
    location: string;
    classId?: string;
  }): Promise<string | null> {
    return this.sendToUser(studentId, {
      title: '✅ Proposta Aceita!',
      body: `${proposal.personalName} aceitou sua proposta em ${proposal.location}`,
      data: {
        type: 'proposal_accepted',
        proposalId: proposal.id,
        personalName: proposal.personalName,
        personalPhoto: proposal.personalPhoto || '',
        location: proposal.location,
        classId: proposal.classId || '',
      },
    });
  }

  /**
   * Enviar notificação de atualização financeira
   */
  async sendFinancialUpdateNotification(userId: string, update: {
    type: 'payment_received' | 'refund_processed' | 'balance_updated';
    amount: number;
    description: string;
  }): Promise<string | null> {
    const titles = {
      payment_received: '💰 Pagamento Recebido!',
      refund_processed: '🔄 Reembolso Processado',
      balance_updated: '💳 Saldo Atualizado',
    };

    return this.sendToUser(userId, {
      title: titles[update.type],
      body: update.description,
      data: {
        type: 'financial_update',
        updateType: update.type,
        amount: update.amount.toString(),
        description: update.description,
      },
    });
  }

  /**
   * Buscar token FCM do usuário no banco de dados
   */
  private async getUserFcmToken(userId: string): Promise<{ fcmToken: string } | null> {
    try {
      const user = await this.db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          fcmToken: true,
        },
      });

      if (!user || !user.fcmToken) {
        this.logger.log(`Usuário ${userId} não tem token FCM`);
        return null;
      }

      return { fcmToken: user.fcmToken };
    } catch (error) {
      this.logger.error(`Erro ao buscar token FCM para usuário ${userId}:`, error);
      return null;
    }
  }

  /**
   * Verificar se Firebase está configurado
   */
  isConfigured(): boolean {
    return !!this.app;
  }
}
