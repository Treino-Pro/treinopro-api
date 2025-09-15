import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { SendMessageDto, WebSocketMessageDto } from './dto/chat.dto';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userType?: 'student' | 'personal';
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private connectedUsers = new Map<string, string>(); // userId -> socketId

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extrair token do handshake
      const token = this.extractTokenFromSocket(client);
      
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Verificar e decodificar o token
      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.userType = payload.userType;

      // Armazenar conexão do usuário
      this.connectedUsers.set(client.userId, client.id);

      // Notificar que o usuário está online
      this.server.emit('user_online', {
        userId: client.userId,
        userType: client.userType,
        timestamp: new Date(),
      });

      this.logger.log(`User ${client.userId} connected with socket ${client.id}`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.connectedUsers.delete(client.userId);
      
      // Notificar que o usuário está offline
      this.server.emit('user_offline', {
        userId: client.userId,
        userType: client.userType,
        timestamp: new Date(),
      });

      this.logger.log(`User ${client.userId} disconnected`);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() sendMessageDto: SendMessageDto,
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Usuário não autenticado' });
        return;
      }

      // Enviar mensagem via serviço
      const message = await this.chatService.sendMessage(client.userId, sendMessageDto);

      // Criar evento WebSocket
      const wsMessage: WebSocketMessageDto = {
        type: 'message_sent',
        data: message,
        userId: client.userId,
        timestamp: new Date(),
      };

      // Enviar para o remetente
      client.emit('message_sent', wsMessage);

      // Enviar para o destinatário se estiver conectado
      const receiverSocketId = this.connectedUsers.get(sendMessageDto.receiverId);
      if (receiverSocketId) {
        const receiverSocket = this.server.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
          receiverSocket.emit('message_received', {
            ...wsMessage,
            type: 'message_received',
          });
        }
      }

      // Notificar todos os clientes conectados à classe sobre a nova mensagem
      this.server.to(`class_${sendMessageDto.classId}`).emit('new_message', {
        classId: sendMessageDto.classId,
        message,
        timestamp: new Date(),
      });

    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`);
      client.emit('error', { 
        message: error.message || 'Erro ao enviar mensagem' 
      });
    }
  }

  @SubscribeMessage('join_class')
  async handleJoinClass(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { classId: string },
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Usuário não autenticado' });
        return;
      }

      // Adicionar o cliente à sala da classe
      await client.join(`class_${data.classId}`);
      
      this.logger.log(`User ${client.userId} joined class ${data.classId}`);
      
      client.emit('joined_class', { 
        classId: data.classId,
        timestamp: new Date(),
      });

    } catch (error) {
      this.logger.error(`Error joining class: ${error.message}`);
      client.emit('error', { 
        message: error.message || 'Erro ao entrar na classe' 
      });
    }
  }

  @SubscribeMessage('leave_class')
  async handleLeaveClass(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { classId: string },
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Usuário não autenticado' });
        return;
      }

      // Remover o cliente da sala da classe
      await client.leave(`class_${data.classId}`);
      
      this.logger.log(`User ${client.userId} left class ${data.classId}`);
      
      client.emit('left_class', { 
        classId: data.classId,
        timestamp: new Date(),
      });

    } catch (error) {
      this.logger.error(`Error leaving class: ${error.message}`);
      client.emit('error', { 
        message: error.message || 'Erro ao sair da classe' 
      });
    }
  }

  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { classId: string, receiverId: string },
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Usuário não autenticado' });
        return;
      }

      // Notificar o destinatário que o usuário está digitando
      const receiverSocketId = this.connectedUsers.get(data.receiverId);
      if (receiverSocketId) {
        const receiverSocket = this.server.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
          receiverSocket.emit('typing_start', {
            classId: data.classId,
            userId: client.userId,
            userType: client.userType,
            timestamp: new Date(),
          });
        }
      }

    } catch (error) {
      this.logger.error(`Error handling typing start: ${error.message}`);
    }
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { classId: string, receiverId: string },
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Usuário não autenticado' });
        return;
      }

      // Notificar o destinatário que o usuário parou de digitar
      const receiverSocketId = this.connectedUsers.get(data.receiverId);
      if (receiverSocketId) {
        const receiverSocket = this.server.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
          receiverSocket.emit('typing_stop', {
            classId: data.classId,
            userId: client.userId,
            userType: client.userType,
            timestamp: new Date(),
          });
        }
      }

    } catch (error) {
      this.logger.error(`Error handling typing stop: ${error.message}`);
    }
  }

  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { classId: string, messageId: string },
  ) {
    try {
      if (!client.userId) {
        client.emit('error', { message: 'Usuário não autenticado' });
        return;
      }

      // Marcar mensagem como lida
      await this.chatService.markAsRead(client.userId, {
        classId: data.classId,
        messageId: data.messageId,
      });

      // Notificar o remetente que a mensagem foi lida
      this.server.to(`class_${data.classId}`).emit('message_read', {
        classId: data.classId,
        messageId: data.messageId,
        readBy: client.userId,
        timestamp: new Date(),
      });

    } catch (error) {
      this.logger.error(`Error marking message as read: ${error.message}`);
      client.emit('error', { 
        message: error.message || 'Erro ao marcar mensagem como lida' 
      });
    }
  }

  // Método para enviar notificações de propostas
  async notifyProposalUpdate(classId: string, proposalData: any) {
    this.server.to(`class_${classId}`).emit('proposal_update', {
      classId,
      proposal: proposalData,
      timestamp: new Date(),
    });
  }

  // Método para enviar notificações de início/fim de aula
  async notifyClassUpdate(classId: string, classData: any, updateType: 'started' | 'completed' | 'cancelled') {
    this.server.to(`class_${classId}`).emit('class_update', {
      classId,
      class: classData,
      updateType,
      timestamp: new Date(),
    });
  }

  // Método para verificar se um usuário está online
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  // Método para obter socket de um usuário
  getUserSocket(userId: string): Socket | undefined {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      return this.server.sockets.sockets.get(socketId);
    }
    return undefined;
  }

  private extractTokenFromSocket(client: Socket): string | null {
    // Tentar extrair token do header Authorization
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Tentar extrair token dos query parameters
    const token = client.handshake.query.token as string;
    if (token) {
      return token;
    }

    // Tentar extrair token do handshake auth
    const auth = client.handshake.auth;
    if (auth && auth.token) {
      return auth.token;
    }

    return null;
  }
}
