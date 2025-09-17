import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards, 
  Request,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GamificationService } from './gamification.service';
import {
  CreateMissionDto,
  UpdateMissionDto,
  MissionQueryDto,
  CreateAchievementDto,
  UpdateAchievementDto,
  AchievementQueryDto,
  AddXPDto,
  XPHistoryQueryDto,
  MissionProgressDto,
  AchievementProgressDto,
  UserProfileResponseDto,
  MissionResponseDto,
  UserMissionResponseDto,
  AchievementResponseDto,
  UserAchievementResponseDto,
  XPHistoryResponseDto,
  GamificationStatsResponseDto
} from './dto/gamification.dto';

@ApiTags('Gamification')
@Controller('gamification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  // ===== PERFIL DE USUÁRIO =====

  @Get('profile')
  @ApiOperation({ summary: 'Obter perfil de gamificação do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Perfil de gamificação retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
        level: { type: 'number', example: 5, description: 'Nível atual do usuário' },
        totalXP: { type: 'number', example: 1250, description: 'XP total acumulado' },
        currentLevelXP: { type: 'number', example: 250, description: 'XP do nível atual' },
        nextLevelXP: { type: 'number', example: 500, description: 'XP necessário para próximo nível' },
        badges: { 
          type: 'array', 
          items: { type: 'string' },
          example: ['first_class', 'week_streak', 'monthly_goal'],
          description: 'Badges conquistados'
        },
        achievements: { 
          type: 'array', 
          items: { type: 'string' },
          example: ['achievement_1', 'achievement_2'],
          description: 'Conquistas desbloqueadas'
        },
        rank: { type: 'number', example: 15, description: 'Posição no ranking' },
        createdAt: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        updatedAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' }
      },
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        level: 5,
        totalXP: 1250,
        currentLevelXP: 250,
        nextLevelXP: 500,
        badges: ['first_class', 'week_streak', 'monthly_goal'],
        achievements: ['achievement_1', 'achievement_2'],
        rank: 15,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getUserProfile(@Request() req): Promise<UserProfileResponseDto> {
    return this.gamificationService.getUserProfile(req.user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas de gamificação' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas de gamificação retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number', example: 150, description: 'Total de usuários na plataforma' },
        activeUsers: { type: 'number', example: 120, description: 'Usuários ativos' },
        totalXP: { type: 'number', example: 50000, description: 'XP total da plataforma' },
        averageLevel: { type: 'number', example: 3.5, description: 'Nível médio dos usuários' },
        topUsers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
              username: { type: 'string', example: 'João Silva' },
              level: { type: 'number', example: 8 },
              totalXP: { type: 'number', example: 2500 }
            }
          }
        },
        missionStats: {
          totalMissions: { type: 'number', example: 25 },
          completedMissions: { type: 'number', example: 150 },
          averageCompletionRate: { type: 'number', example: 0.75 }
        },
        achievementStats: {
          totalAchievements: { type: 'number', example: 15 },
          unlockedAchievements: { type: 'number', example: 300 },
          averageUnlockRate: { type: 'number', example: 0.6 }
        }
      },
      example: {
        totalUsers: 150,
        activeUsers: 120,
        totalXP: 50000,
        averageLevel: 3.5,
        topUsers: [
          { userId: '123e4567-e89b-12d3-a456-426614174001', username: 'João Silva', level: 8, totalXP: 2500 },
          { userId: '123e4567-e89b-12d3-a456-426614174002', username: 'Maria Santos', level: 7, totalXP: 2200 }
        ],
        missionStats: {
          totalMissions: 25,
          completedMissions: 150,
          averageCompletionRate: 0.75
        },
        achievementStats: {
          totalAchievements: 15,
          unlockedAchievements: 300,
          averageUnlockRate: 0.6
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getGamificationStats(@Request() req): Promise<GamificationStatsResponseDto> {
    return this.gamificationService.getGamificationStats(req.user.id);
  }

  // ===== XP =====

  @Post('xp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Adicionar XP ao usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'XP adicionado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'XP adicionado com sucesso' },
        newTotalXP: { type: 'number', example: 1350, description: 'Novo total de XP' },
        levelUp: { type: 'boolean', example: true, description: 'Se o usuário subiu de nível' },
        newLevel: { type: 'number', example: 6, description: 'Novo nível (se subiu)' },
        xpAdded: { type: 'number', example: 100, description: 'XP adicionado nesta operação' }
      },
      example: {
        message: 'XP adicionado com sucesso',
        newTotalXP: 1350,
        levelUp: true,
        newLevel: 6,
        xpAdded: 100
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async addXP(@Body() addXPDto: AddXPDto) {
    return this.gamificationService.addXP(addXPDto);
  }

  @Get('xp/history')
  @ApiOperation({ summary: 'Obter histórico de XP do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Histórico de XP retornado com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
          xpAmount: { type: 'number', example: 100, description: 'Quantidade de XP' },
          source: { type: 'string', example: 'class_completion', description: 'Fonte do XP' },
          description: { type: 'string', example: 'Conclusão de aula de musculação', description: 'Descrição da ação' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' }
        }
      }
    },
    example: [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        xpAmount: 100,
        source: 'class_completion',
        description: 'Conclusão de aula de musculação',
        createdAt: '2024-01-15T10:00:00.000Z'
      },
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        xpAmount: 50,
        source: 'daily_login',
        description: 'Login diário',
        createdAt: '2024-01-14T09:00:00.000Z'
      }
    ]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getXPHistory(@Request() req, @Query() query: XPHistoryQueryDto) {
    return this.gamificationService.getXPHistory(req.user.id, query);
  }

  // ===== MISSÕES =====

  @Post('missions')
  @ApiOperation({ summary: 'Criar nova missão' })
  @ApiResponse({ 
    status: 201, 
    description: 'Missão criada com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        title: { type: 'string', example: 'Complete 5 aulas esta semana', description: 'Título da missão' },
        description: { type: 'string', example: 'Participe de 5 aulas de treino para ganhar XP extra', description: 'Descrição da missão' },
        type: { type: 'string', example: 'weekly', description: 'Tipo da missão' },
        xpReward: { type: 'number', example: 200, description: 'XP de recompensa' },
        target: { type: 'number', example: 5, description: 'Meta da missão' },
        currentProgress: { type: 'number', example: 0, description: 'Progresso atual' },
        isActive: { type: 'boolean', example: true, description: 'Se a missão está ativa' },
        startDate: { type: 'string', example: '2024-01-15T00:00:00.000Z' },
        endDate: { type: 'string', example: '2024-01-21T23:59:59.000Z' },
        createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' }
      },
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Complete 5 aulas esta semana',
        description: 'Participe de 5 aulas de treino para ganhar XP extra',
        type: 'weekly',
        xpReward: 200,
        target: 5,
        currentProgress: 0,
        isActive: true,
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-21T23:59:59.000Z',
        createdAt: '2024-01-15T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async createMission(@Body() createMissionDto: CreateMissionDto): Promise<MissionResponseDto> {
    return this.gamificationService.createMission(createMissionDto);
  }

  @Get('missions')
  @ApiOperation({ summary: 'Listar missões com filtros' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de missões retornada com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          title: { type: 'string', example: 'Complete 5 aulas esta semana' },
          description: { type: 'string', example: 'Participe de 5 aulas de treino para ganhar XP extra' },
          type: { type: 'string', example: 'weekly' },
          xpReward: { type: 'number', example: 200 },
          target: { type: 'number', example: 5 },
          currentProgress: { type: 'number', example: 0 },
          isActive: { type: 'boolean', example: true },
          startDate: { type: 'string', example: '2024-01-15T00:00:00.000Z' },
          endDate: { type: 'string', example: '2024-01-21T23:59:59.000Z' }
        }
      }
    },
    example: [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Complete 5 aulas esta semana',
        description: 'Participe de 5 aulas de treino para ganhar XP extra',
        type: 'weekly',
        xpReward: 200,
        target: 5,
        currentProgress: 0,
        isActive: true,
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-21T23:59:59.000Z'
      },
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Faça login por 7 dias seguidos',
        description: 'Entre na plataforma por 7 dias consecutivos',
        type: 'daily',
        xpReward: 100,
        target: 7,
        currentProgress: 3,
        isActive: true,
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-22T23:59:59.000Z'
      }
    ]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getMissions(@Query() query: MissionQueryDto) {
    return this.gamificationService.getMissions(query);
  }

  @Get('missions/:id')
  @ApiOperation({ summary: 'Obter missão por ID' })
  @ApiParam({ name: 'id', description: 'ID da missão' })
  @ApiResponse({ 
    status: 200, 
    description: 'Missão encontrada com sucesso',
    type: MissionResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Missão não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getMissionById(@Param('id') id: string): Promise<MissionResponseDto> {
    return this.gamificationService.getMissionById(id);
  }

  @Put('missions/:id')
  async updateMission(
    @Param('id') id: string,
    @Body() updateMissionDto: UpdateMissionDto
  ): Promise<MissionResponseDto> {
    return this.gamificationService.updateMission(id, updateMissionDto);
  }

  @Delete('missions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMission(@Param('id') id: string): Promise<void> {
    return this.gamificationService.deleteMission(id);
  }

  @Post('missions/:id/assign')
  async assignMissionToUser(
    @Request() req,
    @Param('id') missionId: string
  ): Promise<UserMissionResponseDto> {
    return this.gamificationService.assignMissionToUser(req.user.id, missionId);
  }

  @Get('missions/user/my-missions')
  async getUserMissions(
    @Request() req,
    @Query('status') status?: string
  ): Promise<UserMissionResponseDto[]> {
    return this.gamificationService.getUserMissions(req.user.id, status as any);
  }

  @Post('missions/progress')
  async updateMissionProgress(
    @Request() req,
    @Body() progressDto: MissionProgressDto
  ): Promise<UserMissionResponseDto[]> {
    // Garantir que o userId seja o do usuário autenticado
    progressDto.userId = req.user.id;
    return this.gamificationService.updateMissionProgress(progressDto);
  }

  // ===== CONQUISTAS =====

  @Post('achievements')
  async createAchievement(@Body() createAchievementDto: CreateAchievementDto): Promise<AchievementResponseDto> {
    return this.gamificationService.createAchievement(createAchievementDto);
  }

  @Get('achievements')
  async getAchievements(@Query() query: AchievementQueryDto) {
    return this.gamificationService.getAchievements(query);
  }

  @Get('achievements/:id')
  async getAchievementById(@Param('id') id: string): Promise<AchievementResponseDto> {
    return this.gamificationService.getAchievementById(id);
  }

  @Put('achievements/:id')
  async updateAchievement(
    @Param('id') id: string,
    @Body() updateAchievementDto: UpdateAchievementDto
  ): Promise<AchievementResponseDto> {
    return this.gamificationService.updateAchievement(id, updateAchievementDto);
  }

  @Delete('achievements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAchievement(@Param('id') id: string): Promise<void> {
    return this.gamificationService.deleteAchievement(id);
  }

  @Get('achievements/user/my-achievements')
  async getUserAchievements(@Request() req): Promise<UserAchievementResponseDto[]> {
    return this.gamificationService.getUserAchievements(req.user.id);
  }

  @Post('achievements/progress')
  async updateAchievementProgress(
    @Request() req,
    @Body() progressDto: AchievementProgressDto
  ): Promise<UserAchievementResponseDto[]> {
    // Garantir que o userId seja o do usuário autenticado
    progressDto.userId = req.user.id;
    return this.gamificationService.updateAchievementProgress(progressDto);
  }

  // ===== AÇÕES DE INTEGRAÇÃO =====

  @Post('actions/class-completion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Processar conclusão de aula para gamificação' })
  @ApiResponse({ 
    status: 200, 
    description: 'XP e progresso atualizados com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'XP e progresso atualizados com sucesso' },
        xpEarned: { type: 'number', example: 100, description: 'XP ganho com a aula' },
        missionsUpdated: { type: 'number', example: 2, description: 'Número de missões atualizadas' },
        achievementsUnlocked: { type: 'array', items: { type: 'string' }, example: ['first_class'], description: 'Conquistas desbloqueadas' }
      },
      example: {
        message: 'XP e progresso atualizados com sucesso',
        xpEarned: 100,
        missionsUpdated: 2,
        achievementsUnlocked: ['first_class']
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async processClassCompletion(
    @Request() req,
    @Body() body: { classId: string }
  ): Promise<{ message: string }> {
    await this.gamificationService.processClassCompletion(req.user.id, body.classId);
    return { message: 'XP e progresso atualizados com sucesso' };
  }

  @Post('actions/daily-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Processar login diário para gamificação' })
  @ApiResponse({ 
    status: 200, 
    description: 'Progresso de login diário atualizado',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Progresso de login diário atualizado' },
        xpEarned: { type: 'number', example: 50, description: 'XP ganho com o login' },
        streakDays: { type: 'number', example: 5, description: 'Dias consecutivos de login' },
        missionsUpdated: { type: 'number', example: 1, description: 'Número de missões atualizadas' }
      },
      example: {
        message: 'Progresso de login diário atualizado',
        xpEarned: 50,
        streakDays: 5,
        missionsUpdated: 1
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async processDailyLogin(@Request() req): Promise<{ message: string }> {
    await this.gamificationService.processDailyLogin(req.user.id);
    return { message: 'Progresso de login diário atualizado' };
  }
}

