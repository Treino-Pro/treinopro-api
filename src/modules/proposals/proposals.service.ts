import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { proposals, users, classes } from '../../database/schema';
import { eq, and, desc, gte, lte, ilike, count, sql } from 'drizzle-orm';
import { CreateProposalDto, UpdateProposalDto, ProposalQueryDto, ProposalResponseDto, ProposalListResponseDto, ProposalStatus } from './dto/proposals.dto';
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
// Enum ClassStatus não exportado no schema, usando string diretamente

@Injectable()
export class ProposalsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly studentPaymentService: StudentPaymentMethodsService,
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
    console.log('💳 [PROPOSALS] Processando pagamento para proposta...');
    
    try {
      // Por enquanto, simular pagamento para propostas (mock)
      // TODO: Integrar com sistema real de pagamento
      const paymentResult = this.simulatePaymentForProposal(createProposalDto);

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
        this.scheduleProposalExpiry(proposal.id);
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
          checkoutUrl: paymentResult.checkoutUrl,
          qrCode: paymentResult.qrCode,
          qrCodeBase64: paymentResult.qrCodeBase64,
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

      // TODO: Aqui deveria processar reembolso via PaymentsService
      for (const proposal of expiredProposals) {
        console.log(`💸 [PROPOSALS] Reembolso pendente para proposta: ${proposal.id}`);
        // await this.paymentsService.refundPayment(proposal.paymentId, 'Proposta expirada');
      }

      return { cancelled: expiredProposals.length };

    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao cancelar propostas expiradas:', error);
      throw error;
    }
  }

  async scheduleProposalExpiry(proposalId: string): Promise<void> {
    // TODO: Implementar com Redis/BullMQ para job scheduling
    console.log(`⏰ [PROPOSALS] Agendando expiração para proposta: ${proposalId} em 30 minutos`);
    
    // Por enquanto, apenas log. Em produção usaria Redis/Bull
    setTimeout(async () => {
      try {
        const proposal = await this.getProposalById(proposalId, '', 'admin');
        if (proposal.status === ProposalStatus.PENDING && proposal.paymentStatus === 'pending') {
          await this.updatePaymentStatus(proposalId, 'expired');
        }
      } catch (error) {
        console.error('❌ [PROPOSALS] Erro no timeout da proposta:', error);
      }
    }, 30 * 60 * 1000); // 30 minutos
  }

  // ===== SIMULAÇÃO DE PAGAMENTO PARA PROPOSTAS =====

  private simulatePaymentForProposal(createProposalDto: CreateProposalDto): any {
    const paymentId = `proposal_payment_${Date.now()}`;
    
    console.log(`💳 [PROPOSALS] Simulando pagamento ${createProposalDto.paymentMethod} para R$ ${createProposalDto.price}`);

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
          message: 'PIX gerado com sucesso. Escaneie o QR Code para pagar.',
        };

      case 'credit_card':
      case 'debit_card':
        return {
          success: true,
          paymentId,
          status: 'approved', // Cartão aprovado imediatamente (mock)
          method: createProposalDto.paymentMethod,
          amount: createProposalDto.price,
          message: 'Pagamento aprovado com sucesso.',
        };

      case 'mercado_pago':
        return {
          success: true,
          paymentId,
          status: 'pending',
          method: 'mercado_pago',
          amount: createProposalDto.price,
          checkoutUrl: `https://mercadopago.com/checkout/${paymentId}`,
          message: 'Redirecionando para o Mercado Pago...',
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
