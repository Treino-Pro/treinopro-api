import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Inject, Logger } from '@nestjs/common';
import { eq, and, gte, lte, desc, count, sql, or, inArray } from 'drizzle-orm';
import * as crypto from 'crypto';
import {
  classes,
  users,
  proposals,
  ratings,
  payments,
  files,
  classPresenceSnapshots,
} from '../../database/schema';
import { GamificationService } from '../gamification/gamification.service';
import { ChatGateway } from '../chat/chat.gateway';
import { PaymentsService } from '../payments/payments.service';
import { RatingsService } from '../ratings/ratings.service';
import { FirebaseNotificationService } from '../notifications/services/firebase-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateClassDto,
  UpdateClassDto,
  GetClassesDto,
  ClassResponseDto,
  ClassStatsDto,
  ClassStatus,
  ClassDisputeStatus,
  StartClassDto,
  CompleteClassDto,
  ConfirmClassStartDto,
  ReportNoShowDto,
  ResolveNoShowDisputeDto,
  ClassTimelineDto,
  DisputeDefenseDto,
  PresenceSnapshotDto,
} from './dto/classes.dto';
import { FeatureFlags } from '../../config/feature-flags';

const MINIMUM_COMPLETION_MINUTES = 1;
const MINIMUM_COMPLETION_MS = MINIMUM_COMPLETION_MINUTES * 60 * 1000;

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    private readonly gamificationService: GamificationService,
    private readonly chatGateway: ChatGateway,
    private readonly paymentsService: PaymentsService,
    private readonly ratingsService: RatingsService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createClass(
    createClassDto: CreateClassDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    // Verificar se o usuário é o aluno da proposta
    const proposal = await this.db.query.proposals.findFirst({
      where: eq(proposals.id, createClassDto.proposalId),
    });

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    if (proposal.studentId !== userId) {
      throw new ForbiddenException(
        'Você não pode criar uma aula para esta proposta',
      );
    }

    if (proposal.status !== 'accepted') {
      throw new BadRequestException(
        'A proposta deve estar aceita para criar uma aula',
      );
    }

    // Verificar se já existe uma aula para esta proposta
    const existingClass = await this.db.query.classes.findFirst({
      where: eq(classes.proposalId, createClassDto.proposalId),
    });

    if (existingClass) {
      throw new BadRequestException('Já existe uma aula para esta proposta');
    }

    // ===== VALIDAR CONFLITO DE HORÁRIO PARA O PERSONAL =====
    {
      const classDate = new Date(createClassDto.date);
      const startOfDay = new Date(classDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(classDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingClasses = await this.db
        .select()
        .from(classes)
        .where(
          and(
            eq(classes.personalId, proposal.personalId),
            gte(classes.date, startOfDay),
            lte(classes.date, endOfDay),
            or(
              eq(classes.status, ClassStatus.SCHEDULED),
              eq(classes.status, ClassStatus.PENDING_CONFIRMATION),
              eq(classes.status, ClassStatus.ACTIVE),
            ),
          ),
        );

      const [h, m] = String(createClassDto.time || '00:00')
        .split(':')
        .map((v: string) => parseInt(v, 10));
      const proposedStart = new Date(classDate);
      proposedStart.setHours(h || 0, m || 0, 0, 0);
      const proposedEnd = new Date(
        proposedStart.getTime() + (createClassDto.duration || 60) * 60 * 1000,
      );

      const hasConflict = existingClasses.some((cls: any) => {
        const d = new Date(cls.date);
        const [ch, cm] = String(cls.time || '00:00')
          .split(':')
          .map((v: string) => parseInt(v, 10));
        const classStart = new Date(d);
        classStart.setHours(ch || 0, cm || 0, 0, 0);
        const classEnd = new Date(
          classStart.getTime() + (cls.duration || 60) * 60 * 1000,
        );
        return !(proposedEnd <= classStart || proposedStart >= classEnd);
      });

      if (hasConflict) {
        throw new BadRequestException(
          'Conflito de horário: o personal já possui aula nesse período.',
        );
      }
    }

    // Criar a aula
    const [newClass] = await this.db
      .insert(classes)
      .values({
        ...createClassDto,
        date: new Date(createClassDto.date),
      })
      .returning();

    // Buscar a modalidade da proposta para incluir na resposta
    const proposalWithModality = await this.db.query.proposals.findFirst({
      where: eq(proposals.id, createClassDto.proposalId),
      columns: {
        id: true,
        modalityName: true,
        value: true,
      },
    });

    // Adicionar dados da proposta ao objeto da aula
    const classWithProposal = {
      ...newClass,
      proposal: proposalWithModality
        ? {
            id: proposalWithModality.id,
            modality: proposalWithModality.modalityName,
            value: proposalWithModality.value,
          }
        : null,
      proposalModality: proposalWithModality?.modalityName || null,
    };

    return await this.formatClassResponse(classWithProposal); // Incluir proposal na criação
  }

  async getClassById(id: string, userId: string): Promise<ClassResponseDto> {
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, id),
      with: {
        student: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
          },
        },
        personal: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
          },
        },
        proposal: {
          columns: {
            id: true,
            modality: true,
            value: true,
          },
        },
      },
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    // Verificar se o usuário tem acesso à aula
    if (classData.studentId !== userId && classData.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta aula');
    }

    return await this.formatClassResponse(classData);
  }

  async updateClass(
    id: string,
    updateClassDto: UpdateClassDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    const classData = await this.getClassById(id, userId);

    // Verificar se o usuário pode editar a aula
    if (
      classData.status === ClassStatus.COMPLETED ||
      classData.status === ClassStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Não é possível editar uma aula concluída ou cancelada',
      );
    }

    // Apenas o personal pode editar a aula
    if (classData.personalId !== userId) {
      throw new ForbiddenException(
        'Apenas o personal trainer pode editar a aula',
      );
    }

    // ===== VALIDAR CONFLITO DE HORÁRIO (SE ALTERAR DATA/HORA/DURAÇÃO) =====
    if (updateClassDto.date || updateClassDto.time || updateClassDto.duration) {
      const newDate = updateClassDto.date
        ? new Date(updateClassDto.date)
        : new Date(classData.date);
      const newTime = updateClassDto.time ?? classData.time;
      const newDuration = updateClassDto.duration ?? classData.duration;

      const startOfDay = new Date(newDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(newDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingClasses = await this.db
        .select()
        .from(classes)
        .where(
          and(
            eq(classes.personalId, classData.personalId),
            gte(classes.date, startOfDay),
            lte(classes.date, endOfDay),
            or(
              eq(classes.status, ClassStatus.SCHEDULED),
              eq(classes.status, ClassStatus.PENDING_CONFIRMATION),
              eq(classes.status, ClassStatus.ACTIVE),
            ),
          ),
        );

      const [h, m] = String(newTime || '00:00')
        .split(':')
        .map((v: string) => parseInt(v, 10));
      const proposedStart = new Date(newDate);
      proposedStart.setHours(h || 0, m || 0, 0, 0);
      const proposedEnd = new Date(
        proposedStart.getTime() + (newDuration || 60) * 60 * 1000,
      );

      const hasConflict = existingClasses.some((cls: any) => {
        if (cls.id === id) return false; // ignorar a própria aula
        const d = new Date(cls.date);
        const [ch, cm] = String(cls.time || '00:00')
          .split(':')
          .map((v: string) => parseInt(v, 10));
        const classStart = new Date(d);
        classStart.setHours(ch || 0, cm || 0, 0, 0);
        const classEnd = new Date(
          classStart.getTime() + (cls.duration || 60) * 60 * 1000,
        );
        return !(proposedEnd <= classStart || proposedStart >= classEnd);
      });

      if (hasConflict) {
        throw new BadRequestException(
          'Conflito de horário: o personal já possui aula nesse período.',
        );
      }
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        ...updateClassDto,
        date: updateClassDto.date ? new Date(updateClassDto.date) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, id))
      .returning();

    return this.formatClassResponse(updatedClass);
  }

  async completeClass(
    id: string,
    completeClassDto: CompleteClassDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    console.log('🔍 [COMPLETE_CLASS] Iniciando finalização da aula:');
    console.log('🔍 [COMPLETE_CLASS] ID:', id);
    console.log('🔍 [COMPLETE_CLASS] User ID:', userId);
    console.log('🔍 [COMPLETE_CLASS] DTO:', completeClassDto);

    const classData = await this.getClassById(id, userId);
    console.log('🔍 [COMPLETE_CLASS] Class Data:', {
      id: classData.id,
      status: classData.status,
      personalId: classData.personalId,
      startedAt: classData.startedAt,
    });

    // Verificar se o usuário é o personal trainer
    if (classData.personalId !== userId) {
      console.log('❌ [COMPLETE_CLASS] Erro: Usuário não é o personal trainer');
      throw new ForbiddenException(
        'Apenas o personal trainer pode finalizar a aula',
      );
    }

    // Verificar se a aula pode ser finalizada
    if (classData.status !== ClassStatus.ACTIVE) {
      console.log(
        '❌ [COMPLETE_CLASS] Erro: Aula não está ativa. Status:',
        classData.status,
      );

      if (classData.status === ClassStatus.COMPLETED) {
        throw new BadRequestException(
          'Esta aula já foi finalizada anteriormente',
        );
      } else {
        throw new BadRequestException(
          `Apenas aulas ativas podem ser finalizadas. Status atual: ${classData.status}`,
        );
      }
    }

    // Verificar regra de tempo mínimo para finalização
    // Kill switch: KILL_MIN_45_RULE=true desativa enforcement
    if (classData.startedAt && FeatureFlags.KILL_MIN_45_RULE) {
      console.warn(
        `[CLASSES] KILL_SWITCH_ACTIVE: regra ${MINIMUM_COMPLETION_MINUTES}min desativada (KILL_MIN_45_RULE=true)`,
        { classId: id, personalId: userId },
      );
    }
    if (classData.startedAt && !FeatureFlags.KILL_MIN_45_RULE) {
      const now = new Date();
      const rawClassData = await this.db.query.classes.findFirst({
        where: eq(classes.id, id),
        columns: { minimumCompletionAt: true },
      });
      const minimumCompletionAt = rawClassData?.minimumCompletionAt
        ? new Date(rawClassData.minimumCompletionAt)
        : new Date(
            (classData.startedAt as Date).getTime() + MINIMUM_COMPLETION_MS,
          );

      if (now < minimumCompletionAt) {
        const remainingMs = minimumCompletionAt.getTime() - now.getTime();
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new BadRequestException(
          `MIN_45_RULE: A aula deve durar pelo menos ${MINIMUM_COMPLETION_MINUTES} minuto(s). Faltam ${remainingMin} minuto(s).`,
        );
      }
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.COMPLETED,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classes.id, id))
      .returning();

    // ===== ATUALIZAR PROPOSTA VINCULADA PARA 'completed' =====
    try {
      const relatedProposal = await this.db.query.proposals.findFirst({
        where: eq(proposals.id, classData.proposalId),
        columns: { id: true, status: true },
      });

      if (
        relatedProposal &&
        (relatedProposal.status === 'matched' ||
          relatedProposal.status === 'accepted')
      ) {
        await this.db
          .update(proposals)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(proposals.id, relatedProposal.id));
      }
    } catch (err) {
      console.warn(
        '⚠️ [CLASSES] Não foi possível atualizar status da proposta vinculada:',
        err?.message || err,
      );
    }

    // ===== INTEGRAÇÃO COM GAMIFICAÇÃO =====
    try {
      await this.gamificationService.processClassCompletion(
        classData.studentId,
        id,
      );
      await this.gamificationService.processClassCompletion(userId, id);
    } catch (error) {
      console.error('❌ [GAMIFICATION] Erro ao processar XP da aula:', error);
      console.error('❌ [GAMIFICATION] Stack trace:', error.stack);
      // Não falhar a operação se a gamificação falhar
    }

    // ===== APLICAR SPLIT E ATUALIZAR CARTEIRA APÓS CONCLUSÃO DA AULA =====
    try {
      // Buscar pagamento da aula
      let payment = await this.findPaymentForClass(id, classData.proposalId);
      if (payment) {
        payment = await this.ensurePaymentLinkedToClass(
          payment,
          id,
          classData.personalId,
        );
      }
      if (payment) {
        if (payment.status === 'authorized' || payment.status === 'pending') {
          await this.paymentsService.capturePaymentAfterClass(
            id,
            'Aula concluída',
          );

          // Enviar notificação push e in-app para personal sobre repasse
          const personalAmount = payment.personalAmount || 0;

          // 1. Push Notification
          try {
            await this.firebaseNotificationService.sendToUser(userId, {
              title: '💰 Repasse Realizado',
              body: `R$ ${personalAmount.toFixed(2)} foi transferido para sua carteira`,
              data: {
                type: 'payment_received',
                classId: id,
                amount: personalAmount.toString(),
                description: `Repasse da aula ${classData.date}`,
              },
            });
          } catch (error) {
            console.error(
              '❌ [COMPLETE_CLASS] Erro ao enviar push de repasse:',
              error,
            );
          }

          // 2. In-App Notification
          try {
            await this.notificationsService.sendInAppNotification(
              userId,
              'payment-received',
              {
                classId: id,
                amount: personalAmount.toFixed(2),
                description: `Repasse da aula ${classData.date}`,
              },
            );
          } catch (error) {
            console.error(
              '❌ [COMPLETE_CLASS] Erro ao enviar notificação in-app de repasse:',
              error,
            );
          }
        } else if (payment.status === 'captured') {
          // Já capturado: split e carteira devem ter sido aplicados no fluxo de pagamentos (webhook/capture)
          console.log(
            'ℹ️ [COMPLETE_CLASS] Pagamento já está capturado - nenhum repasse adicional necessário',
          );
        } else {
          console.log(
            '⚠️ [COMPLETE_CLASS] Pagamento com status inesperado para repasse:',
            {
              paymentStatus: payment.status,
              expectedStatuses: ['authorized', 'captured'],
            },
          );
        }
      } else {
        console.log(
          '⚠️ [COMPLETE_CLASS] Nenhum pagamento encontrado para esta aula',
        );
      }
    } catch (error) {
      console.error(
        '❌ [COMPLETE_CLASS] Erro ao aplicar split após conclusão:',
        error,
      );
      console.error('❌ [COMPLETE_CLASS] Stack trace:', error.stack);
      // Não falhar a operação se a atualização de carteira falhar
      // Mas logar o erro para investigação
    }

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);
      // Buscar valor correto do repasse (personalAmount) para notificação
      let personalAmountValue = 0;
      try {
        let paymentForWs = await this.findPaymentForClass(
          id,
          classData.proposalId,
        );
        if (paymentForWs) {
          paymentForWs = await this.ensurePaymentLinkedToClass(
            paymentForWs,
            id,
            classData.personalId,
          );
        }
        personalAmountValue = paymentForWs
          ? Number(paymentForWs.personalAmount)
          : 0;
      } catch (e) {
        console.warn(
          '⚠️ [COMPLETE_CLASS] Falha ao buscar pagamento para evento financeiro:',
          e,
        );
      }

      // Evento de timer expirado (mesmo que quando timer chega a 0)
      this.chatGateway.server.emit('class_timer_expired', {
        classId: id,
        action: 'timer_expired',
        class: classResponse,
        personalId: classData.personalId,
        studentId: classData.studentId,
        timestamp: new Date(),
      });

      // Evento de aula completada (mesmo que quando timer chega a 0)
      this.chatGateway.server.emit('class_update', {
        action: 'class_completed_by_timer',
        class: classResponse,
        personalId: classData.personalId,
        studentId: classData.studentId,
        timestamp: new Date(),
      });

      // Evento específico de dados financeiros para o personal (pagamento liberado)
      if (personalAmountValue > 0) {
        this.chatGateway.server.emit('financial_update', {
          action: 'payment_released',
          class: classResponse,
          financial: {
            classId: id,
            amount: personalAmountValue,
          },
          userId: userId,
          timestamp: new Date(),
        });
      } else {
        this.logger.warn(
          `[COMPLETE_CLASS] financial_update suprimido para aula ${id} (amount=${personalAmountValue})`,
        );
      }
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir eventos WebSocket:', error);
      // Não falhar a operação por causa de problemas de WebSocket
    }

    return this.formatClassResponse(updatedClass);
  }

  // Finalizar aula automaticamente quando timer expira
  async completeClassByTimerExpiration(
    classId: string,
  ): Promise<ClassResponseDto> {
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, classId),
      with: {
        student: true,
        personal: true,
        proposal: true,
      },
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    if (classData.status !== ClassStatus.ACTIVE) {
      console.log(
        '⚠️ [TIMER_EXPIRATION] Aula não está ativa, ignorando expiração. Status:',
        classData.status,
      );
      return this.formatClassResponse(classData);
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.COMPLETED,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    // Atualizar proposta vinculada
    try {
      await this.db
        .update(proposals)
        .set({
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, classData.proposalId));
    } catch (err) {
      console.warn('⚠️ [TIMER_EXPIRATION] Erro ao atualizar proposta:', err);
    }

    // ===== PROCESSAR GAMIFICAÇÃO =====
    try {
      console.log(
        '🎯 [TIMER_EXPIRATION] Processando gamificação para aluno e personal...',
      );

      // Processar gamificação para o aluno
      await this.gamificationService.processClassCompletion(
        classData.studentId,
        classId,
      );
      console.log(
        '✅ [TIMER_EXPIRATION] Gamificação processada para aluno:',
        classData.studentId,
      );

      // Processar gamificação para o personal trainer
      await this.gamificationService.processClassCompletion(
        classData.personalId,
        classId,
      );
      console.log(
        '✅ [TIMER_EXPIRATION] Gamificação processada para personal:',
        classData.personalId,
      );
    } catch (error) {
      console.error(
        '❌ [TIMER_EXPIRATION] Erro ao processar gamificação:',
        error,
      );
    }

    // ===== CAPTURAR PAGAMENTO E APLICAR SPLIT (SE EM CUSTÓDIA) =====
    try {
      let payment = await this.findPaymentForClass(
        classId,
        classData.proposalId,
      );
      if (payment) {
        payment = await this.ensurePaymentLinkedToClass(
          payment,
          classId,
          classData.personalId,
        );
      }
      if (payment) {
        if (payment.status === 'authorized' || payment.status === 'pending') {
          console.log(
            '✅ [TIMER_EXPIRATION] Pagamento em custódia - iniciando captura e split',
          );
          await this.paymentsService.capturePaymentAfterClass(
            classId,
            'Aula concluída por expiração do timer',
          );
          console.log(
            '✅ [TIMER_EXPIRATION] Pagamento capturado e split aplicado via PaymentsService',
          );
        } else if (payment.status === 'captured') {
          console.log(
            'ℹ️ [TIMER_EXPIRATION] Pagamento já capturado - nenhum repasse adicional necessário',
          );
        }
      } else {
        console.log(
          '⚠️ [TIMER_EXPIRATION] Nenhum pagamento encontrado para esta aula',
        );
      }
    } catch (error) {
      console.error(
        '❌ [TIMER_EXPIRATION] Erro ao capturar pagamento após expiração:',
        error,
      );
    }

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);
      // Buscar valor correto do repasse (personalAmount) para notificação
      let personalAmountValue = 0;
      try {
        let paymentForWs = await this.findPaymentForClass(
          classId,
          classData.proposalId,
        );
        if (paymentForWs) {
          paymentForWs = await this.ensurePaymentLinkedToClass(
            paymentForWs,
            classId,
            classData.personalId,
          );
        }
        personalAmountValue = paymentForWs
          ? Number(paymentForWs.personalAmount)
          : 0;
      } catch (e) {
        console.warn(
          '⚠️ [TIMER_EXPIRATION] Falha ao buscar pagamento para evento financeiro:',
          e,
        );
      }

      // Evento de timer expirado
      this.chatGateway.server.emit('class_timer_expired', {
        classId,
        action: 'timer_expired',
        class: classResponse,
        personalId: classData.personalId,
        studentId: classData.studentId,
        timestamp: new Date(),
      });

      // Evento de aula completada
      this.chatGateway.server.emit('class_update', {
        action: 'class_completed_by_timer',
        class: classResponse,
        personalId: classData.personalId,
        studentId: classData.studentId,
        timestamp: new Date(),
      });

      // Evento específico de dados financeiros para o personal (pagamento liberado)
      if (personalAmountValue > 0) {
        this.chatGateway.server.emit('financial_update', {
          action: 'payment_released',
          class: classResponse,
          financial: {
            classId: classId,
            amount: personalAmountValue,
          },
          userId: classData.personalId,
          timestamp: new Date(),
        });
      } else {
        this.logger.warn(
          `[TIMER_EXPIRATION] financial_update suprimido para aula ${classId} (amount=${personalAmountValue})`,
        );
      }

      console.log('✅ [TIMER_EXPIRATION] Eventos WebSocket emitidos');
    } catch (error) {
      console.error(
        '❌ [TIMER_EXPIRATION] Erro ao emitir eventos WebSocket:',
        error,
      );
    }

    return this.formatClassResponse(updatedClass);
  }

  async cancelClass(id: string, userId: string): Promise<ClassResponseDto> {
    const classData = await this.getClassById(id, userId);

    // Verificar se a aula pode ser cancelada
    if (
      classData.status === ClassStatus.COMPLETED ||
      classData.status === ClassStatus.CANCELLED
    ) {
      throw new BadRequestException('A aula não pode ser cancelada');
    }

    // Verificar se o usuário pode cancelar (aluno ou personal)
    if (classData.studentId !== userId && classData.personalId !== userId) {
      throw new ForbiddenException('Você não pode cancelar esta aula');
    }

    const isStudentCancelling = classData.studentId === userId;
    const isPersonalCancelling = classData.personalId === userId;

    let shouldRefund = false;
    let refundReason = '';

    // Regra 1: Aluno cancelando dentro da janela de 2h (para aulas agendadas, pendentes ou ativas)
    if (
      isStudentCancelling &&
      [
        ClassStatus.SCHEDULED,
        ClassStatus.PENDING_CONFIRMATION,
        ClassStatus.ACTIVE,
      ].includes(classData.status)
    ) {
      const now = new Date();
      const classDateTime = new Date(
        `${(classData.date as Date).toISOString().split('T')[0]}T${
          classData.time
        }`,
      );
      const cancellationDeadline = new Date(
        classDateTime.getTime() - 2 * 60 * 60 * 1000,
      );
      if (now > cancellationDeadline) {
        throw new BadRequestException(
          'Cancelamento pelo aluno só é permitido até 2 horas antes da aula. Para cancelamentos tardios, entre em contato com o suporte.',
        );
      }
      shouldRefund = true;
      refundReason = 'Cancelamento pelo aluno com antecedência mínima';
    }

    // Regra 2: Personal cancelando (sempre reembolsa o aluno)
    if (isPersonalCancelling) {
      shouldRefund = true;
      refundReason = 'Cancelamento pelo personal trainer';
    }

    // ===== ETAPA 1: REEMBOLSO (SE APLICÁVEL) =====
    // Esta operação acontece ANTES de marcar a aula como cancelada.
    // Se o reembolso falhar, a operação inteira é abortada.
    if (shouldRefund) {
      try {
        await this.paymentsService.cancelPaymentBeforeClass(id, refundReason);
        this.logger.log(
          `[CANCEL_CLASS] Reembolso para aula ${id} processado com sucesso. Motivo: ${refundReason}`,
        );
      } catch (err: any) {
        if (err instanceof NotFoundException) {
          const proposalValue = classData.proposal?.value || 0;
          if (proposalValue > 0) {
            this.logger.error(
              `[CRITICAL_CANCELLATION_FAILURE] Pagamento ausente para aula paga (valor: ${proposalValue}). Risco financeiro.`,
            );
            throw new BadRequestException(
              `Inconsistência financeira detectada: Pagamento não localizado para efetuar o reembolso. O cancelamento foi abortado. Entre em contato com o suporte.`,
            );
          } else {
            this.logger.warn(
              `[CANCEL_CLASS_WARNING] Nenhum pagamento encontrado para a aula ${id}, mas a proposta não possui valor associado. Prosseguindo com o cancelamento.`,
            );
          }
        } else {
          this.logger.error(
            `[CRITICAL_CANCELLATION_FAILURE] Falha ao processar reembolso para aula ${id}. A aula NÃO foi cancelada. Erro: ${err.message}`,
          );
          throw new BadRequestException(
            `Não foi possível processar o reembolso para esta aula e o cancelamento foi abortado. Por favor, tente novamente ou contate o suporte.`,
          );
        }
      }
    }

    // ===== ETAPA 2: ATUALIZAR STATUS DA AULA =====
    // Só executa se o reembolso (se necessário) foi bem-sucedido.
    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, id))
      .returning();

    // ===== ETAPA 3: ATUALIZAR STATUS DA PROPOSTA ASSOCIADA =====
    if (classData.proposalId) {
      try {
        await this.db
          .update(proposals)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(proposals.id, classData.proposalId));

        this.logger.log(
          `[CANCEL_CLASS] Status da proposta ${classData.proposalId} atualizado para 'cancelled'`,
        );
      } catch (error) {
        this.logger.error(
          `[CANCEL_CLASS] Erro ao atualizar status da proposta ${classData.proposalId}:`,
          error,
        );
      }
    }

    // ===== ETAPA 4: EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);

      // Evento para ambos os usuários (aluno e personal)
      this.chatGateway.server.emit('class_update', {
        action: 'class_cancelled',
        class: classResponse,
        personalId: classData.personalId,
        studentId: classData.studentId,
        cancelledBy: userId,
        timestamp: new Date(),
      });

      this.logger.log(
        '[CANCEL_CLASS] Evento WebSocket emitido: class_cancelled',
      );
    } catch (error) {
      this.logger.error(
        '[CANCEL_CLASS] Erro ao emitir evento WebSocket:',
        error,
      );
    }

    return this.formatClassResponse(updatedClass);
  }

  private async findPaymentForClass(
    classId: string,
    proposalId?: string,
  ): Promise<any | null> {
    let payment = await this.db.query.payments.findFirst({
      where: eq(payments.classId, classId),
    });

    if (!payment && proposalId) {
      payment = await this.db.query.payments.findFirst({
        where: eq(payments.proposalId, proposalId),
      });
    }

    return payment ?? null;
  }

  private async ensurePaymentLinkedToClass(
    payment: any,
    classId: string,
    personalId?: string,
  ): Promise<any> {
    const shouldUpdateClassId = payment.classId !== classId;
    const shouldUpdatePersonalId =
      personalId != null && payment.personalId !== personalId;

    if (!shouldUpdateClassId && !shouldUpdatePersonalId) {
      return payment;
    }

    await this.db
      .update(payments)
      .set({
        classId,
        personalId: personalId ?? payment.personalId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    return {
      ...payment,
      classId,
      personalId: personalId ?? payment.personalId ?? null,
    };
  }

  async getClassStats(userId: string): Promise<ClassStatsDto> {
    // Buscar estatísticas das aulas do usuário
    const stats = await this.db
      .select({
        status: classes.status,
        duration: classes.duration,
        count: count(),
      })
      .from(classes)
      .where(or(eq(classes.studentId, userId), eq(classes.personalId, userId)))
      .groupBy(classes.status, classes.duration);

    const result = {
      total: 0,
      scheduled: 0,
      pendingConfirmation: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      noShowDispute: 0,
      custody: 0,
      totalDuration: 0,
      averageDuration: 0,
    };

    stats.forEach((stat) => {
      result.total += stat.count;
      result[stat.status] += stat.count;
      result.totalDuration += stat.duration * stat.count;
    });

    result.averageDuration =
      result.total > 0 ? Math.round(result.totalDuration / result.total) : 0;

    return result;
  }

  async getClassTimeline(
    classId: string,
    userId: string,
  ): Promise<ClassTimelineDto> {
    const classData = await this.getClassById(classId, userId);
    const rawClass = await this.db.query.classes.findFirst({
      where: eq(classes.id, classId),
      columns: { minimumCompletionAt: true, startedAt: true },
    });
    const now = new Date();
    const classDateTime = new Date(
      `${(classData.date as Date).toISOString().split('T')[0]}T${classData.time}`,
    );

    // Calcular deadlines
    const cancellationDeadline = new Date(
      classDateTime.getTime() - 2 * 60 * 60 * 1000,
    ); // 2h antes
    const noShowReportDeadline = new Date(
      classDateTime.getTime() + 10 * 60 * 1000,
    ); // 10min depois

    // Lógica dos botões baseada no tempo
    const canCancel =
      now < cancellationDeadline && classData.status === ClassStatus.SCHEDULED;
    const canStart =
      now >= new Date(classDateTime.getTime() - 30 * 60 * 1000) &&
      now <= new Date(classDateTime.getTime() + 10 * 60 * 1000) &&
      (classData.status === ClassStatus.SCHEDULED ||
        classData.status === ClassStatus.PENDING_CONFIRMATION);
    const canReportNoShow =
      now >= noShowReportDeadline &&
      (classData.status === ClassStatus.PENDING_CONFIRMATION ||
        classData.status === ClassStatus.SCHEDULED);
    const canConfirmStart =
      classData.status === ClassStatus.PENDING_CONFIRMATION;
    const canReportPersonalNoShow =
      now >= noShowReportDeadline &&
      (classData.status === ClassStatus.PENDING_CONFIRMATION ||
        classData.status === ClassStatus.SCHEDULED);

    // Regra de tempo mínimo para finalização
    let minimumCompletionAt: Date | undefined;
    let remainingToCompleteSeconds: number | undefined;
    let canComplete = false;

    if (classData.status === ClassStatus.ACTIVE && rawClass?.startedAt) {
      const minAt = rawClass.minimumCompletionAt
        ? new Date(rawClass.minimumCompletionAt)
        : new Date(
            new Date(rawClass.startedAt).getTime() + MINIMUM_COMPLETION_MS,
          );
      minimumCompletionAt = minAt;
      const remainingMs = Math.max(0, minAt.getTime() - now.getTime());
      remainingToCompleteSeconds = Math.ceil(remainingMs / 1000);
      canComplete = now >= minAt;
    }

    // Verificar snapshot de presença do usuário atual
    let hasPresenceSnapshot = false;
    try {
      const snapshot = await this.db.query.classPresenceSnapshots.findFirst({
        where: and(
          eq(classPresenceSnapshots.classId, classId),
          eq(classPresenceSnapshots.userId, userId),
        ),
      });
      hasPresenceSnapshot = !!snapshot;
    } catch (_) {
      // Tabela pode ainda não existir em ambientes legados
    }

    return {
      matchTime: classData.createdAt,
      currentTime: now,
      classTime: classDateTime,
      canCancel,
      canStart,
      canReportNoShow,
      canConfirmStart,
      canReportPersonalNoShow,
      canComplete,
      cancellationDeadline,
      noShowReportDeadline,
      minimumCompletionAt,
      remainingToCompleteSeconds,
      hasPresenceSnapshot,
    };
  }

  async startClass(
    classId: string,
    startClassDto: StartClassDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    const classData = await this.getClassById(classId, userId);

    // Verificar se o usuário é o personal trainer
    if (classData.personalId !== userId) {
      throw new ForbiddenException(
        'Apenas o personal trainer pode iniciar a aula',
      );
    }

    // Verificar se a aula pode ser iniciada
    if (classData.status !== ClassStatus.SCHEDULED) {
      throw new BadRequestException(
        'Apenas aulas agendadas podem ser iniciadas',
      );
    }

    // Verificar se está dentro do prazo (30min antes até 10min depois)
    const now = new Date();
    const classDateTime = new Date(
      `${classData.date.toISOString().split('T')[0]}T${classData.time}`,
    );

    // Em ambiente de teste, ser mais tolerante
    const isTestEnvironment =
      process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;

    if (!isTestEnvironment) {
      const startWindow = new Date(classDateTime.getTime() - 30 * 60 * 1000); // 30min antes
      const endWindow = new Date(classDateTime.getTime() + 10 * 60 * 1000); // 10min depois

      if (now < startWindow || now > endWindow) {
        throw new BadRequestException(
          'A aula só pode ser iniciada entre 30 minutos antes e 10 minutos depois do horário agendado',
        );
      }
    }

    // Gerar código de 4 dígitos e hash (obrigatório por regra de domínio)
    // Kill switch: KILL_CODE_4_DIGITS=true reverte para behavior antigo (sem código se flag desligada)
    let plainCode: string | null = null;
    let codeHash: string | null = null;
    let codeExpiresAt: Date | null = null;

    if (!FeatureFlags.KILL_CODE_4_DIGITS) {
      plainCode = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');
      codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min para confirmar
      console.log('[CLASSES] class_started: code_generated', { classId });
    } else {
      console.warn(
        '[CLASSES] class_started: KILL_CODE_4_DIGITS ativo — código NÃO gerado',
        { classId },
      );
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.PENDING_CONFIRMATION,
        pendingConfirmationAt: new Date(),
        ...(codeHash
          ? {
              startConfirmationCodeHash: codeHash,
              startConfirmationCodeExpiresAt: codeExpiresAt,
              startConfirmationAttempts: 0,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    // ===== EMITIR EVENTOS WEBSOCKET E PUSH =====
    try {
      // Payload WebSocket sanitizado — sem código plaintext (segurança: só o personal recebe o código via HTTP)
      const wsPayload = await this.formatClassResponse(updatedClass);
      const studentId = classData.studentId;

      // Buscar dados do personal para notificação
      const personalData = await this.db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      // Evento para ambos os usuários (aluno e personal) — SEM startConfirmationCode
      this.chatGateway.server.emit('class_update', {
        action: 'class_started',
        class: wsPayload,
        personalId: userId,
        studentId: studentId,
        timestamp: new Date(),
      });

      // Enviar notificação push para aluno
      await this.firebaseNotificationService.sendToUser(studentId, {
        title: '▶️ Aula Iniciada',
        body: `${personalData?.name || 'Personal'} iniciou a aula. Confirme sua presença!`,
        data: {
          type: 'class_started',
          classId,
          partnerName: personalData?.name || 'Personal',
          partnerId: userId,
          time: classData.time,
          location: classData.location || 'Local a definir',
        },
      });

      console.log(
        '✅ [CLASSES] Evento WebSocket e push emitidos: class_started',
      );
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir evento WebSocket:', error);
    }

    const response = await this.formatClassResponse(updatedClass);
    // Expor código somente para o personal (não persistido em plaintext)
    if (plainCode) {
      (response as any).startConfirmationCode = plainCode;
      (response as any).startConfirmationCodeExpiresAt = codeExpiresAt;
    }
    return response;
  }

  async confirmClassStart(
    classId: string,
    confirmDto: ConfirmClassStartDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    // Buscar dados crus para validar código (getClassById não retorna hash)
    const rawClass = await this.db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });
    if (!rawClass) throw new NotFoundException('Aula não encontrada');

    const classData = await this.getClassById(classId, userId);

    // Verificar se o usuário é o aluno
    if (classData.studentId !== userId) {
      throw new ForbiddenException(
        'Apenas o aluno pode confirmar o início da aula',
      );
    }

    // Verificar se a aula está aguardando confirmação
    if (classData.status !== ClassStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('A aula não está aguardando confirmação');
    }

    // Validar código de confirmação
    // Kill switch ativo + sem hash = skip da validação (comportamento legado: confirma sem código)
    const codeRequired = !FeatureFlags.KILL_CODE_4_DIGITS;

    if (rawClass.startConfirmationCodeHash) {
      // Hash presente: sempre validar, independentemente do kill switch
      // Verificar expiração
      if (
        rawClass.startConfirmationCodeExpiresAt &&
        new Date() > rawClass.startConfirmationCodeExpiresAt
      ) {
        throw new BadRequestException(
          'CONFIRMATION_CODE_EXPIRED: Código de confirmação expirado',
        );
      }

      const currentAttempts = rawClass.startConfirmationAttempts || 0;
      const MAX_ATTEMPTS = 5;

      // Verificar limite de tentativas (brute force protection)
      if (currentAttempts >= MAX_ATTEMPTS) {
        // Expirar o código automaticamente após esgotar tentativas
        await this.db
          .update(classes)
          .set({
            startConfirmationCodeExpiresAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(classes.id, classId));
        throw new BadRequestException(
          'CONFIRMATION_CODE_LOCKED: Muitas tentativas incorretas. Solicite que o personal reinicie a aula.',
        );
      }

      // Incrementar tentativas antes de validar
      await this.db
        .update(classes)
        .set({
          startConfirmationAttempts: currentAttempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(classes.id, classId));

      const submittedHash = crypto
        .createHash('sha256')
        .update(confirmDto.confirmationCode || '')
        .digest('hex');
      if (submittedHash !== rawClass.startConfirmationCodeHash) {
        const attemptsLeft = MAX_ATTEMPTS - (currentAttempts + 1);
        throw new BadRequestException(
          `INVALID_CONFIRMATION_CODE: Código inválido. ${attemptsLeft > 0 ? `${attemptsLeft} tentativa(s) restante(s).` : 'Código bloqueado.'}`,
        );
      }
    } else if (codeRequired) {
      // Sem hash + código obrigatório = estado inconsistente (dados legados).
      // Reverter para SCHEDULED para que o personal chame startClass de novo
      // (único endpoint que gera código e retorna plaintext via HTTP de forma segura).
      console.warn(
        '[CLASSES] code_missing: pending_confirmation sem hash — revertendo para SCHEDULED',
        { classId },
      );

      const [revertedClass] = await this.db
        .update(classes)
        .set({
          status: ClassStatus.SCHEDULED,
          pendingConfirmationAt: null,
          startConfirmationCodeHash: null,
          startConfirmationCodeExpiresAt: null,
          startConfirmationAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(classes.id, classId))
        .returning();

      // Emitir evento para sincronizar UI de ambos os participantes
      if (revertedClass) {
        try {
          const classResponse = await this.formatClassResponse(revertedClass);
          this.chatGateway.server.to(`class_${classId}`).emit('class_update', {
            action: 'class_reverted_to_scheduled',
            class: classResponse,
          });
        } catch (emitErr) {
          console.error(
            '[CLASSES] Erro ao emitir class_reverted_to_scheduled',
            emitErr,
          );
        }
      }

      throw new BadRequestException(
        'CODE_MISSING: Código de confirmação ausente. O personal deve iniciar a aula novamente.',
      );
    } else {
      // Kill switch KILL_CODE_4_DIGITS ativo + sem hash = confirma sem código.
      // ATENÇÃO: isso reduz a garantia de presença. Usar somente em emergência.
      console.warn(
        '[CLASSES] KILL_SWITCH_ACTIVE: confirmação sem código (KILL_CODE_4_DIGITS=true)',
        { classId, personalId: classData.personalId, studentId: userId },
      );
    }

    const startTime = new Date();
    const minimumCompletionAt = new Date(
      startTime.getTime() + MINIMUM_COMPLETION_MS,
    ); // T + 1min
    const durationMs = classData.duration * 60 * 1000;

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.ACTIVE,
        confirmedAt: startTime,
        startedAt: startTime,
        minimumCompletionAt,
        startConfirmationCodeHash: null, // Limpar hash após uso
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);

      // Evento para ambos os usuários (aluno e personal)
      this.chatGateway.server.emit('class_update', {
        action: 'class_confirmed',
        class: classResponse,
        personalId: classData.personalId,
        studentId: userId,
        timestamp: new Date(),
      });

      // 🕐 NOVO: Evento de timer global para sincronização
      this.chatGateway.server.emit('class_timer_started', {
        classId,
        startTime: startTime.toISOString(),
        durationMs,
        timestamp: startTime.getTime(),
        personalId: classData.personalId,
        studentId: userId,
      });

      console.log('✅ [CLASSES] Evento WebSocket emitido: class_confirmed');
      console.log('🕐 [TIMER] Evento WebSocket emitido: class_timer_started');
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir evento WebSocket:', error);
    }

    return this.formatClassResponse(updatedClass);
  }

  async reportNoShow(
    classId: string,
    reportDto: ReportNoShowDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    const classData = await this.getClassById(classId, userId);

    // Verificar se o usuário é o personal trainer
    if (classData.personalId !== userId) {
      throw new ForbiddenException(
        'Apenas o personal trainer pode reportar ausência do aluno',
      );
    }

    // Verificar se pode reportar ausência (após 10min do horário)
    const now = new Date();
    const classDateTime = new Date(
      `${classData.date.toISOString().split('T')[0]}T${classData.time}`,
    );
    const noShowDeadline = new Date(classDateTime.getTime() + 10 * 60 * 1000);

    if (now < noShowDeadline) {
      throw new BadRequestException(
        'A ausência só pode ser reportada após 10 minutos do horário agendado',
      );
    }

    // Verificar se a aula está em estado válido para reportar ausência
    if (
      ![ClassStatus.SCHEDULED, ClassStatus.PENDING_CONFIRMATION].includes(
        classData.status,
      )
    ) {
      throw new BadRequestException(
        'A aula não está em estado válido para reportar ausência',
      );
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.NO_SHOW_DISPUTE,
        noShowReportedAt: new Date(),
        noShowReportedBy: 'personal',
        noShowReason: reportDto.reason ?? null,
        noShowNotes: reportDto.notes ?? null,
        disputeStatus: ClassDisputeStatus.PENDING,
        custodyExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48h
        evidenceDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h
        personalEvidence: reportDto.evidenceUrls
          ? JSON.stringify(reportDto.evidenceUrls)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    // A disputa de no-show é controlada pela aula. A proposta não aceita o enum
    // "disputed", então não alteramos o status dela aqui.
    if (classData.proposalId) {
      try {
        await this.db
          .update(proposals)
          .set({
            updatedAt: new Date(),
          })
          .where(eq(proposals.id, classData.proposalId));
      } catch (error) {
        this.logger.error(
          `[CLASSES] Erro ao sincronizar timestamp da proposta ${classData.proposalId}: ${error}`,
        );
      }
    }

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);

      // Evento para ambos os usuários (aluno e personal)
      this.chatGateway.server.emit('class_update', {
        action: 'class_no_show_reported',
        class: classResponse,
        personalId: userId,
        studentId: classData.studentId,
        reportedBy: 'personal',
        timestamp: new Date(),
      });

      this.logger.log(
        '[CLASSES] Evento WebSocket emitido: class_no_show_reported',
      );
    } catch (error) {
      this.logger.error(`[CLASSES] Erro ao emitir evento WebSocket: ${error}`);
    }

    return this.formatClassResponse(updatedClass);
  }

  async reportPersonalNoShow(
    classId: string,
    reportDto: ReportNoShowDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    this.logger.log(
      `[REPORT_PERSONAL_NO_SHOW] Iniciando reporte: classId=${classId} userId=${userId}`,
    );

    const classData = await this.getClassById(classId, userId);

    // Verificar se o usuário é o aluno
    if (classData.studentId !== userId) {
      this.logger.warn(
        `[REPORT_PERSONAL_NO_SHOW] Usuário ${userId} não é o aluno ${classData.studentId}`,
      );
      throw new ForbiddenException(
        'Apenas o aluno pode reportar ausência do personal trainer',
      );
    }

    // Verificar se pode reportar ausência (após 10min do horário)
    const now = new Date();
    const classDateTime = new Date(
      `${classData.date.toISOString().split('T')[0]}T${classData.time}`,
    );
    const noShowDeadline = new Date(classDateTime.getTime() + 10 * 60 * 1000);

    if (now < noShowDeadline) {
      throw new BadRequestException(
        'A ausência só pode ser reportada após 10 minutos do horário agendado',
      );
    }

    // Verificar se a aula está em estado válido para reportar ausência
    if (
      ![ClassStatus.SCHEDULED, ClassStatus.PENDING_CONFIRMATION].includes(
        classData.status,
      )
    ) {
      this.logger.warn(
        `[REPORT_PERSONAL_NO_SHOW] Status inválido: ${classData.status}`,
      );
      throw new BadRequestException(
        'A aula não está em estado válido para reportar ausência',
      );
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.NO_SHOW_DISPUTE,
        noShowReportedAt: new Date(),
        noShowReportedBy: 'student',
        noShowReason: reportDto.reason ?? null,
        noShowNotes: reportDto.notes ?? null,
        disputeStatus: ClassDisputeStatus.PENDING,
        custodyExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48h
        evidenceDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h
        studentEvidence: reportDto.evidenceUrls
          ? JSON.stringify(reportDto.evidenceUrls)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    // A disputa de no-show é controlada pela aula. A proposta não aceita o enum
    // "disputed", então apenas sincronizamos o updatedAt.
    try {
      await this.db
        .update(proposals)
        .set({
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, classData.proposalId));
    } catch (error) {
      this.logger.error(
        `[REPORT_PERSONAL_NO_SHOW] Erro ao sincronizar proposta: ${error}`,
      );
      // Não falhar o processo se não conseguir atualizar a proposta
    }

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);

      // Evento para ambos os usuários (aluno e personal)
      this.chatGateway.server.emit('class_update', {
        action: 'class_personal_no_show_reported',
        class: classResponse,
        personalId: classData.personalId,
        studentId: userId,
        reportedBy: 'student',
        timestamp: new Date(),
      });

      this.logger.log(
        '[CLASSES] Evento WebSocket emitido: class_personal_no_show_reported',
      );
    } catch (error) {
      this.logger.error(`[CLASSES] Erro ao emitir evento WebSocket: ${error}`);
    }

    return this.formatClassResponse(updatedClass);
  }

  async resolveNoShowDispute(
    classId: string,
    resolveDto: ResolveNoShowDisputeDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    // Verificar se o usuário tem acesso à aula
    if (classData.studentId !== userId && classData.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta aula');
    }

    // Verificar se a aula está em disputa
    if (classData.status !== ClassStatus.NO_SHOW_DISPUTE) {
      throw new BadRequestException('A aula não está em disputa');
    }

    // Verificar se ainda está dentro do prazo para evidências
    const now = new Date();
    if (classData.evidenceDeadline && now > classData.evidenceDeadline) {
      throw new BadRequestException('Prazo para envio de evidências expirado');
    }

    // Determinar qual evidência atualizar
    const isStudent = classData.studentId === userId;
    const isPersonal = classData.personalId === userId;

    if (!isStudent && !isPersonal) {
      throw new ForbiddenException(
        'Apenas o aluno ou personal trainer podem resolver a disputa',
      );
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (isStudent) {
      updateData.studentEvidence = resolveDto.evidence;
    } else {
      updateData.personalEvidence = resolveDto.evidence;
    }

    // Atualizar status da disputa
    if (
      resolveDto.resolution === ClassDisputeStatus.STUDENT_CONFIRMED_ABSENCE
    ) {
      updateData.disputeStatus = ClassDisputeStatus.STUDENT_CONFIRMED_ABSENCE;
      updateData.status = ClassStatus.COMPLETED; // Pagamento liberado para personal
    } else if (
      resolveDto.resolution === ClassDisputeStatus.STUDENT_DENIED_ABSENCE
    ) {
      updateData.disputeStatus = ClassDisputeStatus.STUDENT_DENIED_ABSENCE;
      updateData.status = ClassStatus.CUSTODY; // Valor em custódia
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set(updateData)
      .where(eq(classes.id, classId))
      .returning();

    return this.formatClassResponse(updatedClass);
  }

  async submitDisputeDefense(
    classId: string,
    defenseDto: DisputeDefenseDto,
    userId: string,
  ): Promise<ClassResponseDto> {
    if (!FeatureFlags.DISPUTE_DEFENSE) {
      throw new BadRequestException('Feature não disponível');
    }

    this.logger.debug(
      `[DEBUG][DISPUTE_DEFENSE] Recebendo defesa para aula ${classId} do usuário ${userId}`,
    );
    const rawClass = await this.db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });

    if (!rawClass) throw new NotFoundException('Aula não encontrada');

    // Apenas partes envolvidas
    if (rawClass.studentId !== userId && rawClass.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta aula');
    }

    // Aula deve estar em disputa
    if (rawClass.status !== ClassStatus.NO_SHOW_DISPUTE) {
      throw new BadRequestException('A aula não está em disputa');
    }

    // Verificar se ainda está dentro do prazo para evidências
    const now = new Date();
    if (
      rawClass.evidenceDeadline &&
      now > new Date(rawClass.evidenceDeadline)
    ) {
      throw new BadRequestException('Prazo para envio de defesa expirado');
    }

    // Apenas a parte reportada pode enviar defesa
    const reportedRole = rawClass.noShowReportedBy; // 'personal' reportou => aluno é reportado
    const isReportedStudent =
      reportedRole === 'personal' && rawClass.studentId === userId;
    const isReportedPersonal =
      reportedRole === 'student' && rawClass.personalId === userId;

    if (!isReportedStudent && !isReportedPersonal) {
      throw new ForbiddenException(
        'Apenas a parte reportada pode enviar defesa',
      );
    }

    // Helper para fazer parse seguro de JSON (evitar 500 em dados corrompidos)
    const safeJsonParse = (raw: string | null | undefined): string[] => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const updateData: any = { updatedAt: new Date() };
    if (isReportedStudent) {
      updateData.studentDefenseText = defenseDto.text;
      updateData.studentDefenseSubmittedAt = now;
      // Mesclar evidências se fornecidas
      if (defenseDto.evidenceUrls?.length) {
        const existing = safeJsonParse(rawClass.studentEvidence);
        updateData.studentEvidence = JSON.stringify([
          ...existing,
          ...defenseDto.evidenceUrls,
        ]);
      }
      // Registrar status derivado (sem sobrescrever resolução admin)
      if (!rawClass.disputeStatus || rawClass.disputeStatus === 'pending') {
        updateData.disputeStatus = 'defense_submitted_by_student';
      }
    } else {
      updateData.personalDefenseText = defenseDto.text;
      updateData.personalDefenseSubmittedAt = now;
      if (defenseDto.evidenceUrls?.length) {
        const existing = safeJsonParse(rawClass.personalEvidence);
        updateData.personalEvidence = JSON.stringify([
          ...existing,
          ...defenseDto.evidenceUrls,
        ]);
      }
      // Registrar status derivado (sem sobrescrever resolução admin)
      if (!rawClass.disputeStatus || rawClass.disputeStatus === 'pending') {
        updateData.disputeStatus = 'defense_submitted_by_personal';
      }
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set(updateData)
      .where(eq(classes.id, classId))
      .returning();

    // ===== EMITIR EVENTO WEBSOCKET DE DEFESA =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);
      this.chatGateway.server.emit('class_update', {
        action: 'class_dispute_defense_submitted',
        class: classResponse,
        personalId: rawClass.personalId,
        studentId: rawClass.studentId,
        defendedBy: isReportedStudent ? 'student' : 'personal',
        timestamp: new Date(),
      });
      this.logger.log(
        '[CLASSES] Evento WebSocket emitido: class_dispute_defense_submitted',
      );
    } catch (error) {
      this.logger.error(
        `[CLASSES] Erro ao emitir evento WebSocket de defesa: ${error}`,
      );
    }

    return this.formatClassResponse(updatedClass);
  }

  async createPresenceSnapshot(
    classId: string,
    snapshotDto: PresenceSnapshotDto,
    userId: string,
  ): Promise<any> {
    const rawClass = await this.db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });

    if (!rawClass) throw new NotFoundException('Aula não encontrada');

    if (rawClass.studentId !== userId && rawClass.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta aula');
    }

    // Validar status da aula — só aceitar para aulas relevantes (não canceladas/concluídas há muito tempo)
    const validStatuses = [
      ClassStatus.SCHEDULED,
      ClassStatus.PENDING_CONFIRMATION,
      ClassStatus.ACTIVE,
      ClassStatus.COMPLETED,
    ];
    if (!validStatuses.includes(rawClass.status as ClassStatus)) {
      throw new BadRequestException(
        'Snapshot de presença não permitido para o estado atual da aula',
      );
    }

    // Validar janela temporal: snapshot deve ser capturado próximo ao horário da aula (±2h)
    // Extrair T0 da aula (date + time)
    try {
      const classDateStr =
        rawClass.date instanceof Date
          ? rawClass.date.toISOString().split('T')[0]
          : String(rawClass.date).split('T')[0];
      const t0 = new Date(`${classDateStr}T${rawClass.time}:00`);
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - t0.getTime());
      const MAX_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 horas
      if (diffMs > MAX_WINDOW_MS) {
        throw new BadRequestException(
          'Snapshot de presença deve ser capturado dentro de 2 horas do horário da aula',
        );
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      // Se não conseguir calcular T0, permitir (não bloquear por erro de parse)
      this.logger.warn(
        `[SNAPSHOT] Não foi possível validar janela temporal para aula ${classId}: ${e?.message}`,
      );
    }

    // Verificar idempotência — retornar existente se já houver
    try {
      const existing = await this.db.query.classPresenceSnapshots.findFirst({
        where: and(
          eq(classPresenceSnapshots.classId, classId),
          eq(classPresenceSnapshots.userId, userId),
        ),
      });
      if (existing) return existing;
    } catch (_) {}

    const role = rawClass.personalId === userId ? 'personal' : 'student';

    try {
      const [snapshot] = await this.db
        .insert(classPresenceSnapshots)
        .values({
          classId,
          userId,
          role,
          latitude: String(snapshotDto.latitude),
          longitude: String(snapshotDto.longitude),
          accuracyMeters:
            snapshotDto.accuracyMeters != null
              ? String(snapshotDto.accuracyMeters)
              : null,
          capturedAt: new Date(snapshotDto.capturedAt),
          captureSource: snapshotDto.captureSource,
          appState: snapshotDto.appState,
        })
        .returning();
      return snapshot;
    } catch (err: any) {
      // Conflito de unique constraint (race condition): retornar existente
      if (err?.code === '23505' || err?.message?.includes('unique')) {
        const existing = await this.db.query.classPresenceSnapshots.findFirst({
          where: and(
            eq(classPresenceSnapshots.classId, classId),
            eq(classPresenceSnapshots.userId, userId),
          ),
        });
        return existing;
      }
      throw err;
    }
  }

  async getClassDisputes(
    userId: string,
    statusFilter?: 'open' | 'resolved' | 'all',
  ): Promise<any[]> {
    try {
      const filter = statusFilter || 'all';

      // Construir condição de status baseada no filtro
      const statusConditions: any[] = [
        or(eq(classes.studentId, userId), eq(classes.personalId, userId)),
      ];

      if (filter === 'open') {
        statusConditions.push(eq(classes.status, ClassStatus.NO_SHOW_DISPUTE));
      } else if (filter === 'resolved') {
        // Disputas resolvidas: aulas que já passaram por disputa mas foram resolvidas
        statusConditions.push(
          and(
            or(
              eq(classes.status, ClassStatus.CUSTODY),
              eq(classes.status, ClassStatus.COMPLETED),
              eq(classes.status, ClassStatus.CANCELLED),
            ),
            sql`${classes.noShowReportedAt} IS NOT NULL`,
          ),
        );
      } else {
        // 'all': abertas + resolvidas
        statusConditions.push(sql`${classes.noShowReportedAt} IS NOT NULL`);
      }

      const disputes = await this.db.query.classes.findMany({
        where: and(...statusConditions),
        orderBy: [desc(classes.noShowReportedAt)],
        with: {
          student: true,
          personal: true,
        },
      });

      const results: any[] = [];
      for (const dispute of disputes) {
        results.push(await this._buildDisputePayload(dispute));
      }
      return results;
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao buscar disputas:', error);
      return [];
    }
  }

  async getClassDisputeById(classId: string, userId: string): Promise<any> {
    const dispute = await this.db.query.classes.findFirst({
      where: and(
        eq(classes.id, classId),
        sql`${classes.noShowReportedAt} IS NOT NULL`,
      ),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa não encontrada');
    }

    // Validar acesso
    if (dispute.studentId !== userId && dispute.personalId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta disputa');
    }

    return this._buildDisputePayload(dispute);
  }

  /**
   * Monta o payload enriquecido de uma disputa (reutilizado por list e detail).
   */
  private async _buildDisputePayload(dispute: any): Promise<any> {
    // Determinar reporter e reportado
    const reportedByRole = dispute.noShowReportedBy || 'student';
    const reporterUserId =
      reportedByRole === 'personal' ? dispute.personalId : dispute.studentId;
    const reportedUserId =
      reportedByRole === 'personal' ? dispute.studentId : dispute.personalId;

    // Nomes
    const reporterName =
      reportedByRole === 'personal'
        ? `${dispute.personal?.firstName || ''} ${dispute.personal?.lastName || ''}`.trim()
        : `${dispute.student?.firstName || ''} ${dispute.student?.lastName || ''}`.trim();
    const reportedUserName =
      reportedByRole === 'personal'
        ? `${dispute.student?.firstName || ''} ${dispute.student?.lastName || ''}`.trim()
        : `${dispute.personal?.firstName || ''} ${dispute.personal?.lastName || ''}`.trim();

    // Buscar snapshots de presença
    let reporterSnapshot: any = null;
    let reportedSnapshot: any = null;
    try {
      reporterSnapshot = await this.db.query.classPresenceSnapshots.findFirst({
        where: and(
          eq(classPresenceSnapshots.classId, dispute.id),
          eq(classPresenceSnapshots.userId, reporterUserId),
        ),
      });
      reportedSnapshot = await this.db.query.classPresenceSnapshots.findFirst({
        where: and(
          eq(classPresenceSnapshots.classId, dispute.id),
          eq(classPresenceSnapshots.userId, reportedUserId),
        ),
      });
    } catch (_) {
      // Tabela pode ainda não existir em ambientes legados
    }

    return {
      id: dispute.id,
      classId: dispute.id,
      reportedBy: reportedByRole,
      reporterUserId,
      reportedUserId,
      reporterName: reporterName || null,
      reportedUserName: reportedUserName || null,
      status: dispute.disputeStatus || 'pending',
      reportedAt: dispute.noShowReportedAt || dispute.createdAt,
      custodyExpiresAt: dispute.custodyExpiresAt || dispute.createdAt,
      evidenceDeadline: dispute.evidenceDeadline || dispute.createdAt,
      studentEvidence: this.parseEvidence(dispute.studentEvidence),
      personalEvidence: this.parseEvidence(dispute.personalEvidence),
      // Novos campos
      studentDefenseText: dispute.studentDefenseText || null,
      personalDefenseText: dispute.personalDefenseText || null,
      studentDefenseSubmittedAt: dispute.studentDefenseSubmittedAt || null,
      personalDefenseSubmittedAt: dispute.personalDefenseSubmittedAt || null,
      resolution: dispute.resolution || null,
      resolvedAt: dispute.resolvedAt || null,
      // Geolocalização
      reporterHasSnapshot: !!reporterSnapshot,
      reportedHasSnapshot: !!reportedSnapshot,
      reporterSnapshotAt: reporterSnapshot?.capturedAt || null,
      reportedSnapshotAt: reportedSnapshot?.capturedAt || null,
    };
  }

  private async formatClassResponse(classData: any): Promise<ClassResponseDto> {
    // Calcular dados reais do personal e aluno
    const personalStats = await this.getPersonalStats(classData.personalId);
    const studentStats = await this.getStudentStats(
      classData.studentId,
      classData.personalId,
      classData.id,
    );

    // Buscar rating específico desta aula para o personal (aluno -> personal)
    let personalClassRating: number | null = null;
    try {
      const specificPersonal = await this.db
        .select({ rating: ratings.rating })
        .from(ratings)
        .where(
          and(
            eq(ratings.classId, classData.id),
            eq(ratings.type, 'student_to_personal'),
            eq(ratings.raterId, classData.studentId),
            eq(ratings.ratedId, classData.personalId),
            eq(ratings.status, 'completed'),
          ),
        )
        .limit(1);
      personalClassRating = specificPersonal[0]?.rating ?? null;
    } catch (e) {
      this.logger.error(
        '⚠️ [FORMAT_CLASS] Falha ao buscar rating específico do personal:',
        e,
      );
      personalClassRating = null;
    }

    // Converter profileImageId para profileImageUrl se existir
    let personalProfileImageUrl = null;
    let studentProfileImageUrl = null;

    if (classData.personal?.profileImageId) {
      try {
        const file = await this.db.query.files.findFirst({
          where: eq(files.id, classData.personal.profileImageId),
        });

        if (file?.url) {
          const baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';

          try {
            const original = new URL(file.url);
            const normalizedBase = new URL(baseUrl);
            personalProfileImageUrl = `${normalizedBase.origin}${original.pathname}`;
          } catch (e) {
            this.logger.error(
              '⚠️ [FORMAT_CLASS] Falha ao normalizar URL da imagem do personal:',
              e,
            );
            personalProfileImageUrl = file.url.replace(
              'https://api.treinopro.com',
              baseUrl,
            );
          }
        }
      } catch (e) {
        console.error('⚠️ Falha ao buscar URL da imagem do personal:', e);
      }
    }

    // Buscar foto do aluno
    if (classData.student?.profileImageId) {
      try {
        const file = await this.db.query.files.findFirst({
          where: eq(files.id, classData.student.profileImageId),
        });

        if (file?.url) {
          const baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';

          try {
            const original = new URL(file.url);
            const normalizedBase = new URL(baseUrl);
            studentProfileImageUrl = `${normalizedBase.origin}${original.pathname}`;
          } catch (e) {
            this.logger.error(
              '⚠️ [FORMAT_CLASS] Falha ao normalizar URL da imagem do aluno:',
              e,
            );
            studentProfileImageUrl = file.url.replace(
              'https://api.treinopro.com',
              baseUrl,
            );
          }
        }
      } catch (e) {
        console.error('⚠️ Falha ao buscar URL da imagem do aluno:', e);
      }
    }

    const response: any = {
      id: classData.id,
      proposalId: classData.proposalId,
      studentId: classData.studentId,
      personalId: classData.personalId,
      location: classData.location,
      date: classData.date,
      time: classData.time,
      duration: Number(classData.duration), // Garantir que seja número
      status: classData.status,
      startedAt: classData.startedAt,
      endTime: classData.completedAt, // Mapear completedAt para endTime
      completedAt: classData.completedAt,
      pendingConfirmationAt: classData.pendingConfirmationAt,
      confirmedAt: classData.confirmedAt,
      noShowReportedAt: classData.noShowReportedAt,
      noShowReportedBy: classData.noShowReportedBy,
      disputeStatus: classData.disputeStatus,
      custodyExpiresAt: classData.custodyExpiresAt,
      evidenceDeadline: classData.evidenceDeadline,
      studentEvidence: this.parseEvidence(classData.studentEvidence),
      personalEvidence: this.parseEvidence(classData.personalEvidence),
      resolution: classData.resolution,
      resolvedAt: classData.resolvedAt,
      // Campos de defesa
      studentDefenseText: classData.studentDefenseText || null,
      personalDefenseText: classData.personalDefenseText || null,
      studentDefenseSubmittedAt: classData.studentDefenseSubmittedAt || null,
      personalDefenseSubmittedAt: classData.personalDefenseSubmittedAt || null,
      createdAt: classData.createdAt,
      updatedAt: classData.updatedAt,
      student: classData.student
        ? {
            ...classData.student,
            profilePicture: studentProfileImageUrl,
          }
        : null,
      personal: classData.personal,
      proposalModality:
        classData.proposalModality || classData.proposal?.modality || null,
      // Dados reais do personal
      personalProfileImageUrl: personalProfileImageUrl,
      personalRating:
        personalClassRating !== null ? Number(personalClassRating) : null,
      personalTimeOnPlatform: personalStats.timeOnPlatform,
      // Dados reais do aluno
      studentRating: studentStats.rating ? Number(studentStats.rating) : null,
    };

    // Incluir objeto proposal se disponível
    if (classData.proposal) {
      response.proposal = {
        ...classData.proposal,
        value: Number(classData.proposal.value), // Garantir que seja número
      };
    }

    return response;
  }

  async getClasses(
    getClassesDto: GetClassesDto,
    userId: string,
  ): Promise<{
    classes: ClassResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Construir condições de filtro
    const conditions = [];

    // Filtro por usuário (aluno ou personal)
    conditions.push(
      or(eq(classes.studentId, userId), eq(classes.personalId, userId)),
    );
    // Filtro por status
    if (getClassesDto.status) {
      conditions.push(eq(classes.status, getClassesDto.status));
    }

    // Filtro por data
    if (getClassesDto.dateFrom) {
      conditions.push(gte(classes.date, new Date(getClassesDto.dateFrom)));
    }

    if (getClassesDto.dateTo) {
      conditions.push(lte(classes.date, new Date(getClassesDto.dateTo)));
    }

    // Filtro por data específica (formato YYYY-MM-DD)
    if (getClassesDto.date) {
      // Parsear a data no formato YYYY-MM-DD considerando fuso horário local
      const [year, month, day] = getClassesDto.date.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      conditions.push(
        and(gte(classes.date, startOfDay), lte(classes.date, endOfDay)),
      );
    }

    // Filtro por faixa de horário
    if (getClassesDto.timeRange) {
      let startHour: number, endHour: number;

      switch (getClassesDto.timeRange) {
        case 'morning':
          startHour = 6;
          endHour = 12;
          break;
        case 'afternoon':
          startHour = 12;
          endHour = 18;
          break;
        case 'evening':
          startHour = 18;
          endHour = 23;
          break;
        default:
          startHour = 0;
          endHour = 23;
      }

      // Filtrar por horário usando SQL para extrair a hora do campo time
      conditions.push(
        sql`EXTRACT(HOUR FROM ${classes.time}::TIME) >= ${startHour} AND EXTRACT(HOUR FROM ${classes.time}::TIME) <= ${endHour}`,
      );
    }

    // Filtro por categoria
    if (getClassesDto.category) {
      // Filtrar por categoria através da proposta
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM proposals p 
          WHERE p.id = ${classes.proposalId} 
          AND p.modality_name = ${getClassesDto.category}
        )`,
      );
    }

    // Filtro por studentId específico
    if (getClassesDto.studentId) {
      conditions.push(eq(classes.studentId, getClassesDto.studentId));
    }

    // Filtro por personalId específico
    if (getClassesDto.personalId) {
      conditions.push(eq(classes.personalId, getClassesDto.personalId));
    }

    // Filtro por proposalId específico
    if (getClassesDto.proposalId) {
      conditions.push(eq(classes.proposalId, getClassesDto.proposalId));
    }

    // Paginação
    const page = getClassesDto.page || 1;
    const limit = getClassesDto.limit || 10;
    const offset = (page - 1) * limit;

    try {
      // Buscar aulas com filtros
      const classesData = await this.db
        .select()
        .from(classes)
        .where(and(...conditions))
        .orderBy(desc(classes.createdAt))
        .limit(limit)
        .offset(offset)
        .leftJoin(users, eq(classes.studentId, users.id))
        .leftJoin(proposals, eq(classes.proposalId, proposals.id));

      // Contar total de aulas
      const totalResult = await this.db
        .select({ count: count() })
        .from(classes)
        .where(and(...conditions));

      const total = totalResult[0]?.count || 0;

      console.log(
        `✅ [CLASSES] Encontradas ${classesData.length} aulas de ${total} total`,
      );

      // Buscar dados dos personais únicos (OTIMIZADO - 1 query em vez de N)
      const personalIds = [
        ...new Set(classesData.map((row: any) => row.classes.personalId)),
      ];

      const personalMap: Record<string, any> = {};
      if (personalIds.length > 0) {
        try {
          // Buscar TODOS os personals de uma vez usando inArray
          const personalsData = await this.db
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              profileImageId: users.profileImageId,
            })
            .from(users)
            .where(inArray(users.id, personalIds as string[]));

          // Criar mapa para acesso rápido
          personalsData.forEach((personal: any) => {
            personalMap[personal.id] = personal;
          });
        } catch (error) {
          console.error('❌ [CLASSES] Erro ao buscar personals:', error);
        }
      }

      // Buscar URLs de imagens de perfil em batch (evita N queries por aula)
      const profileImageIdSet = new Set<string>();

      classesData.forEach((row: any) => {
        const studentProfileImageId = row.users?.profileImageId as
          | string
          | undefined;
        if (studentProfileImageId) {
          profileImageIdSet.add(studentProfileImageId);
        }

        const personalProfileImageId = personalMap[row.classes.personalId]
          ?.profileImageId as string | undefined;
        if (personalProfileImageId) {
          profileImageIdSet.add(personalProfileImageId);
        }
      });

      const profileImageIds = [...profileImageIdSet];
      const profileImageUrlById: Record<string, string> = {};

      if (profileImageIds.length > 0) {
        try {
          const profileFiles = await this.db
            .select({
              id: files.id,
              url: files.url,
            })
            .from(files)
            .where(inArray(files.id, profileImageIds));

          profileFiles.forEach((file: any) => {
            if (file?.id && file?.url) {
              profileImageUrlById[file.id] = file.url;
            }
          });
        } catch (error) {
          console.error(
            '❌ [CLASSES] Erro ao buscar imagens de perfil em batch:',
            error,
          );
        }
      }

      // OTIMIZAÇÃO: Buscar stats e imagens em batch antes do loop
      const uniquePersonalIds = [
        ...new Set(classesData.map((row: any) => row.classes.personalId)),
      ];
      const classIds = [
        ...new Set(classesData.map((row: any) => row.classes.id)),
      ];

      // Buscar ratings em batch
      const personalRatingsMap: Record<string, any> = {};
      // Nota do personal específica por aula (aluno -> personal)
      const personalRatingByClassId: Record<string, number> = {};
      // Nota do aluno específica por aula
      const studentRatingByClassId: Record<string, number> = {};

      try {
        // Buscar ratings dos personals (onde eles são avaliados - ratedId)
        // Só buscar se houver personals para buscar
        if (uniquePersonalIds.length > 0) {
          const personalRatings = await this.db
            .select({
              personalId: ratings.ratedId,
              avgRating: sql<number>`AVG(${ratings.rating})`,
            })
            .from(ratings)
            .where(
              and(
                inArray(ratings.ratedId, uniquePersonalIds as string[]),
                eq(ratings.type, 'student_to_personal'),
              ),
            )
            .groupBy(ratings.ratedId);

          personalRatings.forEach((r: any) => {
            personalRatingsMap[r.personalId] = parseFloat(r.avgRating) || 0;
          });
        }

        // Buscar rating ESPECÍFICO por aula para personal (student -> personal)
        if (classIds.length > 0) {
          const personalClassRatings = await this.db
            .select({
              classId: ratings.classId,
              rating: ratings.rating,
            })
            .from(ratings)
            .where(
              and(
                inArray(ratings.classId, classIds as string[]),
                eq(ratings.type, 'student_to_personal'),
                eq(ratings.status, 'completed'),
              ),
            );

          personalClassRatings.forEach((r: any) => {
            personalRatingByClassId[r.classId] = Number(r.rating) || 0;
          });
        }

        // Buscar rating ESPECÍFICO por aula para alunos (personal -> student)
        if (classIds.length > 0) {
          const studentClassRatings = await this.db
            .select({
              classId: ratings.classId,
              rating: ratings.rating,
            })
            .from(ratings)
            .where(
              and(
                inArray(ratings.classId, classIds as string[]),
                eq(ratings.type, 'personal_to_student'),
                eq(ratings.status, 'completed'),
              ),
            );

          studentClassRatings.forEach((r: any) => {
            // Em caso de múltiplas avaliações (não esperado), ficará a última lida
            studentRatingByClassId[r.classId] = Number(r.rating) || 0;
          });
        }
      } catch (error) {
        console.error('❌ [CLASSES] Erro ao buscar ratings:', error);
      }

      // Formatar resposta SEM chamar formatClassResponse (evita N queries)
      const formattedClasses = classesData.map((row: any) => {
        const classData = row.classes;
        const student = row.users;
        const proposal = row.proposals;
        const personal = personalMap[classData.personalId];
        const studentProfilePicture =
          student?.profileImageId != null
            ? profileImageUrlById[student.profileImageId] || null
            : null;
        const personalProfilePicture =
          personal?.profileImageId != null
            ? profileImageUrlById[personal.profileImageId] || null
            : null;

        // Montar resposta diretamente (otimizado)
        return {
          id: classData.id,
          proposalId: classData.proposalId,
          studentId: classData.studentId,
          personalId: classData.personalId,
          location: classData.location,
          date: classData.date,
          time: classData.time,
          duration: classData.duration,
          status: classData.status,
          startedAt: classData.startedAt,
          endTime: classData.endTime,
          completedAt: classData.completedAt,
          pendingConfirmationAt: classData.pendingConfirmationAt,
          confirmedAt: classData.confirmedAt,
          noShowReportedAt: classData.noShowReportedAt,
          noShowReportedBy: classData.noShowReportedBy,
          disputeStatus: classData.disputeStatus,
          custodyExpiresAt: classData.custodyExpiresAt,
          evidenceDeadline: classData.evidenceDeadline,
          studentEvidence: this.parseEvidence(classData.studentEvidence),
          personalEvidence: this.parseEvidence(classData.personalEvidence),
          resolution: classData.resolution,
          resolvedAt: classData.resolvedAt,
          studentDefenseText: classData.studentDefenseText || null,
          personalDefenseText: classData.personalDefenseText || null,
          studentDefenseSubmittedAt:
            classData.studentDefenseSubmittedAt || null,
          personalDefenseSubmittedAt:
            classData.personalDefenseSubmittedAt || null,
          createdAt: classData.createdAt,
          updatedAt: classData.updatedAt,
          student: student
            ? {
                id: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                profilePicture: studentProfilePicture,
              }
            : null,
          personal: personal
            ? {
                id: personal.id,
                firstName: personal.firstName,
                lastName: personal.lastName,
                profilePicture: personalProfilePicture,
              }
            : null,
          proposalModality: proposal?.modalityName || null,
          personalProfileImageUrl: personalProfilePicture,
          personalRating: personalRatingByClassId[classData.id] ?? null,
          personalTimeOnPlatform: '0 dias', // Simplificado por performance
          studentRating: studentRatingByClassId[classData.id] ?? null,
          proposal: proposal
            ? {
                id: proposal.id,
                modality: proposal.modalityName,
                value: proposal.price,
              }
            : null,
        };
      });

      return {
        classes: formattedClasses,
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao buscar aulas:', error);
      throw new BadRequestException('Erro ao buscar aulas: ' + error.message);
    }
  }

  async deleteClass(classId: string, userId: string): Promise<void> {
    // Verificar se a aula existe e se o usuário tem permissão
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, classId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    // Verificar se o usuário é o personal ou o aluno da aula
    if (classData.personalId !== userId && classData.studentId !== userId) {
      throw new ForbiddenException(
        'Você não tem permissão para deletar esta aula',
      );
    }

    // Deletar a aula
    await this.db.delete(classes).where(eq(classes.id, classId));
  }

  /**
   * Calcula dados reais do personal trainer (rating e tempo na plataforma)
   * Sistema de rating como Uber: começa com 5.0, varia baseado nas avaliações
   * Tempo dinâmico: mostra dias, semanas, meses ou anos dependendo do tempo
   */
  private async getPersonalStats(personalId: string): Promise<{
    rating: number | null;
    timeOnPlatform: string;
  }> {
    try {
      // Buscar dados do personal
      const personal = await this.db.query.users.findFirst({
        where: eq(users.id, personalId),
        columns: {
          createdAt: true,
        },
      });

      if (!personal) {
        return { rating: null, timeOnPlatform: '0 dias' }; // null quando não encontrado
      }

      // Calcular tempo na plataforma (dinâmico como Uber)
      const now = new Date();
      const createdAt = new Date(personal.createdAt);
      const timeOnPlatform = this.calculateTimeOnPlatform(createdAt, now);

      // Buscar rating médio do personal (sistema como Uber)
      let rating = null; // Não há rating até ser avaliado
      try {
        // Buscar avaliações feitas pelo personal (para alunos)
        const personalRatings = await this.db
          .select({ rating: ratings.rating })
          .from(ratings)
          .where(
            and(
              eq(ratings.raterId, personalId),
              eq(ratings.type, 'personal_to_student'),
              eq(ratings.status, 'completed'),
            ),
          );

        if (personalRatings.length > 0) {
          // Calcular média das avaliações recebidas
          const totalRating = personalRatings.reduce(
            (sum, r) => sum + r.rating,
            0,
          );
          rating = totalRating / personalRatings.length;

          // Garantir que o rating fique entre 1.0 e 5.0
          rating = Math.max(1.0, Math.min(5.0, rating));
        }
        // Se não há avaliações, mantém 5.0 (rating inicial como Uber)
      } catch (error) {
        console.warn('⚠️ [CLASSES] Erro ao buscar rating do personal:', error);
        // Em caso de erro, mantém null (não avaliado)
        rating = null;
      }

      const result = {
        rating: rating ? Math.round(rating * 10) / 10 : null, // Arredondar para 1 casa decimal ou null
        timeOnPlatform,
      };

      return result;
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao calcular stats do personal:', error);
      return { rating: null, timeOnPlatform: '0 dias' }; // null em caso de erro
    }
  }

  /**
   * Calcula tempo na plataforma de forma dinâmica (como Uber)
   * Mostra dias, semanas, meses ou anos dependendo do tempo
   */
  private calculateTimeOnPlatform(createdAt: Date, now: Date): string {
    const diffInMs = now.getTime() - createdAt.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    const diffInWeeks = Math.floor(diffInDays / 7);
    const diffInMonths = Math.floor(diffInDays / 30);
    const diffInYears = Math.floor(diffInDays / 365);

    // Lógica dinâmica como Uber
    if (diffInDays < 7) {
      // Menos de 1 semana: mostrar dias
      return diffInDays === 0
        ? 'Hoje'
        : diffInDays === 1
          ? '1 dia'
          : `${diffInDays} dias`;
    } else if (diffInWeeks < 4) {
      // Menos de 1 mês: mostrar semanas
      return diffInWeeks === 1 ? '1 semana' : `${diffInWeeks} semanas`;
    } else if (diffInMonths < 12) {
      // Menos de 1 ano: mostrar meses
      return diffInMonths === 1 ? '1 mês' : `${diffInMonths} meses`;
    } else {
      // 1 ano ou mais: mostrar anos
      return diffInYears === 1 ? '1 ano' : `${diffInYears} anos`;
    }
  }

  /**
   * Calcula dados reais do aluno (rating)
   * Sistema de rating como Uber: começa com 5.0, varia baseado nas avaliações
   */
  private async getStudentStats(
    studentId: string,
    personalId: string,
    classId?: string,
  ): Promise<{
    rating: number | null;
  }> {
    try {
      // Rating específico da aula: personal -> student
      if (!classId) {
        return { rating: null };
      }

      try {
        const specific = await this.db
          .select({ rating: ratings.rating })
          .from(ratings)
          .where(
            and(
              eq(ratings.classId, classId),
              eq(ratings.type, 'personal_to_student'),
              eq(ratings.raterId, personalId),
              eq(ratings.ratedId, studentId),
              eq(ratings.status, 'completed'),
            ),
          )
          .limit(1);

        const value = specific[0]?.rating ?? null;
        return { rating: value !== null ? Number(value) : null };
      } catch (error) {
        console.warn(
          '⚠️ [CLASSES] Erro ao buscar rating específico da aula para aluno:',
          error,
        );
        return { rating: null };
      }
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao calcular stats do aluno:', error);
      return { rating: null }; // null em caso de erro
    }
  }

  private parseEvidence(evidence: string | null): string[] {
    if (!evidence) return [];
    try {
      const parsed = JSON.parse(evidence);
      if (Array.isArray(parsed)) return parsed;
      return [String(parsed)];
    } catch (e) {
      return [evidence];
    }
  }
}
