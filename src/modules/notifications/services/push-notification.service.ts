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

  private isPushStrictModeEnabled(): boolean {
    const rawValue = this.configService.get<string>(
      'PUSH_FAIL_ON_MISSING_IOS_BUNDLE',
    );

    if (!rawValue) {
      return true;
    }

    const normalized = rawValue.trim().toLowerCase();
    const falseValues = ['false', '0', 'no', 'off', 'disabled'];

    return !falseValues.includes(normalized);
  }

  private getApnsTopic(): string | null {
    const apnsTopic = this.configService.get<string>('IOS_BUNDLE_ID');

    if (!apnsTopic) {
      const strictMode = this.isPushStrictModeEnabled();

      if (strictMode) {
        throw new Error(
          'IOS_BUNDLE_ID ausente e PUSH_FAIL_ON_MISSING_IOS_BUNDLE está ativo',
        );
      }

      this.logger.warn(
        '⚠️ IOS_BUNDLE_ID ausente: payload APNS omitido por configuração não estrita',
      );
      return null;
    }

    return apnsTopic;
  }

  private chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private initializeFirebase(): void {
    try {
      if (admin.apps.length === 0) {
        const firebaseConfig = {
          projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
          privateKey: this.configService
            .get<string>('FIREBASE_PRIVATE_KEY')
            ?.replace(/\\n/g, '\n'),
          clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        };

        if (
          !firebaseConfig.projectId ||
          !firebaseConfig.privateKey ||
          !firebaseConfig.clientEmail
        ) {
          this.logger.warn(
            '❌ Firebase Admin não configurado - variáveis de ambiente ausentes no PushNotificationService',
          );
          return;
        }

        admin.initializeApp({
          credential: admin.credential.cert(firebaseConfig),
          projectId: firebaseConfig.projectId,
        });

        this.logger.log(
          '🔥 PushNotificationService: Firebase Admin inicializado com sucesso',
        );
        this.isFirebaseInitialized = true;
      } else {
        this.logger.log(
          '🔥 PushNotificationService: Firebase Admin já estava inicializado',
        );
        this.isFirebaseInitialized = true;
      }
    } catch (error) {
      this.logger.error(
        '❌ Erro ao inicializar Firebase Admin no PushNotificationService:',
        error,
      );
      this.isFirebaseInitialized = false;
    }
  }

  async sendToToken(
    token: string,
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(
        '📱 [MOCK] Push notification enviado (Firebase não configurado)',
      );
      return;
    }

    try {
      const notification = this.getNotificationTemplate(template, data);
      const apnsTopic = this.getApnsTopic();

      const message = {
        token: token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          template: template,
          title: notification.title,
          body: notification.body,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          ...this.stringifyDataValues(data),
        },
        android: {
          priority: 'high' as const,
          ttl: 24 * 60 * 60 * 1000,
          directBootOk: true,
          notification: {
            icon: 'ic_notification',
            color: '#4CAF50',
            sound: 'default',
            channelId: 'high_importance_channel',
            priority: 'high' as const,
            visibility: 'public' as const,
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        ...(apnsTopic
          ? {
              apns: {
                payload: {
                  aps: {
                    alert: {
                      title: notification.title,
                      body: notification.body,
                    },
                    sound: 'default',
                    badge: 1,
                    'mutable-content': 1,
                    contentAvailable: true,
                  },
                },
                headers: {
                  'apns-push-type': 'alert',
                  'apns-topic': apnsTopic,
                  'apns-expiration': String(
                    Math.floor(Date.now() / 1000) + 24 * 60 * 60,
                  ),
                  'apns-priority': '10',
                },
              },
            }
          : {}),
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`📱 Push notification enviado com sucesso: ${response}`);
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar push notification para token ${token}:`,
        error,
      );
      throw error;
    }
  }

  async sendToTokens(
    tokens: string[],
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(
        `📱 [MOCK] ${tokens.length} push notifications enviados (Firebase não configurado)`,
      );
      return;
    }

    if (tokens.length === 0) {
      this.logger.warn(
        '⚠️ Nenhum token fornecido para envio de push notification',
      );
      return;
    }

    try {
      const notification = this.getNotificationTemplate(template, data);
      const apnsTopic = this.getApnsTopic();

      const maxBatchSize = 500;
      const maxChunkRetries = 2;
      const tokenChunks = this.chunkArray(tokens, maxBatchSize);
      let totalSuccessCount = 0;
      let totalFailureCount = 0;
      let hadChunkTransportError = false;

      for (let chunkIndex = 0; chunkIndex < tokenChunks.length; chunkIndex++) {
        const chunk = tokenChunks[chunkIndex];

        const message = {
          tokens: chunk,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            template: template,
            title: notification.title,
            body: notification.body,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            ...this.stringifyDataValues(data),
          },
          android: {
            priority: 'high' as const,
            ttl: 24 * 60 * 60 * 1000,
            directBootOk: true,
            notification: {
              icon: 'ic_notification',
              color: '#4CAF50',
              sound: 'default',
              channelId: 'high_importance_channel',
              priority: 'high' as const,
              visibility: 'public' as const,
              defaultSound: true,
              defaultVibrateTimings: true,
            },
          },
          ...(apnsTopic
            ? {
                apns: {
                  payload: {
                    aps: {
                      alert: {
                        title: notification.title,
                        body: notification.body,
                      },
                      sound: 'default',
                      badge: 1,
                      'mutable-content': 1,
                      contentAvailable: true,
                    },
                  },
                  headers: {
                    'apns-push-type': 'alert',
                    'apns-topic': apnsTopic,
                    'apns-expiration': String(
                      Math.floor(Date.now() / 1000) + 24 * 60 * 60,
                    ),
                    'apns-priority': '10',
                  },
                },
              }
            : {}),
        };

        let response: admin.messaging.BatchResponse | null = null;
        for (let attempt = 1; attempt <= maxChunkRetries; attempt++) {
          try {
            response = await admin.messaging().sendEachForMulticast(message);
            break;
          } catch (error) {
            const isLastAttempt = attempt === maxChunkRetries;
            if (!isLastAttempt) {
              this.logger.warn(
                `⚠️ Chunk ${chunkIndex + 1}/${tokenChunks.length} falhou na tentativa ${attempt}/${maxChunkRetries}. Retentando...`,
              );
              await new Promise((resolve) =>
                setTimeout(resolve, attempt * 1000),
              );
              continue;
            }

            hadChunkTransportError = true;
            totalFailureCount += chunk.length;
            this.logger.error(
              `❌ Falha de transporte no chunk ${chunkIndex + 1}/${tokenChunks.length} após ${maxChunkRetries} tentativas: ${error?.code || error?.message || error}`,
            );
          }
        }

        if (!response) {
          this.logger.error(
            `❌ Chunk ${chunkIndex + 1}/${tokenChunks.length} marcado para retry direcionado externo (${chunk.length} tokens)`,
          );
          continue;
        }

        totalSuccessCount += response.successCount;
        totalFailureCount += response.failureCount;

        this.logger.log(
          `📦 Chunk ${chunkIndex + 1}/${tokenChunks.length}: ${response.successCount}/${chunk.length} enviados`,
        );

        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = (resp.error as any)?.code;
              const isInvalidToken =
                errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered';

              if (isInvalidToken) {
                this.logger.warn(
                  `🗑️ Token inválido detectado (${errorCode}): ${chunk[idx].substring(0, 20)}...`,
                );
              } else {
                this.logger.error(
                  `❌ Falha no token ${chunk[idx].substring(0, 20)}...: [${errorCode}] ${resp.error?.message}`,
                );
              }
            }
          });
        }
      }

      this.logger.log(
        `📱 Push notifications enviados: ${totalSuccessCount}/${tokens.length} com sucesso`,
      );

      if (totalFailureCount > 0) {
        this.logger.warn(
          `⚠️ Total de falhas no envio em lote: ${totalFailureCount}/${tokens.length}`,
        );
      }

      if (hadChunkTransportError && totalSuccessCount > 0) {
        this.logger.error(
          '❌ Envio com sucesso parcial: alguns chunks falharam no transporte e exigem retry direcionado',
        );
      }

      if (hadChunkTransportError) {
        throw new Error(
          'Falha parcial no envio de push: houve chunks com erro de transporte após retries',
        );
      }

      if (totalSuccessCount === 0 && totalFailureCount > 0) {
        throw new Error(
          'Falha ao enviar push notifications para todos os tokens',
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar push notifications para ${tokens.length} tokens:`,
        error,
      );
      throw error;
    }
  }

  async sendToTopic(
    topic: string,
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(
        `📱 [MOCK] Push notification para tópico ${topic} enviado (Firebase não configurado)`,
      );
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
      this.logger.log(
        `📱 Push notification enviado para tópico ${topic}: ${response}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar push notification para tópico ${topic}:`,
        error,
      );
      throw error;
    }
  }

  private getNotificationTemplate(
    template: string,
    data: Record<string, any>,
  ): { title: string; body: string } {
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
          title:
            data.reminderType === 'final'
              ? '🚨 Último Aviso!'
              : '⏰ Finalize seu Pagamento',
          body:
            data.reminderType === 'final'
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

  private stringifyDataValues(
    data: Record<string, any>,
  ): Record<string, string> {
    const stringified: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        stringified[key] =
          typeof value === 'string' ? value : JSON.stringify(value);
      }
    }

    return stringified;
  }

  // ===== GERENCIAMENTO DE TOKENS =====

  async subscribeToTopic(token: string, topic: string): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(
        `📱 [MOCK] Token inscrito no tópico ${topic} (Firebase não configurado)`,
      );
      return;
    }

    try {
      await admin.messaging().subscribeToTopic([token], topic);
      this.logger.log(`📱 Token inscrito no tópico ${topic}`);
    } catch (error) {
      this.logger.error(
        `❌ Erro ao inscrever token no tópico ${topic}:`,
        error,
      );
      throw error;
    }
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<void> {
    if (!this.isFirebaseInitialized) {
      this.logger.warn(
        `📱 [MOCK] Token desinscrito do tópico ${topic} (Firebase não configurado)`,
      );
      return;
    }

    try {
      await admin.messaging().unsubscribeFromTopic([token], topic);
      this.logger.log(`📱 Token desinscrito do tópico ${topic}`);
    } catch (error) {
      this.logger.error(
        `❌ Erro ao desinscrever token do tópico ${topic}:`,
        error,
      );
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

  async sendProposalMatchNotification(
    tokens: string[],
    proposalData: any,
  ): Promise<void> {
    await this.sendToTokens(tokens, 'proposal-match', proposalData);
  }

  async sendPaymentReminderNotification(
    tokens: string[],
    reminderData: any,
  ): Promise<void> {
    await this.sendToTokens(tokens, 'payment-reminder', reminderData);
  }

  async sendClassStartedNotification(
    tokens: string[],
    classData: any,
  ): Promise<void> {
    await this.sendToTokens(tokens, 'class-started', classData);
  }

  async sendNewMessageNotification(
    tokens: string[],
    messageData: any,
  ): Promise<void> {
    await this.sendToTokens(tokens, 'new-message', messageData);
  }

  // ===== NOTIFICAÇÕES POR TÓPICO =====

  async sendToAllUsers(
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    await this.sendToTopic('all-users', template, data);
  }

  async sendToStudents(
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    await this.sendToTopic('students', template, data);
  }

  async sendToPersonalTrainers(
    template: string,
    data: Record<string, any>,
  ): Promise<void> {
    await this.sendToTopic('personal-trainers', template, data);
  }
}
