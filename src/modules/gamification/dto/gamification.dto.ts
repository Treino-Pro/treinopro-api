import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  IsObject,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MissionType,
  AchievementCategory,
  MissionStatus,
  XPSource,
} from '../../../database/schema';

// ===== DTOs DE PERFIL DE USUÁRIO =====

export class UserProfileResponseDto {
  @ApiProperty({
    description: 'ID do perfil de gamificação',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'ID do usuário',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'Nível atual do usuário',
    example: 5,
  })
  @IsNumber()
  level: number;

  @ApiProperty({
    description: 'XP total acumulado',
    example: 2500,
  })
  @IsNumber()
  totalXP: number;

  @ApiProperty({
    description: 'XP do nível atual',
    example: 500,
  })
  @IsNumber()
  currentLevelXP: number;

  @ApiProperty({
    description: 'XP necessário para o próximo nível',
    example: 500,
  })
  @IsNumber()
  xpToNextLevel: number;

  @ApiProperty({
    description: 'IDs das conquistas desbloqueadas',
    type: [String],
    example: ['achievement-1', 'achievement-2'],
  })
  @IsArray()
  achievements: string[];

  @ApiProperty({
    description: 'IDs das missões ativas',
    type: [String],
    example: ['mission-1', 'mission-2'],
  })
  @IsArray()
  missions: string[];

  @ApiPropertyOptional({
    description: 'Data do último reset de missões',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  lastMissionReset?: string;

  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsDateString()
  createdAt: string;

  @ApiProperty({
    description: 'Data de atualização',
    example: '2024-01-15T10:00:00.000Z',
  })
  @IsDateString()
  updatedAt: string;
}

export class LevelUpResponseDto {
  @IsString()
  userId: string;

  @IsNumber()
  newLevel: number;

  @IsNumber()
  previousLevel: number;

  @IsNumber()
  xpGained: number;

  @IsString()
  message: string;

  @IsArray()
  unlockedAchievements: string[];
}

// ===== DTOs DE MISSÕES =====

export class CreateMissionDto {
  @ApiProperty({
    description: 'Título da missão',
    example: 'Primeira Aula',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Descrição da missão',
    example: 'Complete sua primeira aula de treino',
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'XP de recompensa',
    example: 100,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  xpReward: number;

  @ApiProperty({
    description: 'Tipo da missão',
    enum: MissionType,
    example: MissionType.DAILY,
  })
  @IsEnum(MissionType)
  type: MissionType;

  @ApiProperty({
    description: 'Ação necessária para completar',
    example: 'attend_class',
  })
  @IsString()
  action: string;

  @ApiPropertyOptional({
    description: 'Data de início da missão',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Data de fim da missão',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Requisitos da missão',
    type: 'object',
    properties: {
      action: { type: 'string', example: 'attend_class' },
      count: { type: 'number', example: 1 },
      timeframe: { type: 'string', example: 'weekly' },
      conditions: { type: 'object', example: { user_type: 'student' } },
    },
  })
  @IsObject()
  requirements: {
    action: string;
    count: number;
    timeframe?: string;
    conditions?: Record<string, any>;
  };

  @ApiPropertyOptional({
    description: 'Prioridade para atribuição automática (0 = mais alta)',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({
    description: 'Se deve ser atribuída automaticamente',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;

  @ApiPropertyOptional({
    description: 'IDs das missões que devem ser completadas antes',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @ApiPropertyOptional({
    description: 'ID do usuário que criou a missão',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class UpdateMissionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  xpReward?: number;

  @IsOptional()
  @IsEnum(MissionType)
  type?: MissionType;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsObject()
  requirements?: {
    action: string;
    count: number;
    timeframe?: string;
    conditions?: Record<string, any>;
  };

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];
}

export class MissionResponseDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsNumber()
  xpReward: number;

  @IsEnum(MissionType)
  type: MissionType;

  @IsString()
  action: string;

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsObject()
  requirements: {
    action: string;
    count: number;
    timeframe?: string;
    conditions?: Record<string, any>;
  };

  @IsNumber()
  priority: number;

  @IsBoolean()
  autoAssign: boolean;

  @IsArray()
  @IsString({ each: true })
  prerequisites: string[];

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsDateString()
  createdAt: string;

  @IsDateString()
  updatedAt: string;
}

export class UserMissionResponseDto {
  @IsString()
  id: string;

  @IsString()
  userId: string;

  @IsString()
  missionId: string;

  @IsEnum(MissionStatus)
  status: MissionStatus;

  @IsNumber()
  progress: number;

  @IsNumber()
  totalRequired: number;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsDateString()
  createdAt: string;

  @IsDateString()
  updatedAt: string;

  // Dados da missão
  mission: MissionResponseDto;
}

export class MissionQueryDto {
  @IsOptional()
  @IsEnum(MissionType)
  type?: MissionType;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}

// ===== DTOs DE CONQUISTAS =====

export class CreateAchievementDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(1)
  xpReward: number;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsEnum(AchievementCategory)
  category: AchievementCategory;

  @IsString()
  action: string;

  @IsObject()
  requirements: {
    action: string;
    count: number;
    conditions?: Record<string, any>;
  };

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class UpdateAchievementDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  xpReward?: number;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsEnum(AchievementCategory)
  category?: AchievementCategory;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  requirements?: {
    action: string;
    count: number;
    conditions?: Record<string, any>;
  };
}

export class AchievementResponseDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  xpReward: number;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsEnum(AchievementCategory)
  category: AchievementCategory;

  @IsString()
  action: string;

  @IsObject()
  requirements: {
    action: string;
    count: number;
    conditions?: Record<string, any>;
  };

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsDateString()
  createdAt: string;

  @IsDateString()
  updatedAt: string;
}

export class UserAchievementResponseDto {
  @IsString()
  id: string;

  @IsString()
  userId: string;

  @IsString()
  achievementId: string;

  @IsDateString()
  earnedAt: string;

  @IsBoolean()
  isActive: boolean;

  @IsDateString()
  createdAt: string;

  // Dados da conquista
  achievement: AchievementResponseDto;
}

export class AchievementQueryDto {
  @IsOptional()
  @IsEnum(AchievementCategory)
  category?: AchievementCategory;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}

// ===== DTOs DE XP =====

export class AddXPDto {
  @ApiProperty({
    description: 'Quantidade de XP a adicionar',
    example: 50,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  xpAmount: number;

  @ApiProperty({
    description: 'Fonte do XP',
    enum: XPSource,
    example: XPSource.CLASS_COMPLETION,
  })
  @IsEnum(XPSource)
  source: XPSource;

  @ApiPropertyOptional({
    description: 'ID da fonte do XP (ex: class_id, achievement_id)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Descrição do ganho de XP',
    example: 'Completou uma aula de musculação',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class XPHistoryResponseDto {
  @IsString()
  id: string;

  @IsString()
  userId: string;

  @IsNumber()
  xpAmount: number;

  @IsEnum(XPSource)
  source: XPSource;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  createdAt: string;
}

export class XPHistoryQueryDto {
  @IsOptional()
  @IsEnum(XPSource)
  source?: XPSource;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}

// ===== DTOs DE ESTATÍSTICAS =====

export class GamificationStatsResponseDto {
  @IsString()
  userId: string;

  @IsNumber()
  level: number;

  @IsNumber()
  totalXP: number;

  @IsNumber()
  currentLevelXP: number;

  @IsNumber()
  xpToNextLevel: number;

  @IsNumber()
  totalAchievements: number;

  @IsNumber()
  totalMissions: number;

  @IsNumber()
  completedMissions: number;

  @IsNumber()
  activeMissions: number;

  @IsNumber()
  xpThisWeek: number;

  @IsNumber()
  xpThisMonth: number;

  @IsArray()
  recentAchievements: AchievementResponseDto[];

  @IsArray()
  activeMissionsList: UserMissionResponseDto[];
}

// ===== DTOs DE PROGRESSO =====

export class MissionProgressDto {
  @IsString()
  userId: string;

  @IsString()
  action: string;

  @IsNumber()
  @Min(1)
  count: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class AchievementProgressDto {
  @IsString()
  userId: string;

  @IsString()
  action: string;

  @IsNumber()
  @Min(1)
  count: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
