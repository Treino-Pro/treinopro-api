import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { proposals, users } from '../../database/schema';
import { eq, and, desc, gte, lte, ilike, count, sql } from 'drizzle-orm';
import { CreateProposalDto, UpdateProposalDto, ProposalQueryDto, ProposalResponseDto, ProposalListResponseDto, ProposalStatus } from './dto/proposals.dto';

@Injectable()
export class ProposalsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
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

    // Criar a proposta
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
      })
      .returning();

    return this.mapToResponseDto(proposal);
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

    // TODO: Aqui seria criada uma aula (class) automaticamente
    // Por enquanto, apenas retornamos a proposta aceita

    return this.mapToResponseDto(acceptedProposal);
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
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }
}
