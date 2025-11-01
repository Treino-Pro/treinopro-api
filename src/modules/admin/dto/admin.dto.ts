import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsEnum,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===== DASHBOARD DTOs =====

export class DashboardSummaryResponseDto {
  @ApiProperty({
    description: 'Total de usuários',
    example: 150,
  })
  users: number;

  @ApiProperty({
    description: 'Estatísticas de propostas',
    example: {
      total: 300,
      pending: 45,
      matched: 180,
      completed: 60,
      cancelled: 15,
    },
  })
  proposals: {
    total: number;
    pending: number;
    matched: number;
    completed: number;
    cancelled: number;
  };

  @ApiProperty({
    description: 'Estatísticas de aulas',
    example: {
      total: 450,
      scheduled: 50,
      active: 25,
      completed: 350,
      cancelled: 25,
    },
  })
  classes: {
    total: number;
    scheduled: number;
    active: number;
    completed: number;
    cancelled: number;
  };

  @ApiProperty({
    description: 'Pagamentos recentes',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        totalAmount: { type: 'number' },
        status: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
  })
  latestPayments: Array<{
    id: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }>;
}

// ===== USER DTOs =====

export class UserListResponseDto {
  @ApiProperty({ description: 'ID do usuário' })
  id: string;

  @ApiProperty({ description: 'Email do usuário' })
  email: string;

  @ApiProperty({ description: 'Nome completo' })
  fullName: string;

  @ApiProperty({
    description: 'Tipo de usuário',
    enum: ['student', 'personal', 'admin'],
  })
  userType: string;

  @ApiProperty({
    description: 'Status do usuário',
    enum: ['active', 'inactive', 'suspended'],
  })
  status: string;

  @ApiProperty({ description: 'Data de criação' })
  createdAt: string;

  @ApiProperty({ description: 'Última atividade' })
  lastActivity: string;

  @ApiProperty({ description: 'Se o usuário está verificado' })
  isVerified: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Status do usuário',
    enum: ['active', 'inactive', 'suspended'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'suspended'])
  status?: string;

  @ApiPropertyOptional({ description: 'Se o usuário está verificado' })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ description: 'Notas administrativas' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

// ===== FINANCIAL DTOs =====

export class FinancialSummaryResponseDto {
  @ApiProperty({
    description: 'Resumo financeiro',
    example: {
      totalPayments: 150,
      totalAmount: 12500.5,
      platformFees: 1250.05,
      personalAmounts: 11250.45,
    },
  })
  summary: {
    totalPayments: number;
    totalAmount: number;
    platformFees: number;
    personalAmounts: number;
  };

  @ApiProperty({
    description: 'Pagamentos recentes',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        totalAmount: { type: 'number' },
        platformFee: { type: 'number' },
        personalAmount: { type: 'number' },
        status: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
  })
  latest: Array<{
    id: string;
    totalAmount: number;
    platformFee: number;
    personalAmount: number;
    status: string;
    createdAt: string;
  }>;
}

// ===== MISSION DTOs =====

export class MissionListResponseDto {
  @ApiProperty({ description: 'ID da missão' })
  id: string;

  @ApiProperty({ description: 'Título da missão' })
  title: string;

  @ApiProperty({ description: 'Descrição da missão' })
  description: string;

  @ApiProperty({ description: 'Tipo da missão' })
  type: string;

  @ApiProperty({ description: 'XP de recompensa' })
  xpReward: number;

  @ApiProperty({ description: 'Se a missão está ativa' })
  isActive: boolean;

  @ApiProperty({ description: 'Data de criação' })
  createdAt: string;

  @ApiProperty({ description: 'Número de usuários que completaram' })
  completions: number;
}

export class UpdateMissionDto {
  @ApiPropertyOptional({ description: 'Título da missão' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Descrição da missão' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'XP de recompensa' })
  @IsOptional()
  @IsNumber()
  xpReward?: number;

  @ApiPropertyOptional({ description: 'Se a missão está ativa' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ===== ANALYTICS DTOs =====

export class AnalyticsResponseDto {
  @ApiProperty({
    description: 'Métricas de usuários',
    example: {
      totalUsers: 150,
      newUsersThisMonth: 25,
      activeUsersThisWeek: 80,
      userRetentionRate: 85.5,
    },
  })
  users: {
    totalUsers: number;
    newUsersThisMonth: number;
    activeUsersThisWeek: number;
    userRetentionRate: number;
  };

  @ApiProperty({
    description: 'Métricas de propostas',
    example: {
      totalProposals: 300,
      acceptedProposals: 180,
      pendingProposals: 45,
      averageResponseTime: 2.5,
    },
  })
  proposals: {
    totalProposals: number;
    acceptedProposals: number;
    pendingProposals: number;
    averageResponseTime: number;
  };

  @ApiProperty({
    description: 'Métricas de aulas',
    example: {
      totalClasses: 450,
      completedClasses: 380,
      cancelledClasses: 20,
      averageClassRating: 4.7,
    },
  })
  classes: {
    totalClasses: number;
    completedClasses: number;
    cancelledClasses: number;
    averageClassRating: number;
  };

  @ApiProperty({
    description: 'Métricas de pagamentos',
    example: {
      totalRevenue: 12500.5,
      monthlyRevenue: 3200.75,
      averageTransactionValue: 85.5,
      paymentSuccessRate: 98.5,
    },
  })
  payments: {
    totalRevenue: number;
    monthlyRevenue: number;
    averageTransactionValue: number;
    paymentSuccessRate: number;
  };
}
