import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { users, userPushTokens } from '../../../database/schema';
import { eq, desc } from 'drizzle-orm';
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
   * Retorna o apns-topic (bundle ID) a partir do env
   */
  private getApnsTopic(): string | null {
    const apnsTopic = this.configService.get<string>('IOS_BUNDLE_ID');

    if (!apnsTopic) {
      this.logger.warn(
        '⚠️ IOS_BUNDLE_ID ausente: payload APNS será omitido neste envio',
      );
      return null;
    }

    return apnsTopic;
  }

  /**
   * Divide array em blocos menores
   */
  private chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Envia mensagens em blocos de até 500 (limite do FCM para sendEach)
   */
  private async sendEachWithChunking(
    messages: admin.messaging.Message[],
  ): Promise<{
    responses: admin.messaging.SendResponse[];
    successCount: number;
    failureCount: number;
  }> {
    const maxBatchSize = 500;
    const chunks = this.chunkArray(messages, maxBatchSize);
    const allResponses: admin.messaging.SendResponse[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const response = await admin.messaging().sendEach(chunk);

        allResponses.push(...response.responses);
        successCount += response.successCount;
        failureCount += response.failureCount;

        this.logger.log(
          `📦 Chunk ${i + 1}/${chunks.length} enviado: ${response.successCount}/${chunk.length} sucesso`,
        );
      } catch (error) {
        const chunkError = {
          code: error?.code || 'messaging/internal-error',
          message: error?.message || 'Falha ao enviar chunk de notificações',
        };

        allResponses.push(
          ...chunk.map(
            () =>
              ({
                success: false,
                error: chunkError,
              }) as admin.messaging.SendResponse,
          ),
        );
        failureCount += chunk.length;

        this.logger.error(
          `❌ Chunk ${i + 1}/${chunks.length} falhou completamente (${chunk.length} mensagens): ${chunkError.code}`,
        );
      }
    }

    return {
      responses: allResponses,
      successCount,
      failureCount,
    };
  }

  /**
   * Delay helper para retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Verifica se o erro é recuperável e deve ser retentado
   */
  private isRecoverableError(error: any): boolean {
    const recoverableCodes = [
      'messaging/internal-error',
      'messaging/server-unavailable',
      'messaging/timeout',
      'messaging/quota-exceeded',
    ];

    return error?.code && recoverableCodes.includes(error.code);
  }

  /**
   * Remove token FCM inválido do banco de dados
   * Chamado pelo fluxo single-token (sendWithRetry → handleSendError).
   * Recebe o token concreto para remover apenas ele, preservando outros dispositivos.
   */
  private async clearInvalidToken(
    userId: string,
    invalidToken?: string,
  ): Promise<void> {
    try {
      // Se sabemos qual token é inválido, remover apenas ele da tabela multi-token
      if (invalidToken) {
        await this.clearInvalidTokenFromTable(invalidToken);
      }

      // Limpar da coluna legacy apenas se o token legacy é o mesmo
      const user = await this.db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { fcmToken: true },
      });

      if (user?.fcmToken && (!invalidToken || user.fcmToken === invalidToken)) {
        await this.db
          .update(users)
          .set({ fcmToken: null })
          .where(eq(users.id, userId));
        this.logger.warn(`🗑️ Token FCM legacy removido para usuário ${userId}`);
      }
    } catch (error) {
      this.logger.error(
        `Erro ao remover token inválido para ${userId}:`,
        error,
      );
    }
  }

  /**
   * Trata erros de envio de notificação
   */
  private async handleSendError(
    error: any,
    userId: string,
    token?: string,
  ): Promise<void> {
    const errorCode = error?.code;

    // Tokens inválidos ou não registrados devem ser removidos
    if (
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'messaging/registration-token-not-registered'
    ) {
      this.logger.warn(
        `❌ Token inválido detectado para usuário ${userId}: ${errorCode}`,
      );
      await this.clearInvalidToken(userId, token);
    } else if (errorCode === 'messaging/invalid-argument') {
      this.logger.error(
        `❌ Argumento inválido ao enviar notificação para ${userId}:`,
        error.message,
      );
    } else {
      this.logger.error(`❌ Erro ao enviar notificação para ${userId}:`, error);
    }
  }

  /**
   * Envia mensagem FCM com retry automático em caso de falha recuperável
   */
  private async sendWithRetry(
    message: admin.messaging.Message,
    userId: string,
    maxRetries: number = 3,
  ): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await admin.messaging().send(message);

        if (attempt > 1) {
          this.logger.log(
            `✅ Notificação enviada com sucesso após ${attempt} tentativas para ${userId}`,
          );
        }

        return response;
      } catch (error) {
        // Se é a última tentativa ou erro não é recuperável, trata o erro
        if (attempt === maxRetries || !this.isRecoverableError(error)) {
          await this.handleSendError(error, userId, (message as any).token);
          return null;
        }

        // Erro recuperável - aguardar com exponential backoff antes de retentar
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        this.logger.warn(
          `⚠️ Tentativa ${attempt}/${maxRetries} falhou para ${userId}. ` +
            `Retentando em ${delayMs}ms... Erro: ${error.code}`,
        );
        await this.delay(delayMs);
      }
    }

    return null;
  }

  /**
   * Enviar notificação push para um usuário específico (multi-device)
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

      // Buscar todos os tokens FCM do usuário (multi-device)
      const allTokens = await this.getUserAllFcmTokens(userId);

      // Fallback para token legacy
      if (allTokens.length === 0) {
        const user = await this.getUserFcmToken(userId);
        if (!user?.fcmToken) {
          this.logger.log(`Usuário ${userId} não tem token FCM`);
          return null;
        }
        allTokens.push(user.fcmToken);
      }

      // Se há mais de 1 token, enviar para todos (multi-device)
      if (allTokens.length > 1) {
        this.logger.log(
          `📱 Enviando para ${allTokens.length} dispositivos do usuário ${userId}`,
        );
        return await this.sendToMultipleTokens(userId, allTokens, notification);
      }

      // Caminho padrão: 1 token
      const fcmToken = allTokens[0];

      // Sanitizar dados: garantir que todos os valores sejam strings
      // Firebase Admin SDK requer que todos os valores em 'data' sejam strings
      const sanitizedData: Record<string, string> = {};
      if (notification.data) {
        for (const [key, value] of Object.entries(notification.data)) {
          // Converter qualquer valor para string ou string vazia
          sanitizedData[key] = value != null ? String(value) : '';
        }
      }

      // ✅ ESTRATÉGIA HÍBRIDA: Enviar notification + data
      // - notification: Garante que Android mostre notificação IMEDIATAMENTE mesmo se handler falhar
      // - data: Permite que Flutter processe e customize quando handler executar
      // - priority: 'high' garante que passe pelo Doze Mode
      // - TTL: 24 horas garante entrega mesmo com atrasos
      // - Esta abordagem garante entrega imediata E customização quando possível
      const apnsTopic = this.getApnsTopic();

      const message: admin.messaging.Message = {
        // ✅ notification: Android mostra imediatamente (fallback se handler falhar)
        notification: {
          title: notification.title,
          body: notification.body,
        },
        // ✅ data: Flutter processa e customiza quando handler executar
        data: {
          ...sanitizedData,
          title: notification.title, // Para Flutter criar notificação local customizada
          body: notification.body, // Para Flutter criar notificação local customizada
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        token: fcmToken,
        android: {
          priority: 'high' as const, // ✅ CRÍTICO: Alta prioridade para passar pelo Doze Mode
          // ✅ TTL: 24 horas (86400 segundos) - garantir entrega mesmo com Doze Mode
          ttl: 24 * 60 * 60 * 1000, // 24 horas em milissegundos
          // Garante que notificação aparece mesmo após reinicialização
          directBootOk: true,
          // ✅ CRÍTICO: collapseKey para agrupar notificações e evitar perda em Doze Mode
          collapseKey:
            sanitizedData.type === 'new_message'
              ? `message_${sanitizedData.classId || 'default'}`
              : sanitizedData.proposalId
                ? `proposal_${sanitizedData.proposalId}`
                : 'default',
          // ✅ notification: Garante exibição imediata no Android
          notification: {
            title: notification.title,
            body: notification.body,
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
                    // ✅ alert: iOS mostra notificação imediatamente
                    alert: {
                      title: notification.title,
                      body: notification.body,
                    },
                    sound: 'default',
                    badge: 1,
                    'mutable-content': 1,
                    contentAvailable: true, // Permite que handler de background execute
                  },
                  // ✅ Thread-ID para iOS (equivalente ao collapse_key do Android)
                  threadId: sanitizedData.proposalId
                    ? `proposta_${sanitizedData.proposalId}`
                    : undefined,
                },
                headers: {
                  // ✅ CRÍTICO: apns-push-type obrigatório para iOS 13+
                  'apns-push-type': 'alert',
                  // ✅ CRÍTICO: apns-topic deve ser o bundle ID do app
                  'apns-topic': apnsTopic,
                  // ✅ APNS Expiration: 24 horas (alinhado com TTL do Android)
                  'apns-expiration': String(
                    Math.floor(Date.now() / 1000) + 24 * 60 * 60,
                  ),
                  // ✅ APNS Priority: 10 (alta prioridade)
                  'apns-priority': '10',
                },
              },
            }
          : {}),
      };

      // Enviar notificação com retry automático
      const response = await this.sendWithRetry(message, userId);
      if (response) {
        this.logger.log(`✅ Notificação enviada para ${userId}: ${response}`);
      }
      return response;
    } catch (error) {
      this.logger.error(
        `❌ Erro inesperado ao enviar notificação para ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Enviar notificação para múltiplos tokens de um mesmo usuário (multi-device)
   */
  private async sendToMultipleTokens(
    userId: string,
    tokens: string[],
    notification: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<string | null> {
    const sanitizedData: Record<string, string> = {};
    if (notification.data) {
      for (const [key, value] of Object.entries(notification.data)) {
        sanitizedData[key] = value != null ? String(value) : '';
      }
    }

    const apnsTopic = this.getApnsTopic();

    const messages: admin.messaging.Message[] = tokens.map((token) => ({
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...sanitizedData,
        title: notification.title,
        body: notification.body,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      token,
      android: {
        priority: 'high' as const,
        ttl: 24 * 60 * 60 * 1000,
        directBootOk: true,
        notification: {
          title: notification.title,
          body: notification.body,
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
    }));

    try {
      const response = await this.sendEachWithChunking(messages);
      let firstSuccess: string | null = null;

      for (let idx = 0; idx < response.responses.length; idx++) {
        const resp = response.responses[idx];
        if (resp.success) {
          if (!firstSuccess) firstSuccess = resp.messageId ?? null;
        } else {
          const errorCode = (resp.error as any)?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            await this.clearInvalidTokenFromTable(tokens[idx]);
          }
        }
      }

      this.logger.log(
        `📱 Multi-device: ${response.successCount}/${tokens.length} enviados para ${userId}`,
      );
      return firstSuccess;
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar multi-device para ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Remove token inválido da tabela user_push_tokens
   */
  private async clearInvalidTokenFromTable(token: string): Promise<void> {
    try {
      await this.db
        .delete(userPushTokens)
        .where(eq(userPushTokens.token, token));
      this.logger.warn(`🗑️ Token inválido removido da tabela user_push_tokens`);
    } catch (error) {
      // Tabela pode não existir ainda
      this.logger.warn(`⚠️ Erro ao remover token da tabela: ${error.message}`);
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

    // Buscar todos os tokens do usuário (multi-device)
    const allTokens = await this.getUserAllFcmTokens(personalId);
    if (allTokens.length === 0) {
      // Fallback legacy
      const user = await this.getUserFcmToken(personalId);
      if (!user?.fcmToken) {
        this.logger.log(`Usuário ${personalId} não tem token FCM`);
        return null;
      }
      allTokens.push(user.fcmToken);
    }

    // Sanitizar dados
    const deepLink = `treinopro://proposal/${proposal.id}`;
    const sanitizedData: Record<string, string> = {
      type: 'new_proposal',
      proposalId: proposal.id,
      deepLink: deepLink, // ✅ Deep link para abrir modal quando tocar na notificação
      studentName: proposal.studentName,
      location: proposal.location,
      time: proposal.time,
      date: proposal.date || '',
      modality: proposal.modality,
      price: proposal.price.toString(),
      expiresIn: proposal.expiresIn.toString(),
      nonce: nonce, // ✅ Adicionar nonce ao payload
    };

    // ✅ Formatar body com mais informações de forma visualmente atraente
    const title = '🎯 Nova Proposta de Treino!';

    // Formatar valores
    const timeFormatted = proposal.time || 'Horário não informado';
    const priceFormatted = `R$ ${parseFloat(proposal.price.toString()).toFixed(2).replace('.', ',')}`;
    const expiresInMinutes = Math.floor(proposal.expiresIn / 60);
    const expiresInSeconds = proposal.expiresIn % 60;
    const expiresText =
      expiresInMinutes > 0 ? `${expiresInMinutes}min` : `${expiresInSeconds}s`;

    // ✅ Garantir que studentName e location não sejam vazios
    const studentName = proposal.studentName || 'Aluno não informado';
    const location = proposal.location || 'Local não informado';

    // ✅ Body formatado de forma mais visual e organizada
    // Versão com quebras de linha (suportado em Android/iOS modernos)
    // Formato multi-linha:
    // "👤 João Silvagita
    //  📍 Smart Fit
    //  🕐 14:00 • 💰 R$ 80,00
    //  ⏰ Expira em 2min"
    const body = `👤 ${studentName}\n📍 ${location}\n🕐 ${timeFormatted} • 💰 ${priceFormatted}\n⏰ Expira em ${expiresText}`;

    // Alternativa sem quebras de linha (caso sistema não suporte):
    // const body = `👤 ${studentName} • 📍 ${location} • 🕐 ${timeFormatted} • 💰 ${priceFormatted} • ⏰ Expira em ${expiresText}`;

    // ✅ Log para debug: verificar formato do body
    this.logger.log(`📱 [NOTIF] Título: "${title}"`);
    this.logger.log(`📱 [NOTIF] Body formatado: "${body}"`);

    try {
      if (!this.app) {
        this.logger.warn('Firebase Admin não inicializado');
        return null;
      }

      const apnsTopic = this.getApnsTopic();

      // ✅ ESTRATÉGIA HÍBRIDA: Enviar notification + data
      // - notification: Garante que Android mostre notificação IMEDIATAMENTE mesmo se handler falhar
      // - data: Permite que Flutter processe e customize quando handler executar
      // - priority: 'high' garante que passe pelo Doze Mode
      // - TTL: 24 horas garante entrega mesmo com atrasos
      // - Esta abordagem garante entrega imediata E customização quando possível
      // Construir payload base (sem token — será adicionado por device)
      const basePayload = {
        notification: { title, body },
        data: {
          ...sanitizedData,
          title,
          body,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high' as const,
          ttl: 24 * 60 * 60 * 1000,
          collapseKey: `proposta_${proposal.id}`,
          directBootOk: true,
          notification: {
            title,
            body,
            icon: 'ic_notification',
            color: '#FF6A00',
            sound: 'default',
            channelId: 'proposal_channel',
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
                    alert: { title, body },
                    sound: 'default',
                    badge: 1,
                    contentAvailable: true,
                  },
                  threadId: `proposta_${proposal.id}`,
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

      // Enviar para todos os tokens (multi-device)
      if (allTokens.length > 1) {
        this.logger.log(
          `📱 Proposta: enviando para ${allTokens.length} dispositivos de ${personalId}`,
        );
        const messages: admin.messaging.Message[] = allTokens.map((t) => ({
          ...basePayload,
          token: t,
        }));
        const batchResp = await this.sendEachWithChunking(messages);
        let firstSuccess: string | null = null;

        for (let idx = 0; idx < batchResp.responses.length; idx++) {
          const resp = batchResp.responses[idx];
          if (resp.success) {
            if (!firstSuccess) firstSuccess = resp.messageId ?? null;
          } else {
            const errorCode = (resp.error as any)?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              await this.clearInvalidTokenFromTable(allTokens[idx]);
            }
          }
        }

        this.logger.log(
          `📱 Proposta multi-device: ${batchResp.successCount}/${allTokens.length} para ${personalId}`,
        );
        return firstSuccess;
      }

      // Single token path
      const message: admin.messaging.Message = {
        ...basePayload,
        token: allTokens[0],
      };

      const response = await this.sendWithRetry(message, personalId);
      if (response) {
        this.logger.log(
          `✅ Notificação de proposta enviada para ${personalId}: ${response}`,
        );
      }
      return response;
    } catch (error) {
      this.logger.error(
        `❌ Erro inesperado ao enviar notificação de proposta para ${personalId}:`,
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
   * Tenta primeiro a tabela user_push_tokens (multi-device), fallback para users.fcmToken (legacy)
   */
  private async getUserFcmToken(
    userId: string,
  ): Promise<{ fcmToken: string } | null> {
    try {
      // Tentar buscar da tabela multi-token primeiro
      const tokens = await this.getUserAllFcmTokens(userId);
      if (tokens.length > 0) {
        // Retornar o token mais recente (para retrocompatibilidade com chamadas que esperam 1 token)
        return { fcmToken: tokens[0] };
      }

      // Fallback: buscar da coluna legacy
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
   * Buscar todos os tokens FCM de um usuário (multi-device)
   */
  private async getUserAllFcmTokens(userId: string): Promise<string[]> {
    try {
      const tokens = await this.db
        .select({ token: userPushTokens.token })
        .from(userPushTokens)
        .where(eq(userPushTokens.userId, userId))
        .orderBy(desc(userPushTokens.lastUsedAt));

      return tokens.map((t: { token: string }) => t.token).filter(Boolean);
    } catch (error) {
      // Tabela pode não existir ainda (migration pendente)
      this.logger.warn(
        `⚠️ Erro ao buscar tokens multi-device para ${userId}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Enviar notificações em lote para múltiplos usuários
   * Útil para broadcast ou notificações em massa
   */
  async sendBatch(
    notifications: Array<{
      userId: string;
      notification: {
        title: string;
        body: string;
        data?: Record<string, string>;
      };
    }>,
  ): Promise<{ success: number; failed: number }> {
    if (!this.app) {
      this.logger.warn('Firebase Admin não inicializado');
      return { success: 0, failed: notifications.length };
    }

    const messages: admin.messaging.Message[] = [];
    const userIds: string[] = [];

    // Preparar mensagens — buscar todos os tokens de cada usuário (multi-device)
    for (const item of notifications) {
      let tokens = await this.getUserAllFcmTokens(item.userId);
      if (tokens.length === 0) {
        const user = await this.getUserFcmToken(item.userId);
        if (!user?.fcmToken) continue;
        tokens = [user.fcmToken];
      }

      const sanitizedData: Record<string, string> = {};
      if (item.notification.data) {
        for (const [key, value] of Object.entries(item.notification.data)) {
          sanitizedData[key] = value != null ? String(value) : '';
        }
      }

      const apnsTopic = this.getApnsTopic();

      // Criar uma mensagem por token (multi-device)
      for (const token of tokens) {
        const message: admin.messaging.Message = {
          notification: {
            title: item.notification.title,
            body: item.notification.body,
          },
          data: {
            ...sanitizedData,
            title: item.notification.title,
            body: item.notification.body,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
          token,
          android: {
            priority: 'high' as const,
            ttl: 24 * 60 * 60 * 1000,
            directBootOk: true,
            notification: {
              title: item.notification.title,
              body: item.notification.body,
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
                        title: item.notification.title,
                        body: item.notification.body,
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

        messages.push(message);
        userIds.push(item.userId);
      }
    }

    if (messages.length === 0) {
      this.logger.warn('Nenhuma mensagem para enviar em lote');
      return { success: 0, failed: 0 };
    }

    try {
      const response = await this.sendEachWithChunking(messages);

      let successCount = 0;
      let failedCount = 0;

      for (let idx = 0; idx < response.responses.length; idx++) {
        const resp = response.responses[idx];
        if (resp.success) {
          successCount++;
        } else {
          failedCount++;
          const userId = userIds[idx];
          const failedToken = (messages[idx] as any)?.token;
          await this.handleSendError(resp.error, userId, failedToken);
        }
      }

      this.logger.log(
        `📊 Lote de notificações: ${successCount} enviadas, ${failedCount} falharam`,
      );

      return { success: successCount, failed: failedCount };
    } catch (error) {
      this.logger.error('Erro ao enviar lote de notificações:', error);
      return { success: 0, failed: messages.length };
    }
  }

  /**
   * Verificar se Firebase está configurado
   */
  isConfigured(): boolean {
    return !!this.app;
  }
}
