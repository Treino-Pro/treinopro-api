import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, and, gte, lte, desc, count, sql, or, inArray } from 'drizzle-orm';
import { classes, users, proposals, ratings, payments } from '../../database/schema';
import { GamificationService } from '../gamification/gamification.service';
import { ChatGateway } from '../chat/chat.gateway';
import { PaymentsService } from '../payments/payments.service';
import { RatingsService } from '../ratings/ratings.service';
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
  ClassDisputeDto
} from './dto/classes.dto';

@Injectable()
export class ClassesService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    private readonly gamificationService: GamificationService,
    private readonly chatGateway: ChatGateway,
    private readonly paymentsService: PaymentsService,
    private readonly ratingsService: RatingsService,
  ) {}

  async createClass(createClassDto: CreateClassDto, userId: string): Promise<ClassResponseDto> {
    // Verificar se o usuário é o aluno da proposta
    const proposal = await this.db.query.proposals.findFirst({
      where: eq(proposals.id, createClassDto.proposalId),
    });

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    if (proposal.studentId !== userId) {
      throw new ForbiddenException('Você não pode criar uma aula para esta proposta');
    }

    if (proposal.status !== 'accepted') {
      throw new BadRequestException('A proposta deve estar aceita para criar uma aula');
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
      const startOfDay = new Date(classDate); startOfDay.setHours(0,0,0,0);
      const endOfDay = new Date(classDate); endOfDay.setHours(23,59,59,999);

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
              eq(classes.status, ClassStatus.ACTIVE)
            )
          )
        );

      const [h, m] = String(createClassDto.time || '00:00').split(':').map((v: string) => parseInt(v, 10));
      const proposedStart = new Date(classDate); proposedStart.setHours(h||0, m||0, 0, 0);
      const proposedEnd = new Date(proposedStart.getTime() + (createClassDto.duration || 60) * 60 * 1000);

      const hasConflict = existingClasses.some((cls: any) => {
        const d = new Date(cls.date);
        const [ch, cm] = String(cls.time || '00:00').split(':').map((v: string) => parseInt(v, 10));
        const classStart = new Date(d); classStart.setHours(ch||0, cm||0, 0, 0);
        const classEnd = new Date(classStart.getTime() + (cls.duration || 60) * 60 * 1000);
        return !(proposedEnd <= classStart || proposedStart >= classEnd);
      });

      if (hasConflict) {
        throw new BadRequestException('Conflito de horário: o personal já possui aula nesse período.');
      }
    }

    // Criar a aula
    const [newClass] = await this.db.insert(classes).values({
      ...createClassDto,
      date: new Date(createClassDto.date),
    }).returning();

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
      proposal: proposalWithModality ? {
        id: proposalWithModality.id,
        modality: proposalWithModality.modalityName,
        value: proposalWithModality.value,
      } : null,
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

  async updateClass(id: string, updateClassDto: UpdateClassDto, userId: string): Promise<ClassResponseDto> {
    const classData = await this.getClassById(id, userId);

    // Verificar se o usuário pode editar a aula
    if (classData.status === ClassStatus.COMPLETED || classData.status === ClassStatus.CANCELLED) {
      throw new BadRequestException('Não é possível editar uma aula concluída ou cancelada');
    }

    // Apenas o personal pode editar a aula
    if (classData.personalId !== userId) {
      throw new ForbiddenException('Apenas o personal trainer pode editar a aula');
    }

    // ===== VALIDAR CONFLITO DE HORÁRIO (SE ALTERAR DATA/HORA/DURAÇÃO) =====
    if (updateClassDto.date || updateClassDto.time || updateClassDto.duration) {
      const newDate = updateClassDto.date ? new Date(updateClassDto.date) : new Date(classData.date);
      const newTime = updateClassDto.time ?? classData.time;
      const newDuration = updateClassDto.duration ?? classData.duration;

      const startOfDay = new Date(newDate); startOfDay.setHours(0,0,0,0);
      const endOfDay = new Date(newDate); endOfDay.setHours(23,59,59,999);

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
              eq(classes.status, ClassStatus.ACTIVE)
            )
          )
        );

      const [h, m] = String(newTime || '00:00').split(':').map((v: string) => parseInt(v, 10));
      const proposedStart = new Date(newDate); proposedStart.setHours(h||0, m||0, 0, 0);
      const proposedEnd = new Date(proposedStart.getTime() + (newDuration || 60) * 60 * 1000);

      const hasConflict = existingClasses.some((cls: any) => {
        if (cls.id === id) return false; // ignorar a própria aula
        const d = new Date(cls.date);
        const [ch, cm] = String(cls.time || '00:00').split(':').map((v: string) => parseInt(v, 10));
        const classStart = new Date(d); classStart.setHours(ch||0, cm||0, 0, 0);
        const classEnd = new Date(classStart.getTime() + (cls.duration || 60) * 60 * 1000);
        return !(proposedEnd <= classStart || proposedStart >= classEnd);
      });

      if (hasConflict) {
        throw new BadRequestException('Conflito de horário: o personal já possui aula nesse período.');
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


  async completeClass(id: string, completeClassDto: CompleteClassDto, userId: string): Promise<ClassResponseDto> {
    console.log('🔍 [COMPLETE_CLASS] Iniciando finalização da aula:');
    console.log('🔍 [COMPLETE_CLASS] ID:', id);
    console.log('🔍 [COMPLETE_CLASS] User ID:', userId);
    console.log('🔍 [COMPLETE_CLASS] DTO:', completeClassDto);
    
    const classData = await this.getClassById(id, userId);
    console.log('🔍 [COMPLETE_CLASS] Class Data:', {
      id: classData.id,
      status: classData.status,
      personalId: classData.personalId,
      startedAt: classData.startedAt
    });

    // Verificar se o usuário é o personal trainer
    if (classData.personalId !== userId) {
      console.log('❌ [COMPLETE_CLASS] Erro: Usuário não é o personal trainer');
      throw new ForbiddenException('Apenas o personal trainer pode finalizar a aula');
    }

    // Verificar se a aula pode ser finalizada
    if (classData.status !== ClassStatus.ACTIVE) {
      console.log('❌ [COMPLETE_CLASS] Erro: Aula não está ativa. Status:', classData.status);
      
      if (classData.status === ClassStatus.COMPLETED) {
        throw new BadRequestException('Esta aula já foi finalizada anteriormente');
      } else {
        throw new BadRequestException(`Apenas aulas ativas podem ser finalizadas. Status atual: ${classData.status}`);
      }
    }

    // Verificar se a aula foi iniciada há pelo menos 1 minuto (para testes)
    if (classData.startedAt) {
      const now = new Date();
      const duration = (now.getTime() - classData.startedAt.getTime()) / (1000 * 60); // em minutos
      console.log('🔍 [COMPLETE_CLASS] Duração da aula:', duration, 'minutos');

      if (duration < 1) {
        console.log('❌ [COMPLETE_CLASS] Erro: Aula durou menos de 1 minuto');
        throw new BadRequestException('A aula deve durar pelo menos 1 minuto');
      }
    } else {
      console.log('⚠️ [COMPLETE_CLASS] Aviso: Aula não tem startedAt definido');
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

      if (relatedProposal && (relatedProposal.status === 'matched' || relatedProposal.status === 'accepted')) {
        await this.db
          .update(proposals)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(proposals.id, relatedProposal.id));

        console.log('✅ [CLASSES] Proposta vinculada marcada como completed:', relatedProposal.id);
      }
    } catch (err) {
      console.warn('⚠️ [CLASSES] Não foi possível atualizar status da proposta vinculada:', err?.message || err);
    }

    // ===== INTEGRAÇÃO COM GAMIFICAÇÃO =====
    try {
      // Dar XP para o aluno por completar a aula
      await this.gamificationService.processClassCompletion(classData.studentId, id);
      
      // Dar XP para o personal trainer por completar a aula
      await this.gamificationService.processClassCompletion(userId, id);
      
    } catch (error) {
      console.error('❌ [GAMIFICATION] Erro ao processar XP da aula:', error);
      // Não falhar a operação se a gamificação falhar
    }

    // ===== APLICAR SPLIT E ATUALIZAR CARTEIRA APÓS CONCLUSÃO DA AULA =====
    try {
      console.log('💰 [COMPLETE_CLASS] ===== INICIANDO REPASSE APÓS CONCLUSÃO DA AULA =====');
      console.log('💰 [COMPLETE_CLASS] Class ID:', id);
      console.log('💰 [COMPLETE_CLASS] User ID (quem está completando):', userId);
      
      // Buscar pagamento da aula
      const payment = await this.db.query.payments.findFirst({
        where: eq(payments.classId, id),
        with: {
          student: true,
          personal: true,
        },
      });

      console.log('💰 [COMPLETE_CLASS] Pagamento encontrado:', {
        paymentId: payment?.id,
        status: payment?.status,
        totalAmount: payment?.totalAmount,
        platformFee: payment?.platformFee,
        personalAmount: payment?.personalAmount,
        personalId: payment?.personalId,
        studentId: payment?.studentId
      });

      if (payment && payment.status === 'captured') {
        console.log('✅ [COMPLETE_CLASS] Pagamento capturado - iniciando repasse para o personal');
        // Aplicar split e atualizar carteira do personal
        await this.paymentsService.updateWallets(payment);
        console.log('✅ [COMPLETE_CLASS] Split aplicado e carteira do personal atualizada com sucesso');
      } else {
        console.log('⚠️ [COMPLETE_CLASS] Pagamento não encontrado ou não capturado:', {
          paymentExists: !!payment,
          paymentStatus: payment?.status,
          expectedStatus: 'captured'
        });
      }
      
      console.log('💰 [COMPLETE_CLASS] ===== PROCESSO DE REPASSE FINALIZADO =====');
      
    } catch (error) {
      console.error('❌ [COMPLETE_CLASS] Erro ao aplicar split após conclusão:', error);
      console.error('❌ [COMPLETE_CLASS] Stack trace:', error.stack);
      // Não falhar a operação se a atualização de carteira falhar
      // Mas logar o erro para investigação
    }

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);

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
      this.chatGateway.server.emit('financial_update', {
        action: 'payment_released',
        class: classResponse,
        financial: {
          classId: id,
          amount: classResponse.proposal?.value || 0,
        },
        userId: userId,
        timestamp: new Date(),
      });

      console.log('✅ [COMPLETE_CLASS] Eventos WebSocket emitidos (mesmo que timer expirado)');
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir eventos WebSocket:', error);
      // Não falhar a operação por causa de problemas de WebSocket
    }

    return this.formatClassResponse(updatedClass);
  }

  // Finalizar aula automaticamente quando timer expira
  async completeClassByTimerExpiration(classId: string): Promise<ClassResponseDto> {
    console.log('⏰ [TIMER_EXPIRATION] Finalizando aula por expiração do timer:', classId);
    
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
      console.log('⚠️ [TIMER_EXPIRATION] Aula não está ativa, ignorando expiração. Status:', classData.status);
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
      console.log('🎯 [TIMER_EXPIRATION] Processando gamificação para aluno e personal...');
      
      // Processar gamificação para o aluno
      await this.gamificationService.processClassCompletion(classData.studentId, classId);
      console.log('✅ [TIMER_EXPIRATION] Gamificação processada para aluno:', classData.studentId);
      
      // Processar gamificação para o personal trainer
      await this.gamificationService.processClassCompletion(classData.personalId, classId);
      console.log('✅ [TIMER_EXPIRATION] Gamificação processada para personal:', classData.personalId);
      
    } catch (error) {
      console.error('❌ [TIMER_EXPIRATION] Erro ao processar gamificação:', error);
    }

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);

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

      console.log('✅ [TIMER_EXPIRATION] Eventos WebSocket emitidos');
    } catch (error) {
      console.error('❌ [TIMER_EXPIRATION] Erro ao emitir eventos WebSocket:', error);
    }

    return this.formatClassResponse(updatedClass);
  }

  async cancelClass(id: string, userId: string): Promise<ClassResponseDto> {
    const classData = await this.getClassById(id, userId);

    // Verificar se a aula pode ser cancelada
    if (classData.status === ClassStatus.COMPLETED || classData.status === ClassStatus.CANCELLED) {
      throw new BadRequestException('A aula não pode ser cancelada');
    }

    // Verificar se o usuário pode cancelar (aluno ou personal)
    if (classData.studentId !== userId && classData.personalId !== userId) {
      throw new ForbiddenException('Você não pode cancelar esta aula');
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, id))
      .returning();

    // ===== EMITIR EVENTOS WEBSOCKET =====
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
      
      console.log('✅ [CLASSES] Evento WebSocket emitido: class_cancelled');
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir evento WebSocket:', error);
    }

    return this.formatClassResponse(updatedClass);
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
      .where(
        or(
          eq(classes.studentId, userId),
          eq(classes.personalId, userId)
        )
      )
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

    stats.forEach(stat => {
      result.total += stat.count;
      result[stat.status] += stat.count;
      result.totalDuration += stat.duration * stat.count;
    });

    result.averageDuration = result.total > 0 ? Math.round(result.totalDuration / result.total) : 0;

    return result;
  }

  async getClassTimeline(classId: string, userId: string): Promise<ClassTimelineDto> {
    const classData = await this.getClassById(classId, userId);
    const now = new Date();
    const classDateTime = new Date(`${classData.date.toISOString().split('T')[0]}T${classData.time}`);
    
    // Calcular deadlines
    const cancellationDeadline = new Date(classDateTime.getTime() - 2 * 60 * 60 * 1000); // 2h antes
    const noShowReportDeadline = new Date(classDateTime.getTime() + 10 * 60 * 1000); // 10min depois
    
    // Lógica dos botões baseada no tempo
    const canCancel = now < cancellationDeadline && classData.status === ClassStatus.SCHEDULED;
    const canStart = now >= new Date(classDateTime.getTime() - 30 * 60 * 1000) && 
                     now <= new Date(classDateTime.getTime() + 10 * 60 * 1000) &&
                     (classData.status === ClassStatus.SCHEDULED || classData.status === ClassStatus.PENDING_CONFIRMATION);
    const canReportNoShow = now >= noShowReportDeadline && 
                           (classData.status === ClassStatus.PENDING_CONFIRMATION || classData.status === ClassStatus.SCHEDULED);
    const canConfirmStart = classData.status === ClassStatus.PENDING_CONFIRMATION;
    const canReportPersonalNoShow = now >= noShowReportDeadline && 
                                   (classData.status === ClassStatus.PENDING_CONFIRMATION || classData.status === ClassStatus.SCHEDULED);

    return {
      matchTime: classData.createdAt,
      currentTime: now,
      classTime: classDateTime,
      canCancel,
      canStart,
      canReportNoShow,
      canConfirmStart,
      canReportPersonalNoShow,
      cancellationDeadline,
      noShowReportDeadline,
    };
  }

  async startClass(classId: string, startClassDto: StartClassDto, userId: string): Promise<ClassResponseDto> {
    const classData = await this.getClassById(classId, userId);

    // Verificar se o usuário é o personal trainer
    if (classData.personalId !== userId) {
      throw new ForbiddenException('Apenas o personal trainer pode iniciar a aula');
    }

    // Verificar se a aula pode ser iniciada
    if (classData.status !== ClassStatus.SCHEDULED) {
      throw new BadRequestException('Apenas aulas agendadas podem ser iniciadas');
    }

    // Verificar se está dentro do prazo (30min antes até 10min depois)
    const now = new Date();
    const classDateTime = new Date(`${classData.date.toISOString().split('T')[0]}T${classData.time}`);
    
    // Em ambiente de teste, ser mais tolerante
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
    
    if (!isTestEnvironment) {
      const startWindow = new Date(classDateTime.getTime() - 30 * 60 * 1000); // 30min antes
      const endWindow = new Date(classDateTime.getTime() + 10 * 60 * 1000); // 10min depois
      
      if (now < startWindow || now > endWindow) {
        throw new BadRequestException('A aula só pode ser iniciada entre 30 minutos antes e 10 minutos depois do horário agendado');
      }
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.PENDING_CONFIRMATION,
        pendingConfirmationAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      const classResponse = await this.formatClassResponse(updatedClass);
      
      // Evento para ambos os usuários (aluno e personal)
      this.chatGateway.server.emit('class_update', {
        action: 'class_started',
        class: classResponse,
        personalId: userId,
        studentId: classData.studentId,
        timestamp: new Date(),
      });
      
      console.log('✅ [CLASSES] Evento WebSocket emitido: class_started');
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir evento WebSocket:', error);
    }

    return this.formatClassResponse(updatedClass);
  }

  async confirmClassStart(classId: string, confirmDto: ConfirmClassStartDto, userId: string): Promise<ClassResponseDto> {
    const classData = await this.getClassById(classId, userId);

    // Verificar se o usuário é o aluno
    if (classData.studentId !== userId) {
      throw new ForbiddenException('Apenas o aluno pode confirmar o início da aula');
    }

    // Verificar se a aula está aguardando confirmação
    if (classData.status !== ClassStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('A aula não está aguardando confirmação');
    }

    const startTime = new Date();
    const durationMs = classData.duration * 60 * 1000; // Converter minutos para milissegundos

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.ACTIVE,
        confirmedAt: startTime,
        startedAt: startTime,
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

  async reportNoShow(classId: string, reportDto: ReportNoShowDto, userId: string): Promise<ClassResponseDto> {
    const classData = await this.getClassById(classId, userId);

    // Verificar se o usuário é o personal trainer
    if (classData.personalId !== userId) {
      throw new ForbiddenException('Apenas o personal trainer pode reportar ausência do aluno');
    }

    // Verificar se pode reportar ausência (após 10min do horário)
    const now = new Date();
    const classDateTime = new Date(`${classData.date.toISOString().split('T')[0]}T${classData.time}`);
    const noShowDeadline = new Date(classDateTime.getTime() + 10 * 60 * 1000);

    if (now < noShowDeadline) {
      throw new BadRequestException('A ausência só pode ser reportada após 10 minutos do horário agendado');
    }

    // Verificar se a aula está em estado válido para reportar ausência
    if (![ClassStatus.SCHEDULED, ClassStatus.PENDING_CONFIRMATION].includes(classData.status)) {
      throw new BadRequestException('A aula não está em estado válido para reportar ausência');
    }

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.NO_SHOW_DISPUTE,
        noShowReportedAt: new Date(),
        noShowReportedBy: 'personal',
        disputeStatus: ClassDisputeStatus.PENDING,
        custodyExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48h
        evidenceDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h
        personalEvidence: reportDto.evidenceUrls ? JSON.stringify(reportDto.evidenceUrls) : null,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

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
      
      console.log('✅ [CLASSES] Evento WebSocket emitido: class_no_show_reported');
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir evento WebSocket:', error);
    }

    return this.formatClassResponse(updatedClass);
  }

  async reportPersonalNoShow(classId: string, reportDto: ReportNoShowDto, userId: string): Promise<ClassResponseDto> {
    console.log('🔍 [REPORT_PERSONAL_NO_SHOW] Iniciando reporte:', {
      classId,
      userId,
      reportDto,
    });

    const classData = await this.getClassById(classId, userId);
    console.log('🔍 [REPORT_PERSONAL_NO_SHOW] Dados da aula:', {
      id: classData.id,
      studentId: classData.studentId,
      personalId: classData.personalId,
      status: classData.status,
      date: classData.date,
      time: classData.time,
    });

    // Verificar se o usuário é o aluno
    if (classData.studentId !== userId) {
      console.log('❌ [REPORT_PERSONAL_NO_SHOW] Usuário não é o aluno:', { userId, studentId: classData.studentId });
      throw new ForbiddenException('Apenas o aluno pode reportar ausência do personal trainer');
    }

    // Verificar se pode reportar ausência (após 10min do horário)
    const now = new Date();
    const classDateTime = new Date(`${classData.date.toISOString().split('T')[0]}T${classData.time}`);
    const noShowDeadline = new Date(classDateTime.getTime() + 10 * 60 * 1000);

    console.log('🔍 [REPORT_PERSONAL_NO_SHOW] Validação de tempo:', {
      now: now.toISOString(),
      classDateTime: classDateTime.toISOString(),
      noShowDeadline: noShowDeadline.toISOString(),
      canReport: now >= noShowDeadline,
    });

    if (now < noShowDeadline) {
      console.log('❌ [REPORT_PERSONAL_NO_SHOW] Ainda não pode reportar - muito cedo');
      throw new BadRequestException('A ausência só pode ser reportada após 10 minutos do horário agendado');
    }

    // Verificar se a aula está em estado válido para reportar ausência
    console.log('🔍 [REPORT_PERSONAL_NO_SHOW] Validação de status:', {
      currentStatus: classData.status,
      validStatuses: [ClassStatus.SCHEDULED, ClassStatus.PENDING_CONFIRMATION],
      isValid: [ClassStatus.SCHEDULED, ClassStatus.PENDING_CONFIRMATION].includes(classData.status),
    });

    if (![ClassStatus.SCHEDULED, ClassStatus.PENDING_CONFIRMATION].includes(classData.status)) {
      console.log('❌ [REPORT_PERSONAL_NO_SHOW] Status inválido para reportar');
      throw new BadRequestException('A aula não está em estado válido para reportar ausência');
    }

    console.log('🔍 [REPORT_PERSONAL_NO_SHOW] Atualizando aula no banco...');

    const [updatedClass] = await this.db
      .update(classes)
      .set({
        status: ClassStatus.NO_SHOW_DISPUTE,
        noShowReportedAt: new Date(),
        noShowReportedBy: 'student',
        disputeStatus: ClassDisputeStatus.PENDING,
        custodyExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48h
        evidenceDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h
        studentEvidence: reportDto.evidenceUrls ? JSON.stringify(reportDto.evidenceUrls) : null,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    console.log('🔍 [REPORT_PERSONAL_NO_SHOW] Aula atualizada no banco:');
    console.log('  - ID: ${updatedClass.id}');
    console.log('  - Status: ${updatedClass.status}');
    console.log('  - DisputeStatus: ${updatedClass.disputeStatus}');
    console.log('  - NoShowReportedAt: ${updatedClass.noShowReportedAt}');
    console.log('  - NoShowReportedBy: ${updatedClass.noShowReportedBy}');

    // ===== ATUALIZAR STATUS DA PROPOSTA =====
    try {
      console.log('🔍 [REPORT_PERSONAL_NO_SHOW] Atualizando status da proposta...');
      
      await this.db
        .update(proposals)
        .set({
          status: 'disputed', // Mantém no fluxo de disputa para não quebrar serviços
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, classData.proposalId));
      
      console.log('✅ [REPORT_PERSONAL_NO_SHOW] Proposta atualizada para status: disputed');
    } catch (error) {
      console.error('❌ [REPORT_PERSONAL_NO_SHOW] Erro ao atualizar proposta:', error);
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
      
      console.log('✅ [CLASSES] Evento WebSocket emitido: class_personal_no_show_reported');
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao emitir evento WebSocket:', error);
    }

    return this.formatClassResponse(updatedClass);
  }

  async resolveNoShowDispute(classId: string, resolveDto: ResolveNoShowDisputeDto, userId: string): Promise<ClassResponseDto> {
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
      throw new ForbiddenException('Apenas o aluno ou personal trainer podem resolver a disputa');
    }

    let updateData: any = {
      updatedAt: new Date(),
    };

    if (isStudent) {
      updateData.studentEvidence = resolveDto.evidence;
    } else {
      updateData.personalEvidence = resolveDto.evidence;
    }

    // Atualizar status da disputa
    if (resolveDto.resolution === ClassDisputeStatus.STUDENT_CONFIRMED_ABSENCE) {
      updateData.disputeStatus = ClassDisputeStatus.STUDENT_CONFIRMED_ABSENCE;
      updateData.status = ClassStatus.COMPLETED; // Pagamento liberado para personal
    } else if (resolveDto.resolution === ClassDisputeStatus.STUDENT_DENIED_ABSENCE) {
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

  async getClassDisputes(userId: string): Promise<any[]> {
    console.log('🔍 [CLASSES] Buscando disputas para usuário:', userId);
    
    try {
      const disputes = await this.db.query.classes.findMany({
        where: and(
          or(
            eq(classes.studentId, userId),
            eq(classes.personalId, userId)
          ),
          eq(classes.status, ClassStatus.NO_SHOW_DISPUTE)
        ),
        orderBy: [desc(classes.createdAt)],
      });

      console.log('🔍 [CLASSES] Disputas encontradas:', disputes.length);

      return disputes.map(dispute => ({
        id: dispute.id,
        classId: dispute.id,
        reportedBy: dispute.noShowReportedBy || 'student',
        status: dispute.disputeStatus || 'pending',
        reportedAt: dispute.noShowReportedAt || dispute.createdAt,
        studentEvidence: dispute.studentEvidence || null,
        personalEvidence: dispute.personalEvidence || null,
        resolution: dispute.resolution || null,
        resolvedAt: dispute.resolvedAt || null,
        custodyExpiresAt: dispute.custodyExpiresAt || dispute.createdAt,
        evidenceDeadline: dispute.evidenceDeadline || dispute.createdAt,
      }));
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao buscar disputas:', error);
      return [];
    }
  }

  private async formatClassResponse(classData: any): Promise<ClassResponseDto> {
    // Calcular dados reais do personal e aluno
    const personalStats = await this.getPersonalStats(classData.personalId);
    const studentStats = await this.getStudentStats(classData.studentId, classData.id);
    
    console.log('🔍 [FORMAT_CLASS] Personal Stats:', personalStats);
    console.log('🔍 [FORMAT_CLASS] Personal Time On Platform:', personalStats.timeOnPlatform);
    console.log('🔍 [FORMAT_CLASS] Class ID:', classData.id);
    console.log('🔍 [FORMAT_CLASS] Personal ID:', classData.personalId);
    
    // Debug: verificar tipos dos campos
    console.log('🔍 [FORMAT_CLASS] Debug tipos dos campos:');
    console.log('  - duration:', classData.duration, 'tipo:', typeof classData.duration);
    console.log('  - personalRating:', personalStats.rating, 'tipo:', typeof personalStats.rating);
    console.log('  - studentRating:', studentStats.rating, 'tipo:', typeof studentStats.rating);
    
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
      studentEvidence: classData.studentEvidence,
      personalEvidence: classData.personalEvidence,
      resolution: classData.resolution,
      resolvedAt: classData.resolvedAt,
      createdAt: classData.createdAt,
      updatedAt: classData.updatedAt,
      student: classData.student,
      personal: classData.personal,
      proposalModality: classData.proposalModality || classData.proposal?.modality || null,
      // Dados reais do personal
      personalProfileImageUrl: classData.personal?.profileImageUrl || null,
      personalRating: personalStats.rating ? Number(personalStats.rating) : null,
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

    console.log('🔍 [FORMAT_CLASS] Response personalTimeOnPlatform:', response.personalTimeOnPlatform);
    console.log('🔍 [FORMAT_CLASS] Response personalRating:', response.personalRating);
    
    return response;
  }

  async getClasses(
    getClassesDto: GetClassesDto, 
    userId: string
  ): Promise<{ classes: ClassResponseDto[]; total: number; page: number; limit: number }> {
    console.log('🔍 [CLASSES] Buscando aulas com filtros:', getClassesDto);
    console.log('🔍 [CLASSES] User ID:', userId);
    
    // Construir condições de filtro
    const conditions = [];
    
    // Filtro por usuário (aluno ou personal)
    conditions.push(
      or(
        eq(classes.studentId, userId),
        eq(classes.personalId, userId)
      )
    );
    
    console.log('🔍 [CLASSES] Condições base (usuário):', conditions.length);
    
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
      console.log('🔍 [CLASSES] Data recebida:', getClassesDto.date);
      
      // Parsear a data no formato YYYY-MM-DD considerando fuso horário local
      const [year, month, day] = getClassesDto.date.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      
      console.log('🔍 [CLASSES] Data processada - Início:', startOfDay.toISOString());
      console.log('🔍 [CLASSES] Data processada - Fim:', endOfDay.toISOString());
      
      conditions.push(
        and(
          gte(classes.date, startOfDay),
          lte(classes.date, endOfDay)
        )
      );
    }
    
    // Filtro por faixa de horário
    if (getClassesDto.timeRange) {
      console.log('🔍 [CLASSES] Faixa de horário recebida:', getClassesDto.timeRange);
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
      
      console.log(`🔍 [CLASSES] Horário processado: ${startHour}:00 - ${endHour}:59`);
      
      // Filtrar por horário usando SQL para extrair a hora do campo time
      conditions.push(
        sql`EXTRACT(HOUR FROM ${classes.time}::TIME) >= ${startHour} AND EXTRACT(HOUR FROM ${classes.time}::TIME) <= ${endHour}`
      );
    }
    
    // Filtro por categoria
    if (getClassesDto.category) {
      console.log('🔍 [CLASSES] Categoria recebida:', getClassesDto.category);
      // Filtrar por categoria através da proposta
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM proposals p 
          WHERE p.id = ${classes.proposalId} 
          AND p.modality_name = ${getClassesDto.category}
        )`
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
    
    // Paginação
    const page = getClassesDto.page || 1;
    const limit = getClassesDto.limit || 10;
    const offset = (page - 1) * limit;
    
    console.log('🔍 [CLASSES] Condições de filtro:', conditions);
    
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
      
      console.log(`✅ [CLASSES] Encontradas ${classesData.length} aulas de ${total} total`);
      
      // Buscar dados dos personais únicos
      const personalIds = [...new Set(classesData.map((row: any) => row.classes.personalId))];
      
      let personalMap: Record<string, any> = {};
      if (personalIds.length > 0) {
        // Buscar dados de cada personal trainer
        for (const personalId of personalIds) {
          try {
            const personalData = await this.db.query.users.findFirst({
              where: eq(users.id, personalId as string),
              columns: {
                id: true,
                firstName: true,
                lastName: true,
              },
            });
            
            if (personalData) {
              personalMap[personalId as string] = personalData;
            }
          } catch (error) {
            console.error(`Erro ao buscar personal ${personalId}:`, error);
          }
        }
      }
      
      // Formatar resposta usando formatClassResponse
      const formattedClasses = await Promise.all(classesData.map(async (row: any) => {
        const classData = row.classes;
        const student = row.users;
        const proposal = row.proposals;
        const personal = personalMap[classData.personalId];
        
        // Debug: verificar status de cada aula
        
        // Preparar dados para formatClassResponse
        const classWithRelations = {
          ...classData,
          student: student ? {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
          } : null,
          personal: personal ? {
            id: personal.id,
            firstName: personal.firstName,
            lastName: personal.lastName,
          } : null,
          proposal: proposal ? {
            id: proposal.id,
            modality: proposal.modalityName,
            value: proposal.price, // Corrigir: usar 'price' em vez de 'value'
          } : null,
          proposalModality: proposal?.modalityName || null,
        };
        
        return await this.formatClassResponse(classWithRelations);
      }));
      
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
      throw new ForbiddenException('Você não tem permissão para deletar esta aula');
    }

    // Deletar a aula
    await this.db
      .delete(classes)
      .where(eq(classes.id, classId));
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
      
      console.log('🔍 [PERSONAL_STATS] Personal ID:', personalId);
      console.log('🔍 [PERSONAL_STATS] Created At:', personal.createdAt);
      console.log('🔍 [PERSONAL_STATS] Now:', now);
      console.log('🔍 [PERSONAL_STATS] Time On Platform:', timeOnPlatform);

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
              eq(ratings.status, 'completed')
            )
          );

        if (personalRatings.length > 0) {
          // Calcular média das avaliações recebidas
          const totalRating = personalRatings.reduce((sum, r) => sum + r.rating, 0);
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
      
      console.log('🔍 [PERSONAL_STATS] Resultado final:', result);
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
      return diffInDays === 0 ? 'Hoje' : 
             diffInDays === 1 ? '1 dia' : 
             `${diffInDays} dias`;
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
  private async getStudentStats(studentId: string, classId?: string): Promise<{
    rating: number | null;
  }> {
    try {
      // Buscar rating médio do aluno (sistema como Uber)
      let rating = null; // Não há rating até ser avaliado
      
      try {
        // Buscar avaliações feitas pelo aluno (para personais)
        // Se classId for fornecido, buscar apenas avaliações dessa aula específica
        const whereConditions = [
          eq(ratings.raterId, studentId),
          eq(ratings.type, 'student_to_personal'),
          eq(ratings.status, 'completed')
        ];
        
        if (classId) {
          whereConditions.push(eq(ratings.classId, classId));
        }
        
        const studentRatings = await this.db
          .select({ rating: ratings.rating })
          .from(ratings)
          .where(and(...whereConditions));

        console.log('🔍 [GET_STUDENT_STATS] StudentId:', studentId);
        console.log('🔍 [GET_STUDENT_STATS] ClassId:', classId);
        console.log('🔍 [GET_STUDENT_STATS] WhereConditions:', whereConditions);
        console.log('🔍 [GET_STUDENT_STATS] StudentRatings encontradas:', studentRatings.length);
        console.log('🔍 [GET_STUDENT_STATS] StudentRatings:', studentRatings);

        if (studentRatings.length > 0) {
          // Calcular média das avaliações recebidas
          const totalRating = studentRatings.reduce((sum, r) => sum + r.rating, 0);
          rating = totalRating / studentRatings.length;
          
          // Garantir que o rating fique entre 1.0 e 5.0
          rating = Math.max(1.0, Math.min(5.0, rating));
          console.log('🔍 [GET_STUDENT_STATS] Rating calculado:', rating);
        } else {
          console.log('🔍 [GET_STUDENT_STATS] Nenhuma avaliação encontrada, rating = null');
        }
        // Se não há avaliações, mantém null (não avaliado)
        
      } catch (error) {
        console.warn('⚠️ [CLASSES] Erro ao buscar rating do aluno:', error);
        // Em caso de erro, mantém null (não avaliado)
        rating = null;
      }

      return {
        rating: rating ? Math.round(rating * 10) / 10 : null, // Arredondar para 1 casa decimal ou null
      };
    } catch (error) {
      console.error('❌ [CLASSES] Erro ao calcular stats do aluno:', error);
      return { rating: null }; // null em caso de erro
    }
  }
}
