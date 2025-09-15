import { IsString, IsNumber, IsEnum, IsOptional, IsUUID, Min, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsUUID()
  @IsNotEmpty()
  classId: string;

  @IsEnum(RatingType)
  type: RatingType;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  comment?: string;

  // Campos específicos para avaliação do personal (quando aluno avalia)
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

  // Campos específicos para avaliação do aluno (quando personal avalia)
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

  // Campos específicos para avaliação do personal (quando personal se auto-avalia)
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
  id: string;
  classId: string;
  raterId: string;
  ratedId: string;
  type: RatingType;
  rating: number;
  comment?: string;
  status: RatingStatus;
  
  // Campos específicos
  punctuality?: number;
  communication?: number;
  knowledge?: number;
  motivation?: number;
  equipment?: number;
  studentEngagement?: number;
  studentEffort?: number;
  studentProgress?: number;
  personalProfessionalism?: number;
  personalKnowledge?: number;
  personalMotivation?: number;
  personalCommunication?: number;
  
  // Informações do usuário avaliado
  ratedUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  
  // Informações da aula
  class?: {
    id: string;
    date: Date;
    time: string;
    location: string;
    duration: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export class RatingStatsDto {
  totalRatings: number;
  averageRating: number;
  ratingDistribution: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
  completedRatings: number;
  pendingRatings: number;
  cancelledRatings: number;
  
  // Estatísticas específicas por tipo
  studentToPersonal: {
    total: number;
    average: number;
    punctuality: number;
    communication: number;
    knowledge: number;
    motivation: number;
    equipment: number;
  };
  
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
  @IsEnum(RatingType)
  @IsOptional()
  type?: RatingType;

  @IsEnum(RatingStatus)
  @IsOptional()
  status?: RatingStatus;

  @IsUUID()
  @IsOptional()
  classId?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  minRating?: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  maxRating?: number;

  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

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
