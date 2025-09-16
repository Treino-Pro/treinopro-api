import { Injectable, NotFoundException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { eq, and, desc, gte, lte, count, sql, or } from 'drizzle-orm';
import { 
  userProfiles, 
  missions, 
  achievements, 
  userAchievements, 
  userMissions, 
  xpHistory,
  MissionType,
  AchievementCategory,
  MissionStatus,
  XPSource,
  UserProfile,
  Mission,
  Achievement,
  UserAchievement,
  UserMission,
  XPHistory
} from '../../database/schema';
import {
  CreateMissionDto,
  UpdateMissionDto,
  MissionResponseDto,
  UserMissionResponseDto,
  MissionQueryDto,
  CreateAchievementDto,
  UpdateAchievementDto,
  AchievementResponseDto,
  UserAchievementResponseDto,
  AchievementQueryDto,
  AddXPDto,
  XPHistoryResponseDto,
  XPHistoryQueryDto,
  GamificationStatsResponseDto,
  MissionProgressDto,
  AchievementProgressDto,
  UserProfileResponseDto,
  LevelUpResponseDto
} from './dto/gamification.dto';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
  ) {}

  // ===== SISTEMA DE XP E NÍVEIS =====

  async getUserProfile(userId: string): Promise<UserProfileResponseDto> {
    const [profile] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      // Criar perfil inicial se não existir
      return this.createInitialProfile(userId);
    }

    const xpToNextLevel = this.calculateXPToNextLevel(profile.level, profile.currentLevelXP);

    return {
      ...profile,
      xpToNextLevel,
    };
  }

  private async createInitialProfile(userId: string): Promise<UserProfileResponseDto> {
    const [newProfile] = await this.db
      .insert(userProfiles)
      .values({
        userId,
        level: 1,
        totalXP: 0,
        currentLevelXP: 0,
        achievements: [],
        missions: [],
      })
      .returning();

    return {
      ...newProfile,
      xpToNextLevel: this.calculateXPToNextLevel(1, 0),
    };
  }

  async addXP(addXPDto: AddXPDto): Promise<LevelUpResponseDto | null> {
    const { userId, xpAmount, source, sourceId, description } = addXPDto;

    // Buscar ou criar perfil
    let profile = await this.getUserProfile(userId);
    if (!profile) {
      profile = await this.createInitialProfile(userId);
    }

    const previousLevel = profile.level;
    const newTotalXP = profile.totalXP + xpAmount;
    const newLevel = this.calculateLevel(newTotalXP);
    const newCurrentLevelXP = this.calculateCurrentLevelXP(newTotalXP, newLevel);

    // Atualizar perfil
    await this.db
      .update(userProfiles)
      .set({
        totalXP: newTotalXP,
        level: newLevel,
        currentLevelXP: newCurrentLevelXP,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId));

    // Registrar no histórico
    await this.db.insert(xpHistory).values({
      userId,
      xpAmount,
      source,
      sourceId,
      description,
    });

    // Verificar se subiu de nível
    if (newLevel > previousLevel) {
      const levelUpResponse: LevelUpResponseDto = {
        userId,
        newLevel,
        previousLevel,
        xpGained: xpAmount,
        message: `Parabéns! Você subiu para o nível ${newLevel}!`,
        unlockedAchievements: [],
      };

      // Verificar conquistas desbloqueadas
      const unlockedAchievements = await this.checkAndUnlockAchievements(userId, newLevel);
      levelUpResponse.unlockedAchievements = unlockedAchievements.map(a => a.name);

      this.logger.log(`🎉 [GAMIFICATION] Usuário ${userId} subiu para o nível ${newLevel}`);
      return levelUpResponse;
    }

    this.logger.log(`💫 [GAMIFICATION] Usuário ${userId} ganhou ${xpAmount} XP (${source})`);
    return null;
  }

  private calculateLevel(totalXP: number): number {
    // Fórmula: nível = floor(sqrt(totalXP / 100)) + 1
    // Exemplo: 0-99 XP = nível 1, 100-399 XP = nível 2, 400-899 XP = nível 3
    return Math.floor(Math.sqrt(totalXP / 100)) + 1;
  }

  private calculateCurrentLevelXP(totalXP: number, level: number): number {
    const previousLevelXP = this.getXPRequiredForLevel(level - 1);
    return totalXP - previousLevelXP;
  }

  private calculateXPToNextLevel(level: number, currentLevelXP: number): number {
    const xpForCurrentLevel = this.getXPRequiredForLevel(level);
    const xpForNextLevel = this.getXPRequiredForLevel(level + 1);
    return xpForNextLevel - currentLevelXP;
  }

  private getXPRequiredForLevel(level: number): number {
    // Fórmula: XP necessário = (nível - 1)² * 100
    return Math.pow(level - 1, 2) * 100;
  }

  // ===== SISTEMA DE MISSÕES =====

  async createMission(createMissionDto: CreateMissionDto): Promise<MissionResponseDto> {
    const [mission] = await this.db
      .insert(missions)
      .values(createMissionDto)
      .returning();

    return mission;
  }

  async getMissions(query: MissionQueryDto): Promise<{ missions: MissionResponseDto[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, type, isActive } = query;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (type) conditions.push(eq(missions.type, type));
    if (isActive !== undefined) conditions.push(eq(missions.isActive, isActive));

    const [missionsList, totalResult] = await Promise.all([
      this.db
        .select()
        .from(missions)
        .where(and(...conditions))
        .orderBy(desc(missions.createdAt))
        .limit(limit)
        .offset(offset),
      
      this.db
        .select({ count: count() })
        .from(missions)
        .where(and(...conditions))
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      missions: missionsList,
      total,
      page,
      limit,
    };
  }

  async getMissionById(id: string): Promise<MissionResponseDto> {
    const [mission] = await this.db
      .select()
      .from(missions)
      .where(eq(missions.id, id))
      .limit(1);

    if (!mission) {
      throw new NotFoundException('Missão não encontrada');
    }

    return mission;
  }

  async updateMission(id: string, updateMissionDto: UpdateMissionDto): Promise<MissionResponseDto> {
    const [updatedMission] = await this.db
      .update(missions)
      .set({
        ...updateMissionDto,
        updatedAt: new Date(),
      })
      .where(eq(missions.id, id))
      .returning();

    if (!updatedMission) {
      throw new NotFoundException('Missão não encontrada');
    }

    return updatedMission;
  }

  async deleteMission(id: string): Promise<void> {
    const result = await this.db
      .delete(missions)
      .where(eq(missions.id, id));

    if (result.rowCount === 0) {
      throw new NotFoundException('Missão não encontrada');
    }
  }

  async assignMissionToUser(userId: string, missionId: string): Promise<UserMissionResponseDto> {
    // Verificar se a missão existe e está ativa
    const mission = await this.getMissionById(missionId);
    if (!mission.isActive) {
      throw new BadRequestException('Missão não está ativa');
    }

    // Verificar se já está atribuída
    const [existingAssignment] = await this.db
      .select()
      .from(userMissions)
      .where(and(eq(userMissions.userId, userId), eq(userMissions.missionId, missionId)))
      .limit(1);

    if (existingAssignment) {
      throw new BadRequestException('Missão já está atribuída ao usuário');
    }

    const [userMission] = await this.db
      .insert(userMissions)
      .values({
        userId,
        missionId,
        status: MissionStatus.ACTIVE,
        progress: 0,
      })
      .returning();

    return {
      ...userMission,
      totalRequired: mission.requirements.count,
      mission,
    };
  }

  async getUserMissions(userId: string, status?: MissionStatus): Promise<UserMissionResponseDto[]> {
    const conditions = [eq(userMissions.userId, userId)];
    if (status) conditions.push(eq(userMissions.status, status));

    const userMissionsList = await this.db
      .select()
      .from(userMissions)
      .leftJoin(missions, eq(userMissions.missionId, missions.id))
      .where(and(...conditions))
      .orderBy(desc(userMissions.createdAt));

    return userMissionsList.map(um => ({
      ...um.user_missions,
      totalRequired: um.missions.requirements.count,
      mission: um.missions,
    }));
  }

  async updateMissionProgress(progressDto: MissionProgressDto): Promise<UserMissionResponseDto[]> {
    const { userId, action, count, metadata } = progressDto;

    // Buscar missões ativas do usuário que correspondem à ação
    const activeMissions = await this.db
      .select()
      .from(userMissions)
      .leftJoin(missions, eq(userMissions.missionId, missions.id))
      .where(and(
        eq(userMissions.userId, userId),
        eq(userMissions.status, MissionStatus.ACTIVE),
        eq(missions.action, action)
      ));

    const updatedMissions = [];

    for (const userMission of activeMissions) {
      const newProgress = userMission.user_missions.progress + count;
      const totalRequired = userMission.missions.requirements.count;

      if (newProgress >= totalRequired) {
        // Missão completada
        await this.db
          .update(userMissions)
          .set({
            status: MissionStatus.COMPLETED,
            progress: totalRequired,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userMissions.id, userMission.user_missions.id));

        // Dar XP ao usuário
        await this.addXP({
          userId,
          xpAmount: userMission.missions.xpReward,
          source: XPSource.MISSION,
          sourceId: userMission.missions.id,
          description: `Missão completada: ${userMission.missions.title}`,
        });

        this.logger.log(`🎯 [GAMIFICATION] Missão completada: ${userMission.missions.title} (${userId})`);

        updatedMissions.push({
          ...userMission.user_missions,
          status: MissionStatus.COMPLETED,
          progress: totalRequired,
          completedAt: new Date(),
          totalRequired,
          mission: userMission.missions,
        });
      } else {
        // Atualizar progresso
        await this.db
          .update(userMissions)
          .set({
            progress: newProgress,
            updatedAt: new Date(),
          })
          .where(eq(userMissions.id, userMission.user_missions.id));

        updatedMissions.push({
          ...userMission.user_missions,
          progress: newProgress,
          totalRequired,
          mission: userMission.missions,
        });
      }
    }

    return updatedMissions;
  }

  // ===== SISTEMA DE CONQUISTAS =====

  async createAchievement(createAchievementDto: CreateAchievementDto): Promise<AchievementResponseDto> {
    const [achievement] = await this.db
      .insert(achievements)
      .values(createAchievementDto)
      .returning();

    return achievement;
  }

  async getAchievements(query: AchievementQueryDto): Promise<{ achievements: AchievementResponseDto[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, category, isActive } = query;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (category) conditions.push(eq(achievements.category, category));
    if (isActive !== undefined) conditions.push(eq(achievements.isActive, isActive));

    const [achievementsList, totalResult] = await Promise.all([
      this.db
        .select()
        .from(achievements)
        .where(and(...conditions))
        .orderBy(desc(achievements.createdAt))
        .limit(limit)
        .offset(offset),
      
      this.db
        .select({ count: count() })
        .from(achievements)
        .where(and(...conditions))
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      achievements: achievementsList,
      total,
      page,
      limit,
    };
  }

  async getAchievementById(id: string): Promise<AchievementResponseDto> {
    const [achievement] = await this.db
      .select()
      .from(achievements)
      .where(eq(achievements.id, id))
      .limit(1);

    if (!achievement) {
      throw new NotFoundException('Conquista não encontrada');
    }

    return achievement;
  }

  async updateAchievement(id: string, updateAchievementDto: UpdateAchievementDto): Promise<AchievementResponseDto> {
    const [updatedAchievement] = await this.db
      .update(achievements)
      .set({
        ...updateAchievementDto,
        updatedAt: new Date(),
      })
      .where(eq(achievements.id, id))
      .returning();

    if (!updatedAchievement) {
      throw new NotFoundException('Conquista não encontrada');
    }

    return updatedAchievement;
  }

  async deleteAchievement(id: string): Promise<void> {
    const result = await this.db
      .delete(achievements)
      .where(eq(achievements.id, id));

    if (result.rowCount === 0) {
      throw new NotFoundException('Conquista não encontrada');
    }
  }

  async getUserAchievements(userId: string): Promise<UserAchievementResponseDto[]> {
    const userAchievementsList = await this.db
      .select()
      .from(userAchievements)
      .leftJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.isActive, true)
      ))
      .orderBy(desc(userAchievements.earnedAt));

    return userAchievementsList.map(ua => ({
      ...ua.user_achievements,
      achievement: ua.achievements,
    }));
  }

  async updateAchievementProgress(progressDto: AchievementProgressDto): Promise<UserAchievementResponseDto[]> {
    const { userId, action, count, metadata } = progressDto;

    // Buscar conquistas ativas que correspondem à ação
    const activeAchievements = await this.db
      .select()
      .from(achievements)
      .where(and(
        eq(achievements.isActive, true),
        eq(achievements.action, action)
      ));

    const unlockedAchievements = [];

    for (const achievement of activeAchievements) {
      // Verificar se já foi conquistada
      const [existingAchievement] = await this.db
        .select()
        .from(userAchievements)
        .where(and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementId, achievement.id)
        ))
        .limit(1);

      if (existingAchievement) continue;

      // Verificar se os requisitos foram atendidos
      const totalProgress = await this.getUserActionCount(userId, action, achievement.requirements.conditions);
      
      if (totalProgress >= achievement.requirements.count) {
        // Conquistar achievement
        const [userAchievement] = await this.db
          .insert(userAchievements)
          .values({
            userId,
            achievementId: achievement.id,
            earnedAt: new Date(),
          })
          .returning();

        // Dar XP ao usuário
        await this.addXP({
          userId,
          xpAmount: achievement.xpReward,
          source: XPSource.ACHIEVEMENT,
          sourceId: achievement.id,
          description: `Conquista desbloqueada: ${achievement.name}`,
        });

        this.logger.log(`🏆 [GAMIFICATION] Conquista desbloqueada: ${achievement.name} (${userId})`);

        unlockedAchievements.push({
          ...userAchievement,
          achievement,
        });
      }
    }

    return unlockedAchievements;
  }

  private async checkAndUnlockAchievements(userId: string, level: number): Promise<Achievement[]> {
    // Buscar conquistas baseadas em nível
    const levelAchievements = await this.db
      .select()
      .from(achievements)
      .where(and(
        eq(achievements.isActive, true),
        eq(achievements.action, 'reach_level')
      ));

    if (!levelAchievements || !Array.isArray(levelAchievements)) {
      return [];
    }

    const unlockedAchievements = [];

    for (const achievement of levelAchievements) {
      // Verificar se já foi conquistada
      const [existingAchievement] = await this.db
        .select()
        .from(userAchievements)
        .where(and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementId, achievement.id)
        ))
        .limit(1);

      if (!existingAchievement) {
        // Conquistar achievement
        await this.db
          .insert(userAchievements)
          .values({
            userId,
            achievementId: achievement.id,
            earnedAt: new Date(),
          });

        unlockedAchievements.push(achievement);
      }
    }

    return unlockedAchievements;
  }

  private async getUserActionCount(userId: string, action: string, conditions?: Record<string, any>): Promise<number> {
    // Implementar lógica para contar ações específicas do usuário
    // Por exemplo, aulas completadas, dias consecutivos, etc.
    // Por enquanto, retornar 0 - será implementado conforme necessário
    return 0;
  }

  // ===== HISTÓRICO DE XP =====

  async getXPHistory(userId: string, query: XPHistoryQueryDto): Promise<{ history: XPHistoryResponseDto[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, source, startDate, endDate } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(xpHistory.userId, userId)];
    if (source) conditions.push(eq(xpHistory.source, source));
    if (startDate) conditions.push(gte(xpHistory.createdAt, startDate));
    if (endDate) conditions.push(lte(xpHistory.createdAt, endDate));

    const [historyList, totalResult] = await Promise.all([
      this.db
        .select()
        .from(xpHistory)
        .where(and(...conditions))
        .orderBy(desc(xpHistory.createdAt))
        .limit(limit)
        .offset(offset),
      
      this.db
        .select({ count: count() })
        .from(xpHistory)
        .where(and(...conditions))
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      history: historyList,
      total,
      page,
      limit,
    };
  }

  // ===== ESTATÍSTICAS =====

  async getGamificationStats(userId: string): Promise<GamificationStatsResponseDto> {
    const profile = await this.getUserProfile(userId);
    
    // Buscar conquistas do usuário
    const userAchievements = await this.getUserAchievements(userId);
    
    // Buscar missões do usuário
    const userMissions = await this.getUserMissions(userId);
    
    // Calcular estatísticas de XP
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [weeklyXP, monthlyXP] = await Promise.all([
      this.db
        .select({ total: sql<number>`sum(${xpHistory.xpAmount})` })
        .from(xpHistory)
        .where(and(
          eq(xpHistory.userId, userId),
          gte(xpHistory.createdAt, oneWeekAgo)
        )),
      
      this.db
        .select({ total: sql<number>`sum(${xpHistory.xpAmount})` })
        .from(xpHistory)
        .where(and(
          eq(xpHistory.userId, userId),
          gte(xpHistory.createdAt, oneMonthAgo)
        ))
    ]);

    const completedMissions = userMissions.filter(um => um.status === MissionStatus.COMPLETED);
    const activeMissions = userMissions.filter(um => um.status === MissionStatus.ACTIVE);
    const recentAchievements = userAchievements.slice(0, 5);

    return {
      userId,
      level: profile.level,
      totalXP: profile.totalXP,
      currentLevelXP: profile.currentLevelXP,
      xpToNextLevel: profile.xpToNextLevel,
      totalAchievements: userAchievements.length,
      totalMissions: userMissions.length,
      completedMissions: completedMissions.length,
      activeMissions: activeMissions.length,
      xpThisWeek: weeklyXP[0]?.total || 0,
      xpThisMonth: monthlyXP[0]?.total || 0,
      recentAchievements: recentAchievements.map(ua => ua.achievement),
      activeMissionsList: activeMissions,
    };
  }

  // ===== MÉTODOS DE INTEGRAÇÃO =====

  async processClassCompletion(userId: string, classId: string): Promise<void> {
    // Dar XP por completar aula
    await this.addXP({
      userId,
      xpAmount: 50, // XP fixo por aula completada
      source: XPSource.CLASS_COMPLETION,
      sourceId: classId,
      description: 'Aula completada',
    });

    // Atualizar progresso de missões relacionadas a aulas
    await this.updateMissionProgress({
      userId,
      action: 'complete_class',
      count: 1,
      metadata: { classId },
    });

    // Atualizar progresso de conquistas relacionadas a aulas
    await this.updateAchievementProgress({
      userId,
      action: 'complete_class',
      count: 1,
      metadata: { classId },
    });
  }

  async processDailyLogin(userId: string): Promise<void> {
    // Atualizar progresso de missões de login diário
    await this.updateMissionProgress({
      userId,
      action: 'daily_login',
      count: 1,
    });

    // Atualizar progresso de conquistas de streak
    await this.updateAchievementProgress({
      userId,
      action: 'daily_login',
      count: 1,
    });
  }
}
