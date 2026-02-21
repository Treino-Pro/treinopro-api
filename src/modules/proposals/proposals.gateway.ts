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
import { FirebaseNotificationService } from '../notifications/services/firebase-notification.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userType?: 'student' | 'personal';
}

@WebSocketGateway({
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ],
    credentials: true,
  },
  namespace: '/proposals',
})
export class ProposalsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ProposalsGateway.name);
  private connectedUsers = new Map<
    string,
    { socketId: string; userType: 'student' | 'personal' }
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Proposals WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Autenticar usuário via token JWT
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Cliente ${client.id} conectado sem token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.userType = payload.userType;

      // Armazenar conexão do usuário
      this.connectedUsers.set(client.userId, {
        socketId: client.id,
        userType: client.userType,
      });

      this.logger.log(
        `Usuário ${client.userId} (${client.userType}) conectado ao namespace /proposals`,
      );

      // Notificar que o usuário está online
      client.emit('connected', {
        userId: client.userId,
        userType: client.userType,
        message: 'Conectado ao sistema de propostas',
      });
    } catch (error) {
      this.logger.error(`Erro na autenticação do cliente ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.connectedUsers.delete(client.userId);
      this.logger.log(
        `Usuário ${client.userId} desconectado do namespace /proposals`,
      );
    }
  }

  /**
   * Enviar evento de proposta criada para personals próximos
   */
  async sendProposalCreated(proposalData: {
    proposal: any;
    student: any;
    nearbyPersonals: string[]; // Array de IDs dos personals próximos
  }) {
    this.logger.log(
      `Enviando evento proposal_created para ${proposalData.nearbyPersonals.length} personals`,
    );

    for (const personalId of proposalData.nearbyPersonals) {
      const userConnection = this.connectedUsers.get(personalId);

      if (userConnection) {
        // Enviar via WebSocket se o personal estiver conectado
        this.server.to(userConnection.socketId).emit('proposal_created', {
          proposal: proposalData.proposal,
          student: proposalData.student,
        });
        this.logger.log(
          `Evento proposal_created enviado via WebSocket para personal ${personalId}`,
        );
      }

      // Enviar notificação push sempre (mesmo se não estiver conectado)
      if (this.firebaseNotificationService.isConfigured()) {
        // Converter trainingDate de Date para string ISO se necessário
        const trainingDateStr =
          proposalData.proposal.trainingDate instanceof Date
            ? proposalData.proposal.trainingDate.toISOString()
            : typeof proposalData.proposal.trainingDate === 'string'
              ? proposalData.proposal.trainingDate
              : '';

        try {
          await this.firebaseNotificationService.sendProposalNotification(
            personalId,
            {
              id: proposalData.proposal.id,
              studentName:
                proposalData.student.name ||
                `${proposalData.student.firstName} ${proposalData.student.lastName}`,
              location: proposalData.proposal.locationName || '',
              time: proposalData.proposal.trainingTime || '',
              date: trainingDateStr,
              modality: proposalData.proposal.modalityName || '',
              price: proposalData.proposal.price || 0,
              expiresIn: 30,
            },
          );
          this.logger.log(
            `Notificação push enviada para personal ${personalId}`,
          );
        } catch (error) {
          this.logger.error(
            `Falha ao enviar notificação push para personal ${personalId}:`,
            error,
          );
        }
      }
    }
  }

  /**
   * Enviar evento de proposta aceita para o aluno
   */
  async sendProposalAccepted(proposalData: {
    proposal: any;
    personal: any;
    studentId: string;
  }) {
    this.logger.log(
      `Enviando evento proposal_accepted para aluno ${proposalData.studentId}`,
    );

    const userConnection = this.connectedUsers.get(proposalData.studentId);

    if (userConnection) {
      // Enviar via WebSocket se o aluno estiver conectado
      this.server.to(userConnection.socketId).emit('proposal_accepted', {
        proposal: proposalData.proposal,
        personal: proposalData.personal,
      });
      this.logger.log(
        `Evento proposal_accepted enviado via WebSocket para aluno ${proposalData.studentId}`,
      );
    }

    // Enviar notificação push sempre
    if (this.firebaseNotificationService.isConfigured()) {
      try {
        await this.firebaseNotificationService.sendProposalAcceptedNotification(
          proposalData.studentId,
          {
            id: proposalData.proposal.id,
            personalName:
              proposalData.personal.name ||
              `${proposalData.personal.firstName} ${proposalData.personal.lastName}`,
            personalPhoto:
              proposalData.personal.photo ||
              proposalData.personal.profileImageUrl,
            location: proposalData.proposal.locationName,
            classId: proposalData.proposal.classId,
          },
        );
        this.logger.log(
          `Notificação push enviada para aluno ${proposalData.studentId}`,
        );
      } catch (error) {
        this.logger.error(
          `Erro ao enviar notificação push de proposta aceita para aluno ${proposalData.studentId}:`,
          error,
        );
      }
    }
  }

  /**
   * Enviar evento de match confirmado
   */
  async sendMatchConfirmed(matchData: {
    proposal: any;
    personal: any;
    student: any;
    classId?: string;
  }) {
    this.logger.log(
      `Enviando evento match_confirmed para personal ${matchData.personal.id} e aluno ${matchData.student.id}`,
    );

    // Enviar para o personal
    const personalConnection = this.connectedUsers.get(matchData.personal.id);
    if (personalConnection) {
      this.server.to(personalConnection.socketId).emit('match_confirmed', {
        proposal: matchData.proposal,
        personal: matchData.personal,
        student: matchData.student,
        classId: matchData.classId,
      });
    }

    // Enviar para o aluno
    const studentConnection = this.connectedUsers.get(matchData.student.id);
    if (studentConnection) {
      this.server.to(studentConnection.socketId).emit('match_confirmed', {
        proposal: matchData.proposal,
        personal: matchData.personal,
        student: matchData.student,
        classId: matchData.classId,
      });
    }
  }

  /**
   * Enviar evento de aula criada
   */
  async sendClassCreated(classData: {
    class: any;
    personal: any;
    student: any;
  }) {
    this.logger.log(
      `Enviando evento class_created para personal ${classData.personal.id} e aluno ${classData.student.id}`,
    );

    // Enviar para o personal
    const personalConnection = this.connectedUsers.get(classData.personal.id);
    if (personalConnection) {
      this.server.to(personalConnection.socketId).emit('class_created', {
        class: classData.class,
        personal: classData.personal,
        student: classData.student,
      });
    }

    // Enviar para o aluno
    const studentConnection = this.connectedUsers.get(classData.student.id);
    if (studentConnection) {
      this.server.to(studentConnection.socketId).emit('class_created', {
        class: classData.class,
        personal: classData.personal,
        student: classData.student,
      });
    }
  }

  /**
   * Obter usuários conectados
   */
  getConnectedUsers(): Map<
    string,
    { socketId: string; userType: 'student' | 'personal' }
  > {
    return this.connectedUsers;
  }

  /**
   * Verificar se um usuário está conectado
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}
