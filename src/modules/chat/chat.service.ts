import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { messages, users, classes } from '../../database/schema';
import { eq, and, desc, asc, count, sql } from 'drizzle-orm';
import {
  SendMessageDto,
  GetMessagesDto,
  MarkAsReadDto,
  MessageResponseDto,
  ChatStatsDto,
} from './dto/chat.dto';
import { FirebaseNotificationService } from '../notifications/services/firebase-notification.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatService {
  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly firebaseNotificationService: FirebaseNotificationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendMessage(
    userId: string,
    sendMessageDto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const { classId, receiverId, messageText } = sendMessageDto;

    // Verificar se a classe existe e se o usuário tem acesso
    const classExists = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (classExists.length === 0) {
      throw new NotFoundException('Classe não encontrada');
    }

    const classData = classExists[0];

    // Verificar se o usuário tem acesso à classe (é aluno ou personal da classe)
    if (classData.studentId !== userId && classData.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta classe');
    }

    // Verificar se o destinatário é o outro participante da classe
    const otherParticipantId =
      classData.studentId === userId
        ? classData.personalId
        : classData.studentId;
    if (receiverId !== otherParticipantId) {
      throw new BadRequestException('Destinatário inválido para esta classe');
    }

    // Verificar se o destinatário existe
    const receiverExists = await this.db
      .select()
      .from(users)
      .where(eq(users.id, receiverId))
      .limit(1);

    if (receiverExists.length === 0) {
      throw new NotFoundException('Destinatário não encontrado');
    }

    // Criar a mensagem
    const [newMessage] = await this.db
      .insert(messages)
      .values({
        classId,
        senderId: userId,
        receiverId,
        messageText,
      })
      .returning();

    // Buscar dados completos da mensagem com informações do remetente e destinatário
    const messageWithUsers = await this.db
      .select({
        id: messages.id,
        classId: messages.classId,
        senderId: messages.senderId,
        receiverId: messages.receiverId,
        messageText: messages.messageText,
        sentAt: messages.sentAt,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
        sender: {
          id: users.id,
          name: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as(
            'name',
          ),
          profilePicture: users.profileImageId,
        },
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, newMessage.id))
      .limit(1);

    const messageResponse = messageWithUsers[0] as MessageResponseDto;

    // Enviar notificação push e in-app para destinatário
    try {
      const senderName = (messageResponse.sender as any)?.name || 'Alguém';
      const messagePreview =
        messageText.length > 50
          ? messageText.substring(0, 50) + '...'
          : messageText;

      // Enviar push notification
      await this.firebaseNotificationService.sendToUser(receiverId, {
        title: `💬 ${senderName}`,
        body: messagePreview,
        data: {
          type: 'new_message',
          classId,
          senderId: userId,
          senderName: senderName,
          messageId: newMessage.id,
          messagePreview,
        },
      });

      // Criar notificação in-app
      await this.notificationsService.sendInAppNotification(receiverId, 'new-message', {
        senderId: userId,
        senderName: senderName,
        classId: classId,
        messagePreview: messagePreview,
      });
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de mensagem:', error);
      // Não bloquear o envio da mensagem se notificação falhar
    }

    return messageResponse;
  }

  async getMessages(
    userId: string,
    getMessagesDto: GetMessagesDto,
  ): Promise<{
    messages: MessageResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { classId, page = 1, limit = 50 } = getMessagesDto;

    // Verificar se a classe existe e se o usuário tem acesso
    const classExists = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (classExists.length === 0) {
      throw new NotFoundException('Classe não encontrada');
    }

    const classData = classExists[0];

    // Verificar se o usuário tem acesso à classe
    if (classData.studentId !== userId && classData.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta classe');
    }

    // Calcular offset para paginação
    const offset = (page - 1) * limit;

    // Buscar mensagens com dados dos usuários
    const messagesWithUsers = await this.db
      .select({
        id: messages.id,
        classId: messages.classId,
        senderId: messages.senderId,
        receiverId: messages.receiverId,
        messageText: messages.messageText,
        sentAt: messages.sentAt,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
        sender: {
          id: users.id,
          name: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as(
            'name',
          ),
          profilePicture: users.profileImageId,
        },
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.classId, classId))
      .orderBy(asc(messages.sentAt))
      .limit(limit)
      .offset(offset);

    // Contar total de mensagens
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.classId, classId));

    const total = totalResult.count;
    const totalPages = Math.ceil(total / limit);

    return {
      messages: messagesWithUsers as MessageResponseDto[],
      total,
      page,
      limit,
      totalPages,
    };
  }

  async markAsRead(
    userId: string,
    markAsReadDto: MarkAsReadDto,
  ): Promise<{ success: boolean }> {
    const { classId, messageId } = markAsReadDto;

    // Verificar se a mensagem existe e se pertence ao usuário
    const messageExists = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.classId, classId),
          eq(messages.receiverId, userId),
        ),
      )
      .limit(1);

    if (messageExists.length === 0) {
      throw new NotFoundException(
        'Mensagem não encontrada ou você não é o destinatário',
      );
    }

    // Marcar como lida
    await this.db
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, messageId));

    return { success: true };
  }

  async markAllAsRead(
    userId: string,
    classId: string,
  ): Promise<{ success: boolean; updatedCount: number }> {
    // Verificar se a classe existe e se o usuário tem acesso
    const classExists = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (classExists.length === 0) {
      throw new NotFoundException('Classe não encontrada');
    }

    const classData = classExists[0];

    // Verificar se o usuário tem acesso à classe
    if (classData.studentId !== userId && classData.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta classe');
    }

    // Marcar todas as mensagens não lidas como lidas
    const result = await this.db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.classId, classId),
          eq(messages.receiverId, userId),
          eq(messages.isRead, false),
        ),
      )
      .returning({ id: messages.id });

    return {
      success: true,
      updatedCount: result.length,
    };
  }

  async getChatStats(userId: string): Promise<ChatStatsDto> {
    // Total de mensagens do usuário
    const [totalMessagesResult] = await this.db
      .select({ count: count() })
      .from(messages)
      .where(
        or(eq(messages.senderId, userId), eq(messages.receiverId, userId)),
      );

    // Mensagens não lidas recebidas pelo usuário
    const [unreadMessagesResult] = await this.db
      .select({ count: count() })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), eq(messages.isRead, false)));

    // Total de conversas (classes únicas onde o usuário participou)
    const [totalConversationsResult] = await this.db
      .select({ count: count(sql`DISTINCT ${messages.classId}`) })
      .from(messages)
      .where(
        or(eq(messages.senderId, userId), eq(messages.receiverId, userId)),
      );

    // Conversas ativas (com mensagens nos últimos 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [activeConversationsResult] = await this.db
      .select({ count: count(sql`DISTINCT ${messages.classId}`) })
      .from(messages)
      .where(
        and(
          or(eq(messages.senderId, userId), eq(messages.receiverId, userId)),
          sql`${messages.sentAt} >= ${sevenDaysAgo}`,
        ),
      );

    return {
      totalMessages: totalMessagesResult.count,
      unreadMessages: unreadMessagesResult.count,
      totalConversations: totalConversationsResult.count,
      activeConversations: activeConversationsResult.count,
    };
  }

  async getConversations(userId: string): Promise<
    Array<{
      classId: string;
      otherParticipant: {
        id: string;
        name: string;
        profilePicture?: string;
      };
      lastMessage?: {
        id: string;
        messageText: string;
        sentAt: Date;
        isRead: boolean;
      };
      unreadCount: number;
    }>
  > {
    // Buscar todas as classes onde o usuário participou
    const userClasses = await this.db
      .select({
        classId: classes.id,
        studentId: classes.studentId,
        personalId: classes.personalId,
        student: {
          id: users.id,
          name: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as(
            'name',
          ),
          profilePicture: users.profileImageId,
        },
      })
      .from(classes)
      .leftJoin(users, eq(classes.studentId, users.id))
      .where(or(eq(classes.studentId, userId), eq(classes.personalId, userId)));

    const conversations = [];

    for (const classData of userClasses) {
      const otherParticipantId =
        classData.studentId === userId
          ? classData.personalId
          : classData.studentId;

      // Buscar dados do outro participante
      const [otherParticipant] = await this.db
        .select({
          id: users.id,
          name: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as(
            'name',
          ),
          profilePicture: users.profileImageId,
        })
        .from(users)
        .where(eq(users.id, otherParticipantId))
        .limit(1);

      // Buscar última mensagem da conversa
      const [lastMessage] = await this.db
        .select({
          id: messages.id,
          messageText: messages.messageText,
          sentAt: messages.sentAt,
          isRead: messages.isRead,
        })
        .from(messages)
        .where(eq(messages.classId, classData.classId))
        .orderBy(desc(messages.sentAt))
        .limit(1);

      // Contar mensagens não lidas
      const [unreadCountResult] = await this.db
        .select({ count: count() })
        .from(messages)
        .where(
          and(
            eq(messages.classId, classData.classId),
            eq(messages.receiverId, userId),
            eq(messages.isRead, false),
          ),
        );

      conversations.push({
        classId: classData.classId,
        otherParticipant: otherParticipant || {
          id: otherParticipantId,
          name: 'Usuário',
        },
        lastMessage: lastMessage || undefined,
        unreadCount: unreadCountResult.count,
      });
    }

    // Ordenar por última mensagem
    conversations.sort((a, b) => {
      if (!a.lastMessage && !b.lastMessage) return 0;
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return (
        new Date(b.lastMessage.sentAt).getTime() -
        new Date(a.lastMessage.sentAt).getTime()
      );
    });

    return conversations;
  }
}

// Import necessário para o operador 'or'
import { or } from 'drizzle-orm';
