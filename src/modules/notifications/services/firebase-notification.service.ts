import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { users } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { NonceService } from './nonce.service';

@Injectable()
export class FirebaseNotificationService {
  private readonly logger = new Logger(FirebaseNotificationService.name);
  private app: admin.app.App;

  constructor(
    private configService: ConfigService,
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private nonceService: NonceService,
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
          privateKey: this.configService
            .get<string>('FIREBASE_PRIVATE_KEY')
            ?.replace(/\\n/g, '\n'),
          clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        };

        this.logger.log('🔥 Tentando inicializar Firebase Admin...');
        this.logger.log(
          `🔥 Project ID: ${firebaseConfig.projectId ? '✅' : '❌'}`,
        );
        this.logger.log(
          `🔥 Client Email: ${firebaseConfig.clientEmail ? '✅' : '❌'}`,
        );
        this.logger.log(
          `🔥 Private Key: ${firebaseConfig.privateKey ? '✅' : '❌'}`,
        );

        // Validar configurações
        if (
          !firebaseConfig.projectId ||
          !firebaseConfig.privateKey ||
          !firebaseConfig.clientEmail
        ) {
          this.logger.warn(
            '❌ Firebase Admin não configurado - variáveis de ambiente ausentes',
          );
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
  async sendToUser(
    userId: string,
    notification: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<string | null> {
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

      // Sanitizar dados: garantir que todos os valores sejam strings
      // Firebase Admin SDK requer que todos os valores em 'data' sejam strings
      const sanitizedData: Record<string, string> = {};
      if (notification.data) {
        for (const [key, value] of Object.entries(notification.data)) {
          // Converter qualquer valor para string ou string vazia
          sanitizedData[key] = value != null ? String(value) : '';
        }
      }

      // ESTRATÉGIA HÍBRIDA: Enviar notification E data
      // - notification: Sistema Android/iOS exibe automaticamente quando app está FECHADO/hibernando
      // - data: App usa para criar notificação local quando aberto (com controle total)
      // Isso garante funcionamento em TODOS os cenários: app aberto, background ou fechado
      const message: admin.messaging.Message = {
        // ✅ ADICIONAR notification para funcionar quando app está FECHADO/hibernando
        // Sistema Android/iOS exibe automaticamente (como Uber, YouTube, 99)
        notification: {
          title: notification.title,
          body: notification.body,
        },
        // ✅ Manter data para quando app está ABERTO (app cria notificação local)
        data: {
          ...sanitizedData,
          title: notification.title, // Manter para compatibilidade
          body: notification.body,   // Manter para compatibilidade
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        token: user.fcmToken,
        android: {
          priority: 'high' as const,
          // ✅ TTL: 120 segundos (2 minutos) - notificações expiram após esse tempo
          ttl: 120 * 1000, // 120 segundos em milissegundos
          // Garante que notificação aparece mesmo após reinicialização
          directBootOk: true,
          // Configurações específicas do Android
          notification: {
            sound: 'default',
            channelId: 'high_importance_channel', // DEVE corresponder ao canal criado no Flutter
            priority: 'high' as const,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'alert_proposal.mp3',
              contentAvailable: true,
              // Para iOS, garantir que notificação aparece mesmo em hibernação
              interruptionLevel: 'timeSensitive' as const,
              badge: 1,
              // ✅ Categoria para ações de notificação (Aceitar/Ignorar)
              category: sanitizedData.type === 'new_proposal' ? 'PROPOSTA_ACOES' : undefined,
              // Alert para iOS (sistema exibe automaticamente)
              alert: {
                title: notification.title,
                body: notification.body,
              },
            },
            // ✅ Thread-ID para iOS (equivalente ao collapse_key do Android)
            threadId: sanitizedData.proposalId ? `proposta_${sanitizedData.proposalId}` : undefined,
          },
          headers: {
            // ✅ APNS Expiration: 120 segundos a partir de agora
            'apns-expiration': String(Math.floor(Date.now() / 1000) + 120),
            // ✅ APNS Priority: 10 (alta prioridade)
            'apns-priority': '10',
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
  async sendProposalNotification(
    personalId: string,
    proposal: {
      id: string;
      studentName: string;
      location: string;
      time: string;
      date?: string;
      modality: string;
      price: number;
      expiresIn: number;
    },
  ): Promise<string | null> {
    // ✅ Gerar nonce assinado para prevenir replay attacks
    const nonce = this.nonceService.generateNonce(proposal.id, personalId);

    // Buscar token FCM do usuário para adicionar collapse_key
    const user = await this.getUserFcmToken(personalId);
    if (!user?.fcmToken) {
      this.logger.log(`Usuário ${personalId} não tem token FCM`);
      return null;
    }

    // Sanitizar dados
    const sanitizedData: Record<string, string> = {
      type: 'new_proposal',
      proposalId: proposal.id,
      studentName: proposal.studentName,
      location: proposal.location,
      time: proposal.time,
      date: proposal.date || '',
      modality: proposal.modality,
      price: proposal.price.toString(),
      expiresIn: proposal.expiresIn.toString(),
      nonce: nonce, // ✅ Adicionar nonce ao payload
    };

    const title = '🎯 Nova Proposta de Treino!';
    const body = `${proposal.studentName} em ${proposal.location}`;

    try {
      if (!this.app) {
        this.logger.warn('Firebase Admin não inicializado');
        return null;
      }

      const message: admin.messaging.Message = {
        notification: {
          title,
          body,
        },
        data: {
          ...sanitizedData,
          title,
          body,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        token: user.fcmToken,
        android: {
          priority: 'high' as const,
          // ✅ TTL: 120 segundos (2 minutos)
          ttl: 120 * 1000,
          // ✅ Collapse Key: agrupa notificações da mesma proposta
          collapseKey: `proposta_${proposal.id}`,
          directBootOk: true,
          notification: {
            sound: 'default',
            channelId: 'high_importance_channel',
            priority: 'high' as const,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'alert_proposal.mp3',
              contentAvailable: true,
              interruptionLevel: 'timeSensitive' as const,
              badge: 1,
              // ✅ Categoria para ações de notificação iOS
              category: 'PROPOSTA_ACOES',
              alert: {
                title,
                body,
              },
            },
            // ✅ Thread-ID para iOS (equivalente ao collapse_key)
            threadId: `proposta_${proposal.id}`,
          },
          headers: {
            // ✅ APNS Expiration: 120 segundos
            'apns-expiration': String(Math.floor(Date.now() / 1000) + 120),
            'apns-priority': '10',
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(
        `✅ Notificação de proposta enviada para ${personalId}: ${response}`,
      );
      return response;
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar notificação de proposta para ${personalId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Enviar notificação de proposta aceita para aluno
   */
  async sendProposalAcceptedNotification(
    studentId: string,
    proposal: {
      id: string;
      personalName: string;
      personalPhoto?: string;
      location: string;
      classId?: string;
    },
  ): Promise<string | null> {
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
  async sendFinancialUpdateNotification(
    userId: string,
    update: {
      type: 'payment_received' | 'refund_processed' | 'balance_updated';
      amount: number;
      description: string;
    },
  ): Promise<string | null> {
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
  private async getUserFcmToken(
    userId: string,
  ): Promise<{ fcmToken: string } | null> {
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
      this.logger.error(
        `Erro ao buscar token FCM para usuário ${userId}:`,
        error,
      );
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
