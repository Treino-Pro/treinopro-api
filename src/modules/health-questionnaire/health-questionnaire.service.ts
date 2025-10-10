import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { healthQuestionnaires } from '../../database/schema/health';
import { users } from '../../database/schema/users';
import { eq, and, desc } from 'drizzle-orm';
import { 
  CreateHealthQuestionnaireDto, 
  UpdateHealthQuestionnaireDto,
  HealthQuestionnaireResponseDto,
  HealthQuestionnaireListResponseDto,
  StudentHealthQuestionnaireDto
} from './dto/health-questionnaire.dto';

@Injectable()
export class HealthQuestionnaireService {
  constructor(@Inject('DATABASE_CONNECTION') private readonly db: any) {}

  /**
   * Criar ou atualizar questionário de saúde do usuário
   */
  async createOrUpdateQuestionnaire(
    userId: string,
    dto: CreateHealthQuestionnaireDto
  ): Promise<HealthQuestionnaireResponseDto> {
    console.log(`🏥 [HEALTH] Criando/atualizando questionário para usuário: ${userId}`);
    
    // Verificar se já existe um questionário
    const existing = await this.db
      .select()
      .from(healthQuestionnaires)
      .where(eq(healthQuestionnaires.userId, userId))
      .limit(1);

    const isCompleted = this.isQuestionnaireDataComplete(dto);
    const completedAt = isCompleted ? new Date() : null;

    if (existing.length > 0) {
      // Atualizar questionário existente
      console.log(`🏥 [HEALTH] Atualizando questionário existente: ${existing[0].id}`);
      
      const [updated] = await this.db
        .update(healthQuestionnaires)
        .set({
          medicalCondition: dto.medicalCondition || null,
          regularMedication: dto.regularMedication || null,
          chronicInjury: dto.chronicInjury || null,
          trainingGoal: dto.trainingGoal || null,
          dietaryRestrictions: dto.dietaryRestrictions || null,
          completedAt,
          updatedAt: new Date(),
        })
        .where(eq(healthQuestionnaires.id, existing[0].id))
        .returning();

      return this.mapToResponseDto(updated);
    } else {
      // Criar novo questionário
      console.log(`🏥 [HEALTH] Criando novo questionário para usuário: ${userId}`);
      
      const [created] = await this.db
        .insert(healthQuestionnaires)
        .values({
          userId,
          medicalCondition: dto.medicalCondition || null,
          regularMedication: dto.regularMedication || null,
          chronicInjury: dto.chronicInjury || null,
          trainingGoal: dto.trainingGoal || null,
          dietaryRestrictions: dto.dietaryRestrictions || null,
          completedAt,
        })
        .returning();

      return this.mapToResponseDto(created);
    }
  }

  /**
   * Obter questionário de saúde do usuário
   */
  async getQuestionnaireByUserId(userId: string): Promise<HealthQuestionnaireResponseDto | null> {
    console.log(`🏥 [HEALTH] Buscando questionário para usuário: ${userId}`);
    
    const [questionnaire] = await this.db
      .select()
      .from(healthQuestionnaires)
      .where(eq(healthQuestionnaires.userId, userId))
      .limit(1);

    if (!questionnaire) {
      console.log(`🏥 [HEALTH] Questionário não encontrado para usuário: ${userId}`);
      return null;
    }

    return this.mapToResponseDto(questionnaire);
  }

  /**
   * Verificar se questionário foi completado
   */
  async isQuestionnaireCompleted(userId: string): Promise<boolean> {
    const questionnaire = await this.getQuestionnaireByUserId(userId);
    return questionnaire?.isCompleted ?? false;
  }

  /**
   * Listar questionários de saúde dos alunos (para personal trainers)
   */
  async getStudentQuestionnaires(
    personalTrainerId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<HealthQuestionnaireListResponseDto> {
    console.log(`🏥 [HEALTH] Listando questionários dos alunos para personal: ${personalTrainerId}`);
    
    // Buscar alunos do personal trainer através de propostas ativas
    const offset = (page - 1) * limit;
    
    const questionnaires = await this.db
      .select({
        id: healthQuestionnaires.id,
        userId: healthQuestionnaires.userId,
        medicalCondition: healthQuestionnaires.medicalCondition,
        regularMedication: healthQuestionnaires.regularMedication,
        chronicInjury: healthQuestionnaires.chronicInjury,
        trainingGoal: healthQuestionnaires.trainingGoal,
        dietaryRestrictions: healthQuestionnaires.dietaryRestrictions,
        completedAt: healthQuestionnaires.completedAt,
        createdAt: healthQuestionnaires.createdAt,
        updatedAt: healthQuestionnaires.updatedAt,
        studentName: users.firstName,
        studentEmail: users.email,
      })
      .from(healthQuestionnaires)
      .innerJoin(users, eq(healthQuestionnaires.userId, users.id))
      .where(
        and(
          eq(users.userType, 'student'),
          // TODO: Adicionar filtro por personal trainer quando tivermos a relação
          // eq(proposals.personalTrainerId, personalTrainerId)
        )
      )
      .orderBy(desc(healthQuestionnaires.updatedAt))
      .limit(limit)
      .offset(offset);

    const total = await this.db
      .select({ count: healthQuestionnaires.id })
      .from(healthQuestionnaires)
      .innerJoin(users, eq(healthQuestionnaires.userId, users.id))
      .where(eq(users.userType, 'student'));

    return {
      questionnaires: questionnaires.map(q => ({
        ...this.mapToResponseDto(q),
        studentName: `${q.studentName} ${users.lastName}`,
        studentEmail: q.studentEmail,
      } as StudentHealthQuestionnaireDto)),
      total: total.length,
      page,
      limit,
    };
  }

  /**
   * Obter questionário específico de um aluno (para personal trainer)
   */
  async getStudentQuestionnaire(
    personalTrainerId: string,
    studentId: string
  ): Promise<StudentHealthQuestionnaireDto | null> {
    console.log(`🏥 [HEALTH] Buscando questionário do aluno ${studentId} para personal ${personalTrainerId}`);
    
    // TODO: Verificar se o personal trainer tem acesso a este aluno
    // através de propostas ativas
    
    const [questionnaire] = await this.db
      .select({
        id: healthQuestionnaires.id,
        userId: healthQuestionnaires.userId,
        medicalCondition: healthQuestionnaires.medicalCondition,
        regularMedication: healthQuestionnaires.regularMedication,
        chronicInjury: healthQuestionnaires.chronicInjury,
        trainingGoal: healthQuestionnaires.trainingGoal,
        dietaryRestrictions: healthQuestionnaires.dietaryRestrictions,
        completedAt: healthQuestionnaires.completedAt,
        createdAt: healthQuestionnaires.createdAt,
        updatedAt: healthQuestionnaires.updatedAt,
        studentName: users.firstName,
        studentEmail: users.email,
      })
      .from(healthQuestionnaires)
      .innerJoin(users, eq(healthQuestionnaires.userId, users.id))
      .where(
        and(
          eq(healthQuestionnaires.userId, studentId),
          eq(users.userType, 'student')
        )
      )
      .limit(1);

    if (!questionnaire) {
      return null;
    }

    return {
      ...this.mapToResponseDto(questionnaire),
      studentName: `${questionnaire.studentName} ${users.lastName}`,
      studentEmail: questionnaire.studentEmail,
    } as StudentHealthQuestionnaireDto;
  }

  /**
   * Deletar questionário de saúde
   */
  async deleteQuestionnaire(userId: string, questionnaireId: string): Promise<void> {
    console.log(`🏥 [HEALTH] Deletando questionário ${questionnaireId} do usuário ${userId}`);
    
    const questionnaire = await this.db
      .select()
      .from(healthQuestionnaires)
      .where(
        and(
          eq(healthQuestionnaires.id, questionnaireId),
          eq(healthQuestionnaires.userId, userId)
        )
      )
      .limit(1);

    if (!questionnaire.length) {
      throw new NotFoundException('Questionário não encontrado');
    }

    await this.db
      .delete(healthQuestionnaires)
      .where(eq(healthQuestionnaires.id, questionnaireId));

    console.log(`🏥 [HEALTH] Questionário ${questionnaireId} deletado com sucesso`);
  }

  /**
   * Verificar se o questionário está completo
   */
  private isQuestionnaireDataComplete(dto: CreateHealthQuestionnaireDto): boolean {
    return !!(
      dto.medicalCondition &&
      dto.regularMedication &&
      dto.chronicInjury &&
      dto.trainingGoal &&
      dto.dietaryRestrictions
    );
  }

  /**
   * Mapear dados do banco para DTO de resposta
   */
  private mapToResponseDto(data: any): HealthQuestionnaireResponseDto {
    return {
      id: data.id,
      userId: data.userId,
      medicalCondition: data.medicalCondition,
      regularMedication: data.regularMedication,
      chronicInjury: data.chronicInjury,
      trainingGoal: data.trainingGoal,
      dietaryRestrictions: data.dietaryRestrictions,
      completedAt: data.completedAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      isCompleted: !!data.completedAt,
    };
  }
}
