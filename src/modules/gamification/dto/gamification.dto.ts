import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsArray, IsObject, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { MissionType, AchievementCategory, MissionStatus, XPSource } from '../../../database/schema';

// ===== DTOs DE PERFIL DE USUÁRIO =====

export class UserProfileResponseDto {
  @IsString()
  id: string;

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

  @IsArray()
  achievements: string[];

  @IsArray()
  missions: string[];

  @IsOptional()
  @IsDateString()
  lastMissionReset?: Date;

  @IsDateString()
  createdAt: Date;

  @IsDateString()
  updatedAt: Date;
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
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(1)
  xpReward: number;

  @IsEnum(MissionType)
  type: MissionType;

  @IsString()
  action: string;

  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @IsObject()
  requirements: {
    action: string;
    count: number;
    timeframe?: string;
    conditions?: Record<string, any>;
  };

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
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @IsOptional()
  @IsObject()
  requirements?: {
    action: string;
    count: number;
    timeframe?: string;
    conditions?: Record<string, any>;
  };
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
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @IsObject()
  requirements: {
    action: string;
    count: number;
    timeframe?: string;
    conditions?: Record<string, any>;
  };

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsDateString()
  createdAt: Date;

  @IsDateString()
  updatedAt: Date;
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
  completedAt?: Date;

  @IsDateString()
  createdAt: Date;

  @IsDateString()
  updatedAt: Date;

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
  createdAt: Date;

  @IsDateString()
  updatedAt: Date;
}

export class UserAchievementResponseDto {
  @IsString()
  id: string;

  @IsString()
  userId: string;

  @IsString()
  achievementId: string;

  @IsDateString()
  earnedAt: Date;

  @IsBoolean()
  isActive: boolean;

  @IsDateString()
  createdAt: Date;

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
  @IsString()
  userId: string;

  @IsNumber()
  @Min(1)
  xpAmount: number;

  @IsEnum(XPSource)
  source: XPSource;

  @IsOptional()
  @IsString()
  sourceId?: string;

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
  createdAt: Date;
}

export class XPHistoryQueryDto {
  @IsOptional()
  @IsEnum(XPSource)
  source?: XPSource;

  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;

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
