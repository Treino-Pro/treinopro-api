import { IsString, IsNumber, IsEnum, IsOptional, IsUUID, Min, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Enums
export enum RatingType {
  STUDENT_TO_PERSONAL = 'student_to_personal',
  PERSONAL_TO_STUDENT = 'personal_to_student',
}

export enum RatingStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// DTOs de criação
export class CreateRatingDto {
  @ApiProperty({
    description: 'ID da aula avaliada',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({
    description: 'Tipo de avaliação',
    enum: RatingType,
    example: RatingType.STUDENT_TO_PERSONAL
  })
  @IsEnum(RatingType)
  type: RatingType;

  @ApiProperty({
    description: 'Nota geral (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    description: 'Comentário sobre a avaliação',
    example: 'Excelente personal trainer, muito profissional!'
  })
  @IsString()
  @IsOptional()
  comment?: string;

  // Campos específicos para avaliação do personal (quando aluno avalia)
  @ApiPropertyOptional({
    description: 'Pontualidade do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  punctuality?: number;

  @ApiPropertyOptional({
    description: 'Comunicação do personal (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  communication?: number;

  @ApiPropertyOptional({
    description: 'Conhecimento técnico do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  knowledge?: number;

  @ApiPropertyOptional({
    description: 'Motivação do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  motivation?: number;

  @ApiPropertyOptional({
    description: 'Equipamentos utilizados (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  equipment?: number;

  // Campos específicos para avaliação do aluno (quando personal avalia)
  @ApiPropertyOptional({
    description: 'Engajamento do aluno (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  studentEngagement?: number;

  @ApiPropertyOptional({
    description: 'Esforço do aluno (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  studentEffort?: number;

  @ApiPropertyOptional({
    description: 'Progresso do aluno (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  studentProgress?: number;

  // Campos específicos para avaliação do personal (quando personal se auto-avalia)
  @ApiPropertyOptional({
    description: 'Profissionalismo do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalProfessionalism?: number;

  @ApiPropertyOptional({
    description: 'Conhecimento do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalKnowledge?: number;

  @ApiPropertyOptional({
    description: 'Motivação do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalMotivation?: number;

  @ApiPropertyOptional({
    description: 'Comunicação do personal (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalCommunication?: number;
}

export class UpdateRatingDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  comment?: string;

  // Campos específicos para avaliação do personal
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  punctuality?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  communication?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  knowledge?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  motivation?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  equipment?: number;

  // Campos específicos para avaliação do aluno
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  studentEngagement?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  studentEffort?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  studentProgress?: number;

  // Campos específicos para avaliação do personal
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalProfessionalism?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalKnowledge?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalMotivation?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  personalCommunication?: number;
}

// DTOs de resposta
export class RatingResponseDto {
  @ApiProperty({
    description: 'ID da avaliação',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  id: string;

  @ApiProperty({
    description: 'ID da aula avaliada',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  classId: string;

  @ApiProperty({
    description: 'ID do usuário que avaliou',
    example: '123e4567-e89b-12d3-a456-426614174002'
  })
  raterId: string;

  @ApiProperty({
    description: 'ID do usuário avaliado',
    example: '123e4567-e89b-12d3-a456-426614174003'
  })
  ratedId: string;

  @ApiProperty({
    description: 'Tipo de avaliação',
    enum: RatingType,
    example: RatingType.STUDENT_TO_PERSONAL
  })
  type: RatingType;

  @ApiProperty({
    description: 'Nota geral (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  rating: number;

  @ApiPropertyOptional({
    description: 'Comentário sobre a avaliação',
    example: 'Excelente personal trainer!'
  })
  comment?: string;

  @ApiProperty({
    description: 'Status da avaliação',
    enum: RatingStatus,
    example: RatingStatus.COMPLETED
  })
  status: RatingStatus;
  
  // Campos específicos
  @ApiPropertyOptional({
    description: 'Pontualidade (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  punctuality?: number;

  @ApiPropertyOptional({
    description: 'Comunicação (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  communication?: number;

  @ApiPropertyOptional({
    description: 'Conhecimento (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  knowledge?: number;

  @ApiPropertyOptional({
    description: 'Motivação (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  motivation?: number;

  @ApiPropertyOptional({
    description: 'Equipamentos (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  equipment?: number;

  @ApiPropertyOptional({
    description: 'Engajamento do aluno (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  studentEngagement?: number;

  @ApiPropertyOptional({
    description: 'Esforço do aluno (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  studentEffort?: number;

  @ApiPropertyOptional({
    description: 'Progresso do aluno (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  studentProgress?: number;

  @ApiPropertyOptional({
    description: 'Profissionalismo do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  personalProfessionalism?: number;

  @ApiPropertyOptional({
    description: 'Conhecimento do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  personalKnowledge?: number;

  @ApiPropertyOptional({
    description: 'Motivação do personal (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  personalMotivation?: number;

  @ApiPropertyOptional({
    description: 'Comunicação do personal (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5
  })
  personalCommunication?: number;
  
  // Informações do usuário avaliado
  @ApiPropertyOptional({
    description: 'Informações do usuário avaliado',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174003' },
      name: { type: 'string', example: 'Maria Santos' },
      email: { type: 'string', example: 'maria@email.com' },
      role: { type: 'string', example: 'personal' }
    }
  })
  ratedUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  
  // Informações da aula
  @ApiPropertyOptional({
    description: 'Informações da aula',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
      date: { type: 'string', format: 'date-time', example: '2024-01-15T14:00:00.000Z' },
      time: { type: 'string', example: '14:00' },
      location: { type: 'string', example: 'Academia Smart Fit' },
      duration: { type: 'number', example: 60 }
    }
  })
  class?: {
    id: string;
    date: Date;
    time: string;
    location: string;
    duration: number;
  };
  
  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-15T15:00:00.000Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data de atualização',
    example: '2024-01-15T15:00:00.000Z'
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Data de conclusão',
    example: '2024-01-15T15:00:00.000Z'
  })
  completedAt?: Date;
}

export class RatingStatsDto {
  @ApiProperty({
    description: 'Total de avaliações',
    example: 25
  })
  totalRatings: number;

  @ApiProperty({
    description: 'Média geral das avaliações',
    example: 4.2,
    minimum: 1,
    maximum: 5
  })
  averageRating: number;

  @ApiProperty({
    description: 'Distribuição das notas',
    type: 'object',
    properties: {
      '1': { type: 'number', example: 1 },
      '2': { type: 'number', example: 2 },
      '3': { type: 'number', example: 3 },
      '4': { type: 'number', example: 8 },
      '5': { type: 'number', example: 11 }
    }
  })
  ratingDistribution: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };

  @ApiProperty({
    description: 'Avaliações concluídas',
    example: 20
  })
  completedRatings: number;

  @ApiProperty({
    description: 'Avaliações pendentes',
    example: 3
  })
  pendingRatings: number;

  @ApiProperty({
    description: 'Avaliações canceladas',
    example: 2
  })
  cancelledRatings: number;
  
  // Estatísticas específicas por tipo
  @ApiProperty({
    description: 'Estatísticas de avaliações de alunos para personais',
    type: 'object',
    properties: {
      total: { type: 'number', example: 15 },
      average: { type: 'number', example: 4.5 },
      punctuality: { type: 'number', example: 4.8 },
      communication: { type: 'number', example: 4.2 },
      knowledge: { type: 'number', example: 4.7 },
      motivation: { type: 'number', example: 4.6 },
      equipment: { type: 'number', example: 4.0 }
    }
  })
  studentToPersonal: {
    total: number;
    average: number;
    punctuality: number;
    communication: number;
    knowledge: number;
    motivation: number;
    equipment: number;
  };
  
  @ApiProperty({
    description: 'Estatísticas de avaliações de personais para alunos',
    type: 'object',
    properties: {
      total: { type: 'number', example: 10 },
      average: { type: 'number', example: 4.0 },
      engagement: { type: 'number', example: 4.2 },
      effort: { type: 'number', example: 4.5 },
      progress: { type: 'number', example: 3.8 }
    }
  })
  personalToStudent: {
    total: number;
    average: number;
    engagement: number;
    effort: number;
    progress: number;
  };
}

export class RatingSummaryDto {
  userId: string;
  userName: string;
  userRole: string;
  totalRatings: number;
  averageRating: number;
  ratingBreakdown: {
    punctuality?: number;
    communication?: number;
    knowledge?: number;
    motivation?: number;
    equipment?: number;
    engagement?: number;
    effort?: number;
    progress?: number;
    professionalism?: number;
  };
  recentRatings: RatingResponseDto[];
}

// DTOs para filtros
export class RatingFiltersDto {
  @ApiPropertyOptional({
    description: 'Tipo de avaliação para filtrar',
    enum: RatingType,
    example: RatingType.STUDENT_TO_PERSONAL
  })
  @IsEnum(RatingType)
  @IsOptional()
  type?: RatingType;

  @ApiPropertyOptional({
    description: 'Status da avaliação para filtrar',
    enum: RatingStatus,
    example: RatingStatus.COMPLETED
  })
  @IsEnum(RatingStatus)
  @IsOptional()
  status?: RatingStatus;

  @ApiPropertyOptional({
    description: 'ID da aula para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional({
    description: 'ID do usuário para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Nota mínima para filtrar',
    example: 3,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  minRating?: number;

  @ApiPropertyOptional({
    description: 'Nota máxima para filtrar',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  maxRating?: number;

  @ApiPropertyOptional({
    description: 'Data inicial para filtrar',
    example: '2024-01-01T00:00:00.000Z'
  })
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Data final para filtrar',
    example: '2024-12-31T23:59:59.999Z'
  })
  @Type(() => Date)
  @IsOptional()
  endDate?: Date;
}

// DTO para criar avaliações automáticas após aula
export class CreateAutomaticRatingsDto {
  @IsUUID()
  @IsNotEmpty()
  classId: string;
}
