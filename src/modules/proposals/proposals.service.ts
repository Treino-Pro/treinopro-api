import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { proposals, users, classes, payments } from '../../database/schema';
import { eq, and, desc, gte, lte, ilike, count, sql, or, lt } from 'drizzle-orm';
import { CreateProposalDto, UpdateProposalDto, ProposalQueryDto, ProposalResponseDto, ProposalListResponseDto, ProposalStatus } from './dto/proposals.dto';
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
import { StudentPaymentMethod } from '../payments/dto/student-payment-methods.dto';
import { PaymentsService } from '../payments/payments.service';
import { JobsService } from '../jobs/jobs.service';
import { ChatGateway } from '../chat/chat.gateway';
import { randomUUID } from 'crypto';
// Enum ClassStatus não exportado no schema, usando string diretamente

@Injectable()
export class ProposalsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly studentPaymentService: StudentPaymentMethodsService,
    private readonly paymentsService: PaymentsService,
    private readonly jobsService: JobsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createProposal(createProposalDto: CreateProposalDto, studentId: string): Promise<ProposalResponseDto> {
    // Verificar se o usuário é um aluno
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    if (!user.length || user[0].userType !== 'student') {
      throw new ForbiddenException('Apenas alunos podem criar propostas');
    }

    // Validar se a data não é no passado
    const trainingDate = new Date(createProposalDto.trainingDate);
    const now = new Date();
    if (trainingDate <= now) {
      throw new BadRequestException('A data do treino deve ser no futuro');
    }

    // ===== PROCESSAR PAGAMENTO ANTES DE CRIAR PROPOSTA =====
    
    try {
      // Criar preferência de pagamento específica para propostas
      const paymentResult = await this.createProposalPaymentPreference(
        createProposalDto,
        user[0],
        trainingDate
      );

      if (!paymentResult.success) {
        throw new BadRequestException(`Falha no pagamento: ${paymentResult.message}`);
      }


      // ===== CRIAR PROPOSTA APÓS PAGAMENTO APROVADO =====
      const [proposal] = await this.db
        .insert(proposals)
        .values({
          studentId,
          locationId: createProposalDto.locationId,
          locationName: createProposalDto.locationName,
          locationAddress: createProposalDto.locationAddress,
          trainingDate: trainingDate,
          trainingTime: createProposalDto.trainingTime,
          durationMinutes: createProposalDto.durationMinutes,
          modalityId: createProposalDto.modalityId,
          modalityName: createProposalDto.modalityName,
          price: createProposalDto.price.toString(),
          additionalNotes: createProposalDto.additionalNotes,
          status: ProposalStatus.PENDING,
          // Campos de pagamento
          paymentId: paymentResult.paymentId,
          paymentMethod: createProposalDto.paymentMethod,
          paymentStatus: paymentResult.status,
        })
        .returning();


      // Agendar timeout para proposta se pagamento ainda está pendente
      if (paymentResult.status === 'pending') {
        await this.jobsService.scheduleProposalExpiration({
          proposalId: proposal.id,
          studentId: studentId,
          createdAt: new Date(),
          expirationTime: 30, // 30 minutos
        });

        // Agendar lembretes de pagamento
        await this.schedulePaymentReminders(proposal.id);
      }

      // Buscar dados do usuário para incluir na resposta
      const [student] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, studentId))
        .limit(1);

      // Retornar proposta com dados do pagamento e do usuário
      const proposalResponse = this.mapToResponseDto(proposal, student);
      
      // ===== NOTIFICAR TODOS OS PERSONAIS ONLINE =====
      try {

        // Emitir evento para todos os personais online
        this.chatGateway.server.emit('new_proposal', {
          action: 'proposal_created',
          proposal: proposalResponse,
          student: {
            id: student?.id,
            name: student?.name,
            profileImageUrl: student?.profileImageUrl,
          },
          timestamp: new Date(),
        });
        
      } catch (error) {
        console.error('❌ [PROPOSALS] Erro ao emitir evento new_proposal:', error);
        // Não falhar a operação por causa de problemas de WebSocket
      }
      
      return {
        ...proposalResponse,
        payment: {
          paymentId: paymentResult.paymentId,
          status: paymentResult.status,
          method: createProposalDto.paymentMethod,
          amount: createProposalDto.price,
          preferenceId: paymentResult.preferenceId,
          checkoutUrl: paymentResult.checkoutUrl,
          sandboxCheckoutUrl: paymentResult.sandboxCheckoutUrl,
          qrCode: paymentResult.qrCode,
          qrCodeBase64: paymentResult.qrCodeBase64,
          platformFee: paymentResult.platformFee,
          personalAmount: paymentResult.personalAmount,
          message: paymentResult.message,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
        }
      };

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro no pagamento:', error.message);
      
      // Se falhar no pagamento, não criar a proposta
      throw new BadRequestException(`Erro no pagamento: ${error.message}`);
    }
  }

  async getProposals(query: ProposalQueryDto, userId: string, userType: string): Promise<ProposalListResponseDto> {
    const { page = 1, limit = 10, status, modality, dateFrom, dateTo } = query;
    const offset = (page - 1) * limit;

    // Construir condições de filtro
    const conditions = [];

    if (userType === 'student') {
      // Alunos veem apenas suas próprias propostas
      conditions.push(eq(proposals.studentId, userId));
    } else if (userType === 'personal') {
      // Personal trainers veem propostas pendentes (para aceitar)
      conditions.push(eq(proposals.status, ProposalStatus.PENDING));
    }

    if (status) {
      conditions.push(eq(proposals.status, status));
    }

    if (modality) {
      conditions.push(ilike(proposals.modalityName, `%${modality}%`));
    }

    if (dateFrom) {
      conditions.push(gte(proposals.trainingDate, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(proposals.trainingDate, new Date(dateTo)));
    }

    // Buscar propostas com join na tabela de usuários
    
    const [proposalsList, totalResult] = await Promise.all([
      this.db
        .select({
          // Campos da proposta
          id: proposals.id,
          studentId: proposals.studentId,
          locationName: proposals.locationName,
          locationAddress: proposals.locationAddress,
          trainingDate: proposals.trainingDate,
          trainingTime: proposals.trainingTime,
          durationMinutes: proposals.durationMinutes,
          modalityName: proposals.modalityName,
          price: proposals.price,
          additionalNotes: proposals.additionalNotes,
          status: proposals.status,
          paymentStatus: proposals.paymentStatus,
          createdAt: proposals.createdAt,
          updatedAt: proposals.updatedAt,
          // Campos do estudante
          studentFirstName: users.firstName,
          studentLastName: users.lastName,
          studentEmail: users.email,
        })
        .from(proposals)
        .leftJoin(users, eq(proposals.studentId, users.id))
        .where(and(...conditions))
        .orderBy(desc(proposals.createdAt))
        .limit(limit)
        .offset(offset),
      
      this.db
        .select({ count: count() })
        .from(proposals)
        .where(and(...conditions))
    ]);

    const total = totalResult[0]?.count || 0;


    return {
      proposals: proposalsList.map(proposal => this.mapToResponseDto(proposal)),
      total,
      page,
      limit,
    };
  }

  async getProposalById(id: string, userId: string, userType: string): Promise<ProposalResponseDto> {
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (userType === 'student' && proposal.studentId !== userId) {
      throw new ForbiddenException('Você só pode visualizar suas próprias propostas');
    }

    // Buscar dados do usuário para incluir na resposta
    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, proposal.studentId))
      .limit(1);

    return this.mapToResponseDto(proposal, student);
  }

  async updateProposal(id: string, updateProposalDto: UpdateProposalDto, userId: string, userType: string): Promise<ProposalResponseDto> {
    // Buscar a proposta
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (userType === 'student' && proposal.studentId !== userId) {
      throw new ForbiddenException('Você só pode editar suas próprias propostas');
    }

    // Verificar se a proposta pode ser editada
    if (proposal.status === ProposalStatus.COMPLETED) {
      throw new BadRequestException('Propostas concluídas não podem ser editadas');
    }

    // Atualizar a proposta
    const [updatedProposal] = await this.db
      .update(proposals)
      .set({
        ...updateProposalDto,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();

    // Buscar dados do usuário para incluir na resposta
    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, updatedProposal.studentId))
      .limit(1);

    return this.mapToResponseDto(updatedProposal, student);
  }

  async cancelProposal(id: string, userId: string, userType: string): Promise<ProposalResponseDto> {
    // Buscar a proposta
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (userType === 'student' && proposal.studentId !== userId) {
      throw new ForbiddenException('Você só pode cancelar suas próprias propostas');
    }

    // Verificar se a proposta pode ser cancelada
    if (proposal.status === ProposalStatus.COMPLETED) {
      throw new BadRequestException('Propostas concluídas não podem ser canceladas');
    }

    if (proposal.status === ProposalStatus.CANCELLED) {
      throw new BadRequestException('Proposta já foi cancelada');
    }

    // Cancelar a proposta
    const [cancelledProposal] = await this.db
      .update(proposals)
      .set({
        status: ProposalStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      // Buscar informações do usuário para enviar no evento
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Evento de proposta cancelada
      this.chatGateway.server.emit('proposal_update', {
        action: 'proposal_cancelled',
        proposal: this.mapToResponseDto(cancelledProposal),
        user: {
          id: user?.id,
          name: user?.name,
          userType: user?.userType,
        },
        userId: userId,
        timestamp: new Date(),
      });

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao emitir eventos WebSocket para cancelamento:', error);
      // Não falhar a operação por causa de problemas de WebSocket
    }

    // Buscar dados do usuário para incluir na resposta
    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, cancelledProposal.studentId))
      .limit(1);

    return this.mapToResponseDto(cancelledProposal, student);
  }

  async acceptProposal(id: string, personalId: string): Promise<ProposalResponseDto> {
    // Buscar a proposta
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar se a proposta está pendente
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException('Apenas propostas pendentes podem ser aceitas');
    }

    // ===== VALIDAR CONFLITO DE HORÁRIO COM AULAS EXISTENTES DO PERSONAL =====
    try {
      // Montar intervalo do dia da proposta
      const proposedTrainingDate = new Date(proposal.trainingDate);
      const startOfDay = new Date(proposedTrainingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(proposedTrainingDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Buscar aulas do personal no mesmo dia com status relevantes
      const existingClasses = await this.db
        .select()
        .from(classes)
        .where(
          and(
            eq(classes.personalId, personalId),
            gte(classes.date, startOfDay),
            lte(classes.date, endOfDay),
            or(
              eq(classes.status, 'scheduled'),
              eq(classes.status, 'pending_confirmation'),
              eq(classes.status, 'active')
            )
          )
        );

      console.log(`  - Aulas existentes encontradas: ${existingClasses.length}`);
      console.log(`  - Aulas existentes:`, existingClasses.map(c => ({ id: c.id, date: c.date, time: c.time, status: c.status })));

      // Calcular janela de tempo da proposta aceita
      // A proposta.trainingDate já contém a data e hora corretas
      const proposedStart = new Date(proposedTrainingDate);
      const proposedEnd = new Date(proposedStart.getTime() + (proposal.durationMinutes || 60) * 60 * 1000);

      console.log(`  - Proposta: ${proposedStart.toISOString()} até ${proposedEnd.toISOString()}`);

      // Verificar sobreposição com aulas existentes
      const hasConflict = existingClasses.some((cls: any) => {
        // A aula.cls.date já contém a data e hora corretas
        const classStart = new Date(cls.date);
        const classEnd = new Date(classStart.getTime() + (cls.duration || 60) * 60 * 1000);

        console.log(`  - Aula existente: ${classStart.toISOString()} até ${classEnd.toISOString()}`);

        // Verificar se a aula já deveria ter terminado (no-show ou esquecimento)
        const now = new Date();
        const isClassExpired = classEnd < now;
        
        if (isClassExpired) {
          console.log(`  - Aula expirada (deveria ter terminado às ${classEnd.toISOString()}), ignorando conflito`);
          return false; // Não há conflito com aulas expiradas
        }

        // overlap se não (proposedEnd <= classStart || proposedStart >= classEnd)
        const overlaps = !(proposedEnd <= classStart || proposedStart >= classEnd);
        console.log(`  - Sobreposição: ${overlaps}`);
        console.log(`  - proposedStart: ${proposedStart.toISOString()}`);
        console.log(`  - proposedEnd: ${proposedEnd.toISOString()}`);
        console.log(`  - classStart: ${classStart.toISOString()}`);
        console.log(`  - classEnd: ${classEnd.toISOString()}`);
        
        return overlaps;
      });

      console.log(`  - Tem conflito: ${hasConflict}`);

      if (hasConflict) {
        throw new BadRequestException('Conflito de horário: você já possui uma aula agendada nesse período.');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Em caso de erro inesperado na verificação, não bloquear o fluxo com mensagem genérica
      console.error('❌ [PROPOSALS] Erro ao validar conflito de horário:', error);
      throw new BadRequestException('Não foi possível validar conflitos de horário no momento. Tente novamente.');
    }

    // Aceitar a proposta (mudar status para matched)
    const [acceptedProposal] = await this.db
      .update(proposals)
      .set({
        status: ProposalStatus.MATCHED,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();

    // ===== CAPTURAR PAGAMENTO APÓS MATCH =====
    try {
      console.log('💰 [PROPOSALS] Capturando pagamento após match...');
      
      // Buscar pagamento da proposta
      const payment = await this.db.query.payments.findFirst({
        where: eq(payments.proposalId, id),
      });

      if (payment && payment.status === 'authorized') {
        // Capturar pagamento no Mercado Pago
        if (payment.mpPaymentId) {
          await this.paymentsService.capturePaymentAfterClass(payment.classId || id, 'Match confirmado - personal aceitou proposta');
          console.log('✅ [PROPOSALS] Pagamento capturado após match');
        } else {
          console.log('⚠️ [PROPOSALS] Pagamento sem mpPaymentId - pode ser simulado');
        }
      } else {
        console.log('⚠️ [PROPOSALS] Pagamento não encontrado ou não autorizado:', payment?.status);
      }
      
    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao capturar pagamento após match:', error);
      // Não falhar a operação se a captura de pagamento falhar
      // Mas logar o erro para investigação
    }

    // ===== CRIAR AULA AUTOMATICAMENTE =====
    
    // Verificar se já existe uma aula para esta proposta
    const existingClass = await this.db
      .select()
      .from(classes)
      .where(eq(classes.proposalId, id))
      .limit(1);

    if (existingClass.length > 0) {
      // Buscar dados do usuário para incluir na resposta
      const [student] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, acceptedProposal.studentId))
        .limit(1);
      return this.mapToResponseDto(acceptedProposal, student);
    }
    
    try {
      const [newClass] = await this.db
        .insert(classes)
        .values({
          studentId: proposal.studentId,
          personalId: personalId,
          proposalId: id, // Vincular à proposta
          location: proposal.locationName,
          address: proposal.locationAddress,
          date: proposal.trainingDate,
          time: proposal.trainingTime,
          duration: proposal.durationMinutes,
          modality: proposal.modalityName,
          price: proposal.price,
          status: 'scheduled',
          notes: proposal.additionalNotes,
        })
        .returning();


      // Atualizar proposta para incluir o ID da aula criada
      await this.db
        .update(proposals)
        .set({
          classId: newClass.id, // Adicionar referência à aula
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, id));

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao criar aula:', error);
      // Se falhar, reverter status da proposta
      await this.db
        .update(proposals)
        .set({
          status: ProposalStatus.PENDING,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, id));
      
      throw new BadRequestException(`Erro ao criar aula: ${error.message}`);
    }

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      // Buscar informações do aluno para enviar no evento
      const [student] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, proposal.studentId))
        .limit(1);

      // Buscar informações do personal para enviar no evento
      const [personal] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, personalId))
        .limit(1);

      // Evento para o aluno (proposta foi aceita)
      if (student) {
        this.chatGateway.server.emit('proposal_update', {
          action: 'proposal_accepted',
          proposal: this.mapToResponseDto(acceptedProposal),
          personal: {
            id: personal?.id,
            name: personal?.name,
            profileImageUrl: personal?.profileImageUrl,
          },
          userId: student.id,
          timestamp: new Date(),
        });
      }

      // Evento de match confirmado para ambos
      const matchData = {
        action: 'match_confirmed',
        proposal: this.mapToResponseDto(acceptedProposal),
        student: {
          id: student?.id,
          name: student?.name,
          profileImageUrl: student?.profileImageUrl,
        },
        personal: {
          id: personal?.id,
          name: personal?.name,
          profileImageUrl: personal?.profileImageUrl,
        },
        timestamp: new Date(),
      };

      this.chatGateway.server.emit('match_confirmed', matchData);

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao emitir eventos WebSocket:', error);
      // Não falhar a operação por causa de problemas de WebSocket
    }

    // Buscar dados do usuário para incluir na resposta
    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, acceptedProposal.studentId))
      .limit(1);

    return this.mapToResponseDto(acceptedProposal, student);
  }

  // ===== MÉTODOS PARA WEBHOOK DE PAGAMENTO =====

  async updatePaymentStatus(proposalId: string, paymentStatus: string, mpPaymentId?: string): Promise<void> {
    
    // Validar parâmetros obrigatórios
    if (!proposalId || !paymentStatus) {
      throw new Error('proposalId e paymentStatus são obrigatórios');
    }
    
    try {
      await this.db
        .update(proposals)
        .set({
          paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      // Se pagamento foi aprovado, notificar que proposta está pronta
      if (paymentStatus === 'approved' || paymentStatus === 'captured') {
      }

      // Se pagamento falhou, cancelar proposta automaticamente
      if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
        await this.db
          .update(proposals)
          .set({
            status: ProposalStatus.CANCELLED,
            updatedAt: new Date(),
          })
          .where(eq(proposals.id, proposalId));

      }

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao atualizar status do pagamento:', error);
      throw error;
    }
  }

  async findProposalByPaymentId(paymentId: string): Promise<any> {
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.paymentId, paymentId))
      .limit(1);

    return proposal;
  }

  // ===== TIMEOUT PARA PROPOSTAS NÃO PAGAS =====

  async cancelExpiredProposals(): Promise<{ cancelled: number }> {
    
    // Propostas pendentes há mais de 30 minutos com pagamento pendente
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    try {
      const expiredProposals = await this.db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.status, ProposalStatus.PENDING),
            eq(proposals.paymentStatus, 'pending'),
            lte(proposals.createdAt, thirtyMinutesAgo)
          )
        );

      if (expiredProposals.length === 0) {
        return { cancelled: 0 };
      }

      // Cancelar propostas expiradas
      const cancelledCount = await this.db
        .update(proposals)
        .set({
          status: ProposalStatus.CANCELLED,
          paymentStatus: 'expired',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(proposals.status, ProposalStatus.PENDING),
            eq(proposals.paymentStatus, 'pending'),
            lte(proposals.createdAt, thirtyMinutesAgo)
          )
        );


      // Processar reembolsos automáticos
      for (const proposal of expiredProposals) {
        if (proposal.paymentId && proposal.paymentStatus !== 'refunded') {
          try {
            
            await this.processAutomaticRefund(proposal.id, proposal.paymentId, 'Proposta expirada - timeout de 30 minutos');
            
          } catch (error) {
            console.error(`❌ [PROPOSALS] Erro no reembolso da proposta ${proposal.id}:`, error);
            
            // Marcar como erro para análise manual
            await this.db
              .update(proposals)
              .set({
                paymentStatus: 'refund_error',
                updatedAt: new Date(),
              })
              .where(eq(proposals.id, proposal.id));
          }
        }
      }

      return { cancelled: expiredProposals.length };

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao cancelar propostas expiradas:', error);
      throw error;
    }
  }

  // ===== AGENDAMENTO DE LEMBRETES DE PAGAMENTO =====

  private async schedulePaymentReminders(proposalId: string): Promise<void> {
    
    try {
      // Lembrete aos 10 minutos (20 min restantes)
      await this.jobsService.scheduleNotification({
        userId: '', // Será preenchido no processor
        type: 'push',
        template: 'payment-reminder',
        data: { proposalId, reminderType: 'first' },
        priority: 'high',
      }, 10);

      // Lembrete final aos 25 minutos (5 min restantes)
      await this.jobsService.scheduleNotification({
        userId: '', // Será preenchido no processor
        type: 'push',
        template: 'payment-reminder',
        data: { proposalId, reminderType: 'final' },
        priority: 'critical',
      }, 25);


    } catch (error) {
      console.error(`❌ [PROPOSALS] Erro ao agendar lembretes para proposta ${proposalId}:`, error);
    }
  }

  // ===== SISTEMA DE REEMBOLSO AUTOMÁTICO =====

  async processAutomaticRefund(proposalId: string, paymentId: string, reason: string): Promise<void> {
    
    try {
      // Verificar se é uma preferência do Mercado Pago ou pagamento simulado
      if (paymentId.startsWith('proposal_')) {
        // Pagamento real via Mercado Pago - processar reembolso via PaymentsService
        
        // Buscar pagamento no sistema de pagamentos
        const payment = await this.findPaymentByExternalReference(paymentId);
        
        if (payment) {
          await this.paymentsService.refundPayment(payment.id, reason);
        } else {
        }
        
      } else {
        // Pagamento simulado - apenas marcar como reembolsado
      }

      // Atualizar status da proposta
      await this.db
        .update(proposals)
        .set({
          paymentStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      
    } catch (error) {
      console.error(`❌ [PROPOSALS] Erro no reembolso automático:`, error);
      throw error;
    }
  }

  async findPaymentByExternalReference(externalReference: string): Promise<any> {
    // Buscar pagamento no banco de dados usando external reference
    try {
      const payment = await this.db.query.payments?.findFirst({
        where: (payments: any) => eq(payments.externalReference, externalReference),
      });
      
      return payment;
    } catch (error) {
      return null;
    }
  }

  // Reembolsar proposta não aceita (chamado manualmente)
  async refundUnacceptedProposal(proposalId: string, userId: string): Promise<{ message: string }> {
    // Buscar proposta diretamente do banco para ter acesso aos campos de pagamento
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (proposal.studentId !== userId) {
      throw new ForbiddenException('Você só pode reembolsar suas próprias propostas');
    }
    
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException('Apenas propostas pendentes podem ser reembolsadas');
    }

    if (!proposal.paymentId) {
      throw new BadRequestException('Proposta não possui pagamento associado');
    }

    if (proposal.paymentStatus === 'refunded') {
      throw new BadRequestException('Proposta já foi reembolsada');
    }

    // Processar reembolso
    await this.processAutomaticRefund(proposalId, proposal.paymentId, 'Reembolso solicitado pelo usuário');

    // Cancelar proposta
    await this.db
      .update(proposals)
      .set({
        status: ProposalStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    return { message: 'Proposta cancelada e reembolso processado com sucesso' };
  }

  // ===== INTEGRAÇÃO REAL COM MERCADO PAGO PARA PROPOSTAS =====

  private async createProposalPaymentPreference(
    createProposalDto: CreateProposalDto,
    userData: any,
    trainingDate: Date
  ): Promise<any> {
    try {
      console.log('💳 [PROPOSALS] ===== INÍCIO DO PROCESSAMENTO DE PAGAMENTO =====');
      console.log('👤 [PROPOSALS] User ID:', userData.id);
      console.log('📋 [PROPOSALS] Dados da proposta:', {
        price: createProposalDto.price,
        paymentMethod: createProposalDto.paymentMethod,
        cardId: createProposalDto.cardId,
        installments: createProposalDto.installments,
        saveCard: createProposalDto.saveCard,
        cardNickname: createProposalDto.cardNickname
      });
      
      // Gerar UUID válido para o classId temporário
      const tempClassId = randomUUID();
      console.log('🆔 [PROPOSALS] Class ID temporário:', tempClassId);
      
      // Calcular taxa da plataforma
      const platformFeePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10') / 100;
      const platformFee = createProposalDto.price * platformFeePercentage;
      const personalAmount = createProposalDto.price - platformFee;
      
      console.log('💰 [PROPOSALS] Cálculos financeiros:', {
        price: createProposalDto.price,
        platformFeePercentage: `${platformFeePercentage * 100}%`,
        platformFee,
        personalAmount
      });

      // ===== VERIFICAR SE DEVE PROCESSAR PAGAMENTO AUTOMÁTICO =====
      const hasCardId = !!createProposalDto.cardId;
      const isCardPayment = createProposalDto.paymentMethod === 'credit_card' || createProposalDto.paymentMethod === 'debit_card';
      
      console.log('🔍 [PROPOSALS] Verificações de pagamento automático:', {
        hasCardId,
        isCardPayment,
        shouldProcessAutomatic: hasCardId && isCardPayment
      });
      
      if (hasCardId && isCardPayment) {
        console.log('🚀 [PROPOSALS] Iniciando pagamento automático com cartão salvo...');
        
      try {
        const paymentDto = {
          classId: tempClassId,
          paymentMethod: createProposalDto.paymentMethod as StudentPaymentMethod,
          cardId: createProposalDto.cardId,
          cardData: null,
          installments: createProposalDto.installments || '1',
          saveCard: createProposalDto.saveCard || false,
          cardNickname: createProposalDto.cardNickname,
        };
        
        console.log('📤 [PROPOSALS] Dados enviados para processProposalPayment:', paymentDto);
        
        // Dados da proposta para o pagamento
        const proposalData = {
          price: createProposalDto.price,
          personalId: 'temp-personal-id', // Será definido quando personal aceitar
        };
        
        // Processar pagamento automático da proposta usando cartão salvo
        const paymentResult = await this.studentPaymentService.processProposalPayment(
          userData.id,
          paymentDto,
          proposalData
        );

          console.log('✅ [PROPOSALS] Resultado do pagamento automático:', paymentResult);

          const response = {
            success: true,
            paymentId: tempClassId,
            status: paymentResult.status,
            method: createProposalDto.paymentMethod,
            amount: createProposalDto.price,
            platformFee,
            personalAmount,
            message: paymentResult.message || 'Pagamento processado com sucesso.',
          };
          
          console.log('📤 [PROPOSALS] Resposta do pagamento automático:', response);
          console.log('🏁 [PROPOSALS] ===== FIM DO PAGAMENTO AUTOMÁTICO =====');
          
          return response;

      } catch (paymentError) {
        console.error('❌ [PROPOSALS] Erro no pagamento automático:', paymentError.message);
        console.error('❌ [PROPOSALS] Stack trace:', paymentError.stack);
        console.log('🚫 [PROPOSALS] Pagamento recusado - proposta não será criada');
        // Se o pagamento falhar, NÃO criar a proposta
        throw new BadRequestException(`Pagamento recusado: ${paymentError.message}`);
      }
      }

      // ===== FALLBACK: CRIAR PREFERÊNCIA MP (PIX, Mercado Pago, ou cartão sem ID) =====
      console.log('🔄 [PROPOSALS] Iniciando fallback para Mercado Pago...');

      // Criar dados para o Mercado Pago
      const preferenceData = {
        classId: tempClassId,
        title: `${createProposalDto.locationName} - ${trainingDate.toLocaleDateString()}`,
        totalAmount: createProposalDto.price,
        platformFee,
        personalAmount,
        studentEmail: userData.email,
        personalEmail: 'temp@personal.com', // Será definido quando aceita
        externalReference: tempClassId,
      };
      
      console.log('📋 [PROPOSALS] Dados da preferência MP:', preferenceData);

      // Criar preferência no Mercado Pago
      const mpPreference = await this.paymentsService['mercadoPagoService'].createPreference(preferenceData);
      
      console.log('✅ [PROPOSALS] Preferência MP criada:', {
        id: mpPreference.id,
        initPoint: mpPreference.initPoint,
        sandboxInitPoint: mpPreference.sandboxInitPoint
      });

      const response = {
        success: true,
        paymentId: tempClassId,
        status: 'pending',
        method: createProposalDto.paymentMethod,
        amount: createProposalDto.price,
        preferenceId: mpPreference.id,
        checkoutUrl: mpPreference.initPoint,
        sandboxCheckoutUrl: mpPreference.sandboxInitPoint,
        platformFee,
        personalAmount,
        message: 'Preferência de pagamento criada com sucesso.',
      };
      
      console.log('📤 [PROPOSALS] Resposta do fallback MP:', response);
      console.log('🏁 [PROPOSALS] ===== FIM DO FALLBACK MP =====');
      
      return response;

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao criar preferência MP:', error);
      
      // Fallback para simulação se MP falhar
      return this.simulatePaymentForProposal(createProposalDto);
    }
  }

  // ===== FALLBACK: SIMULAÇÃO DE PAGAMENTO =====

  private simulatePaymentForProposal(createProposalDto: CreateProposalDto): any {
    const paymentId = `proposal_payment_${Date.now()}`;
    

    // Simular diferentes métodos de pagamento
    switch (createProposalDto.paymentMethod) {
      case 'pix':
        return {
          success: true,
          paymentId,
          status: 'pending',
          method: 'pix',
          amount: createProposalDto.price,
          qrCode: `pix_qr_${paymentId}`,
          qrCodeBase64: Buffer.from(`pix_qr_${paymentId}`).toString('base64'),
          message: 'PIX gerado com sucesso (simulação). Escaneie o QR Code para pagar.',
        };

      case 'credit_card':
      case 'debit_card':
        return {
          success: true,
          paymentId,
          status: 'approved', // Cartão aprovado imediatamente (mock)
          method: createProposalDto.paymentMethod,
          amount: createProposalDto.price,
          message: 'Pagamento aprovado com sucesso (simulação).',
        };

      case 'mercado_pago':
        return {
          success: true,
          paymentId,
          status: 'pending',
          method: 'mercado_pago',
          amount: createProposalDto.price,
          checkoutUrl: `https://mercadopago.com/checkout/${paymentId}`,
          message: 'Redirecionando para o Mercado Pago (simulação)...',
        };

      default:
        return {
          success: false,
          message: 'Método de pagamento não suportado',
        };
    }
  }

  async getProposalStats(userId: string, userType: string): Promise<any> {
    const conditions = userType === 'student' 
      ? [eq(proposals.studentId, userId)]
      : [eq(proposals.status, ProposalStatus.PENDING)];

    const [stats] = await this.db
      .select({
        total: count(),
        pending: sql<number>`count(case when ${proposals.status} = 'pending' then 1 end)`,
        matched: sql<number>`count(case when ${proposals.status} = 'matched' then 1 end)`,
        completed: sql<number>`count(case when ${proposals.status} = 'completed' then 1 end)`,
        cancelled: sql<number>`count(case when ${proposals.status} = 'cancelled' then 1 end)`,
      })
      .from(proposals)
      .where(and(...conditions));

    return stats;
  }

  private mapToResponseDto(proposal: any, student?: any): ProposalResponseDto {

    // Usar dados do usuário se fornecidos, senão usar dados da proposta (para compatibilidade)
    const studentFirstName = student?.firstName || proposal.studentFirstName;
    const studentLastName = student?.lastName || proposal.studentLastName;
    const studentEmail = student?.email || proposal.studentEmail;

    const studentName = studentFirstName && studentLastName 
      ? `${studentFirstName} ${studentLastName}`.trim()
      : 'Nome não disponível';


    return {
      id: proposal.id,
      studentId: proposal.studentId,
      student: {
        id: proposal.studentId,
        name: studentName,
        email: studentEmail || '',
        firstName: studentFirstName || '',
        lastName: studentLastName || '',
      },
      locationName: proposal.locationName,
      locationAddress: proposal.locationAddress,
      trainingDate: proposal.trainingDate,
      trainingTime: proposal.trainingTime,
      durationMinutes: proposal.durationMinutes,
      modalityName: proposal.modalityName,
      price: parseFloat(proposal.price),
      additionalNotes: proposal.additionalNotes,
      status: proposal.status,
      paymentStatus: proposal.paymentStatus,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }

  /**
   * Verifica e limpa propostas expiradas em tempo real
   * Chamado quando propostas são consultadas para garantir dados atualizados
   */
  async checkAndCleanExpiredProposals(): Promise<void> {
    try {
      const now = new Date();
      
      // Buscar candidatas (até amanhã) e combinar data + hora em memória
      const candidates = await this.db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.status, ProposalStatus.PENDING),
            lt(proposals.trainingDate, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
          )
        );

      const expiredProposals = candidates.filter((p: any) => {
        try {
          const start = new Date(p.trainingDate);
          const [hhStr, mmStr] = String(p.trainingTime ?? '00:00').split(':');
          const hh = Number(hhStr ?? 0);
          const mm = Number(mmStr ?? 0);
          start.setHours(hh, mm, 0, 0);
          return start.getTime() < now.getTime();
        } catch (_) {
          return false;
        }
      });

      if (expiredProposals.length === 0) {
        return; // Nenhuma proposta expirada
      }


      // Deletar propostas expiradas
      for (const proposal of expiredProposals) {
        await this.db
          .delete(proposals)
          .where(eq(proposals.id, proposal.id));


        // Notificar o aluno sobre a expiração via WebSocket
        this.chatGateway.server.emit('proposal_expired', {
          action: 'proposal_expired',
          proposalId: proposal.id,
          studentId: proposal.studentId,
          location: proposal.locationName,
          trainingDate: proposal.trainingDate,
          trainingTime: proposal.trainingTime,
          reason: 'Horário de início expirado sem match',
          timestamp: new Date(),
        });
      }

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro na limpeza em tempo real:', error);
    }
  }
}
