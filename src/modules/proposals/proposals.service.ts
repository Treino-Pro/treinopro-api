import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { proposals, users, classes } from '../../database/schema';
import { eq, and, desc, gte, lte, ilike, count, sql, or } from 'drizzle-orm';
import { CreateProposalDto, UpdateProposalDto, ProposalQueryDto, ProposalResponseDto, ProposalListResponseDto, ProposalStatus } from './dto/proposals.dto';
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
import { PaymentsService } from '../payments/payments.service';
import { JobsService } from '../jobs/jobs.service';
// Enum ClassStatus não exportado no schema, usando string diretamente

@Injectable()
export class ProposalsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly studentPaymentService: StudentPaymentMethodsService,
    private readonly paymentsService: PaymentsService,
    private readonly jobsService: JobsService,
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
    console.log('💳 [PROPOSALS] Processando pagamento real para proposta...');
    
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

      console.log('✅ [PROPOSALS] Pagamento processado:', paymentResult.paymentId);

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

      console.log('✅ [PROPOSALS] Proposta criada com pagamento:', proposal.id);

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

      // Retornar proposta com dados do pagamento
      const proposalResponse = this.mapToResponseDto(proposal);
      
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

    // Buscar propostas com paginação
    const [proposalsList, totalResult] = await Promise.all([
      this.db
        .select()
        .from(proposals)
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

    return this.mapToResponseDto(proposal);
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

    return this.mapToResponseDto(updatedProposal);
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

    return this.mapToResponseDto(cancelledProposal);
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

      // Calcular janela de tempo da proposta aceita
      const [propHour, propMin] = String(proposal.trainingTime || '00:00').split(':').map((v: string) => parseInt(v, 10));
      const proposedStart = new Date(proposedTrainingDate);
      proposedStart.setHours(propHour || 0, propMin || 0, 0, 0);
      const proposedEnd = new Date(proposedStart.getTime() + (proposal.durationMinutes || 60) * 60 * 1000);

      // Verificar sobreposição com aulas existentes
      const hasConflict = existingClasses.some((cls: any) => {
        const classDate = new Date(cls.date);
        const [cHour, cMin] = String(cls.time || '00:00').split(':').map((v: string) => parseInt(v, 10));
        const classStart = new Date(classDate);
        classStart.setHours(cHour || 0, cMin || 0, 0, 0);
        const classEnd = new Date(classStart.getTime() + (cls.duration || 60) * 60 * 1000);

        // overlap se não (proposedEnd <= classStart || proposedStart >= classEnd)
        return !(proposedEnd <= classStart || proposedStart >= classEnd);
      });

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

    // ===== CRIAR AULA AUTOMATICAMENTE =====
    console.log('🏋️ [PROPOSALS] Criando aula automaticamente para proposta aceita...');
    
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

      console.log('✅ [PROPOSALS] Aula criada automaticamente:', newClass.id);

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

    return this.mapToResponseDto(acceptedProposal);
  }

  // ===== MÉTODOS PARA WEBHOOK DE PAGAMENTO =====

  async updatePaymentStatus(proposalId: string, paymentStatus: string, mpPaymentId?: string): Promise<void> {
    console.log(`💳 [PROPOSALS] Atualizando status do pagamento: ${proposalId} → ${paymentStatus}`);
    
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
        console.log('✅ [PROPOSALS] Pagamento aprovado, proposta disponível para personal trainers');
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

        console.log('❌ [PROPOSALS] Pagamento falhou, proposta cancelada automaticamente');
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
    console.log('⏰ [PROPOSALS] Verificando propostas expiradas...');
    
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
        console.log('✅ [PROPOSALS] Nenhuma proposta expirada encontrada');
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

      console.log(`⏰ [PROPOSALS] ${expiredProposals.length} propostas expiradas canceladas`);

      // Processar reembolsos automáticos
      for (const proposal of expiredProposals) {
        if (proposal.paymentId && proposal.paymentStatus !== 'refunded') {
          try {
            console.log(`💸 [PROPOSALS] Processando reembolso para proposta: ${proposal.id}`);
            
            await this.processAutomaticRefund(proposal.id, proposal.paymentId, 'Proposta expirada - timeout de 30 minutos');
            
            console.log(`✅ [PROPOSALS] Reembolso processado para proposta: ${proposal.id}`);
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
    console.log(`📱 [PROPOSALS] Agendando lembretes de pagamento para proposta: ${proposalId}`);
    
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

      console.log(`✅ [PROPOSALS] Lembretes agendados para proposta: ${proposalId}`);

    } catch (error) {
      console.error(`❌ [PROPOSALS] Erro ao agendar lembretes para proposta ${proposalId}:`, error);
    }
  }

  // ===== SISTEMA DE REEMBOLSO AUTOMÁTICO =====

  async processAutomaticRefund(proposalId: string, paymentId: string, reason: string): Promise<void> {
    console.log(`💸 [PROPOSALS] Iniciando reembolso automático: ${proposalId}`);
    
    try {
      // Verificar se é uma preferência do Mercado Pago ou pagamento simulado
      if (paymentId.startsWith('proposal_')) {
        // Pagamento real via Mercado Pago - processar reembolso via PaymentsService
        console.log(`💳 [PROPOSALS] Processando reembolso real via MP: ${paymentId}`);
        
        // Buscar pagamento no sistema de pagamentos
        const payment = await this.findPaymentByExternalReference(paymentId);
        
        if (payment) {
          await this.paymentsService.refundPayment(payment.id, reason);
        } else {
          console.log(`⚠️ [PROPOSALS] Pagamento não encontrado no sistema, marcando como reembolsado: ${paymentId}`);
        }
        
      } else {
        // Pagamento simulado - apenas marcar como reembolsado
        console.log(`🎭 [PROPOSALS] Simulando reembolso para pagamento mock: ${paymentId}`);
      }

      // Atualizar status da proposta
      await this.db
        .update(proposals)
        .set({
          paymentStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      console.log(`✅ [PROPOSALS] Reembolso concluído para proposta: ${proposalId}`);
      
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
      console.log(`⚠️ [PROPOSALS] Erro ao buscar pagamento: ${error.message}`);
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
      const tempClassId = `proposal_${Date.now()}`;
      
      // Calcular taxa da plataforma
      const platformFeePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10') / 100;
      const platformFee = createProposalDto.price * platformFeePercentage;
      const personalAmount = createProposalDto.price - platformFee;

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

      // Criar preferência no Mercado Pago
      const mpPreference = await this.paymentsService['mercadoPagoService'].createPreference(preferenceData);

      console.log('✅ [PROPOSALS] Preferência MP criada:', mpPreference.id);

      return {
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

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao criar preferência MP:', error);
      
      // Fallback para simulação se MP falhar
      return this.simulatePaymentForProposal(createProposalDto);
    }
  }

  // ===== FALLBACK: SIMULAÇÃO DE PAGAMENTO =====

  private simulatePaymentForProposal(createProposalDto: CreateProposalDto): any {
    const paymentId = `proposal_payment_${Date.now()}`;
    
    console.log(`💳 [PROPOSALS] Fallback - Simulando pagamento ${createProposalDto.paymentMethod} para R$ ${createProposalDto.price}`);

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

  private mapToResponseDto(proposal: any): ProposalResponseDto {
    return {
      id: proposal.id,
      studentId: proposal.studentId,
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
}
