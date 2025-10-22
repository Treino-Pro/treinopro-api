import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, and, desc, count, avg, sql } from 'drizzle-orm';
import { ratings, users, classes } from '../../database/schema';
import { 
  CreateRatingDto, 
  UpdateRatingDto, 
  RatingResponseDto, 
  RatingStatsDto, 
  RatingSummaryDto,
  RatingFiltersDto,
  CreateAutomaticRatingsDto,
  RatingType,
  RatingStatus
} from './dto/ratings.dto';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class RatingsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    private chatGateway: ChatGateway,
  ) {}

  // Criar nova avaliação
  async createRating(createRatingDto: CreateRatingDto, userId: string): Promise<RatingResponseDto> {
    // Verificar se a aula existe e está concluída
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, createRatingDto.classId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    if (classData.status !== 'completed') {
      throw new BadRequestException('Apenas aulas concluídas podem ser avaliadas');
    }

    // Determinar quem está sendo avaliado
    let ratedUserId: string;
    if (createRatingDto.type === RatingType.STUDENT_TO_PERSONAL) {
      if (classData.studentId !== userId) {
        throw new ForbiddenException('Apenas o aluno pode avaliar o personal trainer');
      }
      ratedUserId = classData.personalId;
    } else {
      if (classData.personalId !== userId) {
        throw new ForbiddenException('Apenas o personal trainer pode avaliar o aluno');
      }
      ratedUserId = classData.studentId;
    }

    // Verificar se já existe uma avaliação para esta aula e tipo
    const existingRating = await this.db.query.ratings.findFirst({
      where: and(
        eq(ratings.classId, createRatingDto.classId),
        eq(ratings.raterId, userId),
        eq(ratings.type, createRatingDto.type)
      ),
    });

    if (existingRating) {
      throw new BadRequestException('Avaliação já existe para esta aula');
    }

    // Criar a avaliação
    const [newRating] = await this.db
      .insert(ratings)
      .values({
        classId: createRatingDto.classId,
        raterId: userId,
        ratedId: ratedUserId,
        type: createRatingDto.type,
        rating: createRatingDto.rating,
        comment: createRatingDto.comment,
        status: RatingStatus.COMPLETED,
        completedAt: new Date(),
        
        // Campos específicos para avaliação do personal
        punctuality: createRatingDto.punctuality,
        communication: createRatingDto.communication,
        knowledge: createRatingDto.knowledge,
        motivation: createRatingDto.motivation,
        equipment: createRatingDto.equipment,
        
        // Campos específicos para avaliação do aluno
        studentEngagement: createRatingDto.studentEngagement,
        studentEffort: createRatingDto.studentEffort,
        studentProgress: createRatingDto.studentProgress,
        
        // Campos específicos para auto-avaliação do personal
        personalProfessionalism: createRatingDto.personalProfessionalism,
        personalKnowledge: createRatingDto.personalKnowledge,
        personalMotivation: createRatingDto.personalMotivation,
        personalCommunication: createRatingDto.personalCommunication,
      })
      .returning();

    // ===== ATUALIZAR RATING DO USUÁRIO AVALIADO =====
    await this.updateUserRating(ratedUserId);

    // ===== EMITIR EVENTO WEBSOCKET =====
    try {
      const eventData = {
        classId: createRatingDto.classId,
        ratingType: createRatingDto.type,
        raterId: userId,
        ratedId: ratedUserId,
        rating: createRatingDto.rating,
        timestamp: new Date(),
      };
      
      console.log('⭐ [RATINGS] Emitindo evento rating_created:', eventData);
      
      // Evento para atualizar estado das aulas
      this.chatGateway.server.emit('rating_created', eventData);

      console.log('✅ [RATINGS] Evento WebSocket emitido: rating_created');
    } catch (error) {
      console.error('❌ [RATINGS] Erro ao emitir evento WebSocket:', error);
    }

    return this.formatRatingResponse(newRating);
  }

  // Atualizar avaliação existente
  async updateRating(ratingId: string, updateRatingDto: UpdateRatingDto, userId: string): Promise<RatingResponseDto> {
    const existingRating = await this.db.query.ratings.findFirst({
      where: and(eq(ratings.id, ratingId), eq(ratings.raterId, userId)),
    });

    if (!existingRating) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    if (existingRating.status === RatingStatus.COMPLETED) {
      throw new BadRequestException('Avaliação já concluída não pode ser alterada');
    }

    const [updatedRating] = await this.db
      .update(ratings)
      .set({
        ...updateRatingDto,
        updatedAt: new Date(),
        status: updateRatingDto.rating ? RatingStatus.COMPLETED : existingRating.status,
        completedAt: updateRatingDto.rating ? new Date() : existingRating.completedAt,
      })
      .where(eq(ratings.id, ratingId))
      .returning();

    return this.formatRatingResponse(updatedRating);
  }

  // Obter avaliação por ID
  async getRatingById(ratingId: string, userId: string): Promise<RatingResponseDto> {
    const rating = await this.db.query.ratings.findFirst({
      where: and(eq(ratings.id, ratingId), eq(ratings.raterId, userId)),
      with: {
        rated: true,
        class: true,
      },
    });

    if (!rating) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    return this.formatRatingResponse(rating);
  }

  // Listar avaliações com filtros
  async getRatings(filters: RatingFiltersDto, userId: string): Promise<RatingResponseDto[]> {
    const whereConditions = [eq(ratings.raterId, userId)];

    if (filters.type) {
      whereConditions.push(eq(ratings.type, filters.type));
    }

    if (filters.status) {
      whereConditions.push(eq(ratings.status, filters.status));
    }

    if (filters.classId) {
      whereConditions.push(eq(ratings.classId, filters.classId));
    }

    if (filters.minRating) {
      whereConditions.push(sql`${ratings.rating} >= ${filters.minRating}`);
    }

    if (filters.maxRating) {
      whereConditions.push(sql`${ratings.rating} <= ${filters.maxRating}`);
    }

    if (filters.startDate) {
      whereConditions.push(sql`${ratings.createdAt} >= ${filters.startDate}`);
    }

    if (filters.endDate) {
      whereConditions.push(sql`${ratings.createdAt} <= ${filters.endDate}`);
    }

    const ratingsList = await this.db.query.ratings.findMany({
      where: and(...whereConditions),
      with: {
        rated: true,
        class: true,
      },
      orderBy: [desc(ratings.createdAt)],
    });

    return ratingsList.map(rating => this.formatRatingResponse(rating));
  }

  // Obter avaliações recebidas por um usuário
  async getReceivedRatings(userId: string, filters?: RatingFiltersDto): Promise<RatingResponseDto[]> {
    const whereConditions = [eq(ratings.ratedId, userId)];

    if (filters?.type) {
      whereConditions.push(eq(ratings.type, filters.type));
    }

    if (filters?.status) {
      whereConditions.push(eq(ratings.status, filters.status));
    }

    if (filters?.minRating) {
      whereConditions.push(sql`${ratings.rating} >= ${filters.minRating}`);
    }

    if (filters?.maxRating) {
      whereConditions.push(sql`${ratings.rating} <= ${filters.maxRating}`);
    }

    const ratingsList = await this.db.query.ratings.findMany({
      where: and(...whereConditions),
      with: {
        rater: true,
        class: true,
      },
      orderBy: [desc(ratings.createdAt)],
    });

    return ratingsList.map(rating => this.formatRatingResponse(rating));
  }

  // Obter estatísticas de avaliações
  async getRatingStats(userId: string): Promise<RatingStatsDto> {
    // Estatísticas gerais
    const [totalRatings] = await this.db
      .select({ count: count() })
      .from(ratings)
      .where(eq(ratings.raterId, userId));

    const [averageRating] = await this.db
      .select({ avg: avg(ratings.rating) })
      .from(ratings)
      .where(eq(ratings.raterId, userId));

    // Buscar todas as avaliações para calcular distribuição
    const allRatings = await this.db.query.ratings.findMany({
      where: eq(ratings.raterId, userId),
      columns: { rating: true },
    });

    const ratingDistribution = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };

    allRatings.forEach(rating => {
      const ratingStr = rating.rating.toString() as keyof typeof ratingDistribution;
      if (ratingDistribution[ratingStr] !== undefined) {
        ratingDistribution[ratingStr]++;
      }
    });

    // Contagem por status
    const [completedCount] = await this.db
      .select({ count: count() })
      .from(ratings)
      .where(and(eq(ratings.raterId, userId), eq(ratings.status, RatingStatus.COMPLETED)));

    const [pendingCount] = await this.db
      .select({ count: count() })
      .from(ratings)
      .where(and(eq(ratings.raterId, userId), eq(ratings.status, RatingStatus.PENDING)));

    const [cancelledCount] = await this.db
      .select({ count: count() })
      .from(ratings)
      .where(and(eq(ratings.raterId, userId), eq(ratings.status, RatingStatus.CANCELLED)));

    // Estatísticas específicas para avaliações de personal
    const personalStats = await this.getPersonalRatingStats(userId);
    
    // Estatísticas específicas para avaliações de aluno
    const studentStats = await this.getStudentRatingStats(userId);

    return {
      totalRatings: totalRatings.count,
      averageRating: Number(averageRating.avg) || 0,
      ratingDistribution,
      completedRatings: completedCount.count,
      pendingRatings: pendingCount.count,
      cancelledRatings: cancelledCount.count,
      studentToPersonal: personalStats,
      personalToStudent: studentStats,
    };
  }

  // Obter resumo de avaliações de um usuário
  async getRatingSummary(userId: string): Promise<RatingSummaryDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Estatísticas gerais
    const [totalRatings] = await this.db
      .select({ count: count() })
      .from(ratings)
      .where(eq(ratings.ratedId, userId));

    const [averageRating] = await this.db
      .select({ avg: avg(ratings.rating) })
      .from(ratings)
      .where(eq(ratings.ratedId, userId));

    // Avaliações recentes
    const recentRatings = await this.db.query.ratings.findMany({
      where: eq(ratings.ratedId, userId),
      with: {
        rater: true,
        class: true,
      },
      orderBy: [desc(ratings.createdAt)],
      limit: 5,
    });

    // Breakdown específico baseado no tipo de usuário
    const ratingBreakdown = await this.getUserRatingBreakdown(userId, user.role);

    return {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      totalRatings: totalRatings.count,
      averageRating: Number(averageRating.avg) || 0,
      ratingBreakdown,
      recentRatings: recentRatings.map(rating => this.formatRatingResponse(rating)),
    };
  }

  // Criar avaliações automáticas após aula concluída
  async createAutomaticRatings(createDto: CreateAutomaticRatingsDto): Promise<void> {
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, createDto.classId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    if (classData.status !== 'completed') {
      throw new BadRequestException('Apenas aulas concluídas podem gerar avaliações automáticas');
    }

    // Criar avaliação pendente para o aluno avaliar o personal
    await this.db.insert(ratings).values({
      classId: createDto.classId,
      raterId: classData.studentId,
      ratedId: classData.personalId,
      type: RatingType.STUDENT_TO_PERSONAL,
      rating: 0, // Será preenchido quando o usuário avaliar
      status: RatingStatus.PENDING,
    });

    // Criar avaliação pendente para o personal avaliar o aluno
    await this.db.insert(ratings).values({
      classId: createDto.classId,
      raterId: classData.personalId,
      ratedId: classData.studentId,
      type: RatingType.PERSONAL_TO_STUDENT,
      rating: 0, // Será preenchido quando o usuário avaliar
      status: RatingStatus.PENDING,
    });
  }

  // Cancelar avaliação
  async cancelRating(ratingId: string, userId: string): Promise<RatingResponseDto> {
    const existingRating = await this.db.query.ratings.findFirst({
      where: and(eq(ratings.id, ratingId), eq(ratings.raterId, userId)),
    });

    if (!existingRating) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    if (existingRating.status === RatingStatus.COMPLETED) {
      throw new BadRequestException('Avaliação já concluída não pode ser cancelada');
    }

    const [updatedRating] = await this.db
      .update(ratings)
      .set({
        status: RatingStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(ratings.id, ratingId))
      .returning();

    return this.formatRatingResponse(updatedRating);
  }

  // Métodos auxiliares privados
  private async getPersonalRatingStats(userId: string) {
    const personalRatings = await this.db.query.ratings.findMany({
      where: and(
        eq(ratings.raterId, userId),
        eq(ratings.type, RatingType.STUDENT_TO_PERSONAL)
      ),
    });

    const total = personalRatings.length;
    const average = total > 0 ? personalRatings.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    
    const punctuality = this.calculateAverage(personalRatings, 'punctuality');
    const communication = this.calculateAverage(personalRatings, 'communication');
    const knowledge = this.calculateAverage(personalRatings, 'knowledge');
    const motivation = this.calculateAverage(personalRatings, 'motivation');
    const equipment = this.calculateAverage(personalRatings, 'equipment');

    return {
      total,
      average,
      punctuality,
      communication,
      knowledge,
      motivation,
      equipment,
    };
  }

  private async getStudentRatingStats(userId: string) {
    const studentRatings = await this.db.query.ratings.findMany({
      where: and(
        eq(ratings.raterId, userId),
        eq(ratings.type, RatingType.PERSONAL_TO_STUDENT)
      ),
    });

    const total = studentRatings.length;
    const average = total > 0 ? studentRatings.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    
    const engagement = this.calculateAverage(studentRatings, 'studentEngagement');
    const effort = this.calculateAverage(studentRatings, 'studentEffort');
    const progress = this.calculateAverage(studentRatings, 'studentProgress');

    return {
      total,
      average,
      engagement,
      effort,
      progress,
    };
  }

  private async getUserRatingBreakdown(userId: string, userRole: string) {
    const receivedRatings = await this.db.query.ratings.findMany({
      where: eq(ratings.ratedId, userId),
    });

    const breakdown: any = {};

    if (userRole === 'personal') {
      breakdown.punctuality = this.calculateAverage(receivedRatings, 'punctuality');
      breakdown.communication = this.calculateAverage(receivedRatings, 'communication');
      breakdown.knowledge = this.calculateAverage(receivedRatings, 'knowledge');
      breakdown.motivation = this.calculateAverage(receivedRatings, 'motivation');
      breakdown.equipment = this.calculateAverage(receivedRatings, 'equipment');
    } else {
      breakdown.engagement = this.calculateAverage(receivedRatings, 'studentEngagement');
      breakdown.effort = this.calculateAverage(receivedRatings, 'studentEffort');
      breakdown.progress = this.calculateAverage(receivedRatings, 'studentProgress');
    }

    return breakdown;
  }

  private calculateAverage(ratings: any[], field: string): number {
    const values = ratings
      .map(r => r[field])
      .filter(v => v !== null && v !== undefined);
    
    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  }

  private formatRatingResponse(rating: any): RatingResponseDto {
    return {
      id: rating.id,
      classId: rating.classId,
      raterId: rating.raterId,
      ratedId: rating.ratedId,
      type: rating.type,
      rating: rating.rating,
      comment: rating.comment,
      status: rating.status,
      punctuality: rating.punctuality,
      communication: rating.communication,
      knowledge: rating.knowledge,
      motivation: rating.motivation,
      equipment: rating.equipment,
      studentEngagement: rating.studentEngagement,
      studentEffort: rating.studentEffort,
      studentProgress: rating.studentProgress,
      personalProfessionalism: rating.personalProfessionalism,
      personalKnowledge: rating.personalKnowledge,
      personalMotivation: rating.personalMotivation,
      personalCommunication: rating.personalCommunication,
      ratedUser: rating.rated ? {
        id: rating.rated.id,
        name: rating.rated.name,
        email: rating.rated.email,
        role: rating.rated.role,
      } : undefined,
      class: rating.class ? {
        id: rating.class.id,
        date: rating.class.date,
        time: rating.class.time,
        location: rating.class.location,
        duration: rating.class.duration,
      } : undefined,
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
      completedAt: rating.completedAt,
    };
  }

  // Buscar usuário por ID
  async getUserById(userId: string): Promise<{ id: string; userType: string } | null> {
    try {
      const user = await this.db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          id: true,
          userType: true,
        },
      });

      return user ? {
        id: user.id,
        userType: user.userType,
      } : null;
    } catch (error) {
      console.error('❌ [RATINGS] Erro ao buscar usuário:', error);
      return null;
    }
  }

  // Atualizar rating médio do usuário
  private async updateUserRating(userId: string): Promise<void> {
    try {
      // Buscar todas as avaliações recebidas pelo usuário que estão completas
      const userRatings = await this.db.query.ratings.findMany({
        where: and(
          eq(ratings.ratedId, userId),
          eq(ratings.status, RatingStatus.COMPLETED)
        ),
        columns: {
          rating: true,
        },
      });

      if (userRatings.length === 0) {
        // Se não há avaliações, manter o rating inicial de 5.0
        console.log(`⭐ [RATINGS] Usuário ${userId} não tem avaliações, mantendo rating inicial 5.0`);
        return;
      }

      // Calcular média das avaliações
      const totalRating = userRatings.reduce((sum, r) => sum + r.rating, 0);
      const averageRating = totalRating / userRatings.length;
      const roundedRating = Math.round(averageRating * 100) / 100; // Arredondar para 2 casas decimais

      // Atualizar o campo rating na tabela users
      await this.db
        .update(users)
        .set({
          rating: roundedRating.toFixed(2),
          totalRatings: userRatings.length,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`⭐ [RATINGS] Rating do usuário ${userId} atualizado: ${roundedRating.toFixed(2)} (${userRatings.length} avaliações)`);
    } catch (error) {
      console.error('❌ [RATINGS] Erro ao atualizar rating do usuário:', error);
      throw error;
    }
  }
}
