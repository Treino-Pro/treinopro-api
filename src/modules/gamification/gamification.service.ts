import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { eq, and, desc, gte, lte, count, sql, or, isNull } from 'drizzle-orm';
import { ChatGateway } from '../chat/chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
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
  XPHistory,
} from '../../database/schema';
import { users } from '../../database/schema/users';
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
  LevelUpResponseDto,
} from './dto/gamification.dto';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly chatGateway: ChatGateway,
    @InjectQueue('gamification-events') private readonly eventsQueue: Queue,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Deduplicação simples de eventos emitidos neste processo (TTL curto)
  private readonly emittedEvents = new Map<string, number>();
  private readonly emittedTTLms = 5 * 60 * 1000; // 5 minutos

  private emitProfileUpdate(
    action: string,
    payload: Record<string, any>,
    userId: string,
  ): void {
    try {
      this.logger.log(
        `🎯 [GAMIFICATION] ===== EMITINDO EVENTO WEBSOCKET =====`,
      );
      this.logger.log(`🎯 [GAMIFICATION] Action: ${action}`);
      this.logger.log(`🎯 [GAMIFICATION] UserId: ${userId}`);
      this.logger.log(`🎯 [GAMIFICATION] Payload: ${JSON.stringify(payload)}`);

      const eventId = randomUUID();
      const now = Date.now();
      // Limpeza de TTL
      for (const [id, ts] of this.emittedEvents) {
        if (now - ts > this.emittedTTLms) this.emittedEvents.delete(id);
      }
      this.emittedEvents.set(eventId, now);

      const eventPayload = {
        eventId,
        action,
        type: action,
        ...payload,
        userId,
        timestamp: new Date(),
      };

      this.logger.log(
        `🎯 [GAMIFICATION] EventPayload: ${JSON.stringify(eventPayload)}`,
      );

      // Persistir no Event Store (melhor esforço, ignora se tabela não existe)
      this.persistEventToStore(eventId, userId, action, eventPayload).catch(
        (err) => {
          this.logger.warn(
            `⚠️ [GAMIFICATION] EventStore indisponível: ${err?.message || err}`,
          );
        },
      );

      // Emitir em tempo real - usar o action como tipo de evento
      this.logger.log(`🎯 [GAMIFICATION] Emitindo evento WebSocket: ${action}`);
      this.chatGateway.server.emit(action, eventPayload);
      this.logger.log(`🎯 [GAMIFICATION] Evento WebSocket emitido com sucesso`);

      // Enfileirar para processamento assíncrono
      try {
        this.eventsQueue.add('profile_update', eventPayload, {
          removeOnComplete: true,
          removeOnFail: true,
        });
      } catch (_) {
        // Se a fila não estiver configurada, não falha o fluxo principal
      }

      // Persistir métrica diária básica (melhor esforço)
      this.persistDailyMetric(userId, action, eventPayload).catch((err) => {
        this.logger.warn(
          `⚠️ [GAMIFICATION] Metrics indisponível: ${err?.message || err}`,
        );
      });

      this.logger.log(
        `✅ [GAMIFICATION] ===== EVENTO WEBSOCKET FINALIZADO =====`,
      );
    } catch (error) {
      this.logger.error(
        '❌ [GAMIFICATION] Erro ao emitir evento WebSocket:',
        error as any,
      );
    }
  }

  private async persistEventToStore(
    eventId: string,
    userId: string,
    type: string,
    payload: any,
  ): Promise<void> {
    try {
      await this.db
        .execute(sql`INSERT INTO gamification_events (id, user_id, type, payload, created_at)
        VALUES (${eventId}::uuid, ${userId}, ${type}, ${JSON.stringify(payload)}::jsonb, NOW())`);
    } catch (e) {
      // Tabela pode não existir ainda; não falhar fluxo principal
      throw e;
    }
  }

  private async persistDailyMetric(
    userId: string,
    type: string,
    payload: any,
  ): Promise<void> {
    try {
      // Incremento diário simples por usuário e tipo de evento
      await this.db.execute(sql`
        INSERT INTO gamification_metrics_daily (user_id, date, type, count)
        VALUES (${userId}, CURRENT_DATE, ${type}, 1)
        ON CONFLICT (user_id, date, type)
        DO UPDATE SET count = gamification_metrics_daily.count + 1
      `);
    } catch (e) {
      // Tabela pode não existir ainda; não falhar fluxo principal
      throw e;
    }
  }

  // ===== SISTEMA DE XP E NÍVEIS =====

  async getUserProfile(userId: string): Promise<UserProfileResponseDto> {
    this.logger.log(
      `🔍 [GAMIFICATION_SERVICE] getUserProfile chamado com userId: ${userId}`,
    );

    const [profile] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    this.logger.log(
      `🔍 [GAMIFICATION_SERVICE] Profile encontrado: ${profile ? 'SIM' : 'NÃO'}`,
    );
    if (profile) {
      this.logger.log(
        `🔍 [GAMIFICATION_SERVICE] Profile.userId: ${profile.userId}`,
      );
      this.logger.log(
        `🔍 [GAMIFICATION_SERVICE] Profile.level: ${profile.level}`,
      );
      this.logger.log(
        `🔍 [GAMIFICATION_SERVICE] Profile.totalXP: ${profile.totalXP}`,
      );
    }

    if (!profile) {
      // Criar perfil inicial se não existir
      this.logger.log(
        `🆕 [GAMIFICATION_SERVICE] Criando perfil inicial para userId: ${userId}`,
      );
      return this.createInitialProfile(userId);
    }

    // Buscar tipo de usuário para cálculo de níveis baseado em thresholds
    const [user] = await this.db
      .select({ userType: users.userType })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const userType: 'student' | 'personal' =
      user?.userType === 'personal' ? 'personal' : 'student';

    // Recalcular nível e XP atual do nível com base no totalXP e thresholds
    const recalculatedLevel = this.calculateLevel(profile.totalXP, userType);
    const recalculatedCurrentLevelXP = this.calculateCurrentLevelXP(
      profile.totalXP,
      recalculatedLevel,
      userType,
    );
    let finalProfile = profile;

    if (
      recalculatedLevel !== profile.level ||
      recalculatedCurrentLevelXP !== profile.currentLevelXP
    ) {
      // Persistir correção para consistência imediata
      await this.db
        .update(userProfiles)
        .set({
          level: recalculatedLevel,
          currentLevelXP: recalculatedCurrentLevelXP,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId));

      finalProfile = {
        ...profile,
        level: recalculatedLevel,
        currentLevelXP: recalculatedCurrentLevelXP,
      } as any;
    }

    const xpToNextLevel = this.calculateXPToNextLevel(
      finalProfile.level,
      finalProfile.currentLevelXP,
      userType,
    );

    return {
      ...finalProfile,
      xpToNextLevel,
    };
  }

  private async createInitialProfile(
    userId: string,
  ): Promise<UserProfileResponseDto> {
    const [newProfile] = await this.db
      .insert(userProfiles)
      .values({
        userId,
        level: 1,
        totalXP: 0,
        currentLevelXP: 0,
        achievements: [],
        missions: [],
        lastMissionReset: null, // Explicitamente null para campos opcionais
      })
      .returning();

    // Criar missão inicial sem pré-requisitos para novos usuários
    await this.createInitialMissionForUser(userId);

    // Determinar tipo de usuário para cálculo de thresholds
    const [user] = await this.db
      .select({ userType: users.userType })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const userType: 'student' | 'personal' =
      user?.userType === 'personal' ? 'personal' : 'student';

    return {
      ...newProfile,
      xpToNextLevel: this.calculateXPToNextLevel(1, 0, userType),
    };
  }

  /**
   * Cria uma missão inicial sem pré-requisitos para novos usuários
   */
  private async createInitialMissionForUser(userId: string): Promise<void> {
    try {
      // Criar missão de primeira aula
      const [firstClassMission] = await this.db
        .insert(missions)
        .values({
          title: 'Primeira Aula',
          description: 'Complete sua primeira aula de treino',
          xpReward: 100,
          type: 'daily',
          action: 'attend_class',
          isActive: true,
          priority: 0,
          autoAssign: true,
          prerequisites: [], // Array vazio para sem pré-requisitos
          startDate: new Date('2025-01-01T00:00:00.000Z'),
          endDate: new Date('2025-12-31T23:59:59.000Z'),
          requirements: {
            action: 'attend_class',
            count: 1,
            timeframe: 'weekly',
            conditions: {
              user_type: 'student',
            },
          },
          createdBy: null,
        })
        .returning();

      // Atribuir missão ao usuário
      await this.assignMissionToUser(userId, firstClassMission.id);
    } catch (error) {
      console.error('❌ [GAMIFICATION] Erro ao criar missão inicial:', error);
    }
  }

  async addXP(
    userId: string,
    addXPDto: AddXPDto,
  ): Promise<LevelUpResponseDto | null> {
    const { xpAmount, source, sourceId, description } = addXPDto;

    // Buscar ou criar perfil
    let profile = await this.getUserProfile(userId);
    if (!profile) {
      profile = await this.createInitialProfile(userId);
    }

    const previousLevel = profile.level;
    const newTotalXP = profile.totalXP + xpAmount;

    // Determinar tipo de usuário para aplicar thresholds corretos
    const [user] = await this.db
      .select({ userType: users.userType })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const userType: 'student' | 'personal' =
      user?.userType === 'personal' ? 'personal' : 'student';

    const newLevel = this.calculateLevel(newTotalXP, userType);
    const newCurrentLevelXP = this.calculateCurrentLevelXP(
      newTotalXP,
      newLevel,
      userType,
    );

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

    // ===== EMITIR EVENTOS WEBSOCKET =====
    // Buscar perfil atualizado e emitir xp_gained
    const updatedProfile = await this.getUserProfile(userId);
    this.emitProfileUpdate(
      'xp_gained',
      {
        profile: {
          id: updatedProfile.id,
          userId: updatedProfile.userId,
          level: updatedProfile.level,
          totalXP: updatedProfile.totalXP,
          currentLevelXP: updatedProfile.currentLevelXP,
          xpToNextLevel: updatedProfile.xpToNextLevel,
          xpGained: xpAmount,
          source: source,
        },
      },
      userId,
    );

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
      const unlockedAchievements = await this.checkAndUnlockAchievements(
        userId,
        newLevel,
      );
      levelUpResponse.unlockedAchievements = unlockedAchievements.map(
        (a) => a.name,
      );

      // ===== EVENTO WEBSOCKET PARA LEVEL UP =====
      this.emitProfileUpdate(
        'level_up',
        {
          profile: {
            userId,
            newLevel,
            previousLevel,
            xpGained: xpAmount,
            unlockedAchievements: levelUpResponse.unlockedAchievements,
            message: levelUpResponse.message,
          },
        },
        userId,
      );

      this.logger.log(
        `🎉 [GAMIFICATION] Usuário ${userId} subiu para o nível ${newLevel}`,
      );
      return levelUpResponse;
    }

    this.logger.log(
      `💫 [GAMIFICATION] Usuário ${userId} ganhou ${xpAmount} XP (${source})`,
    );
    return null;
  }

  private calculateLevel(
    totalXP: number,
    userType: 'student' | 'personal',
  ): number {
    // Cálculo baseado em thresholds específicos por tipo de usuário
    // Níveis: 1..6 (capado no 6)
    const thresholds = this.getLevelThresholds(userType);
    let accumulated = 0;
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
      const toNext = thresholds[i];
      if (totalXP >= accumulated + toNext) {
        accumulated += toNext;
        level = i + 2; // após cruzar i, nível é i+2
      } else {
        break;
      }
    }
    // Cap no nível 6
    return Math.min(level, thresholds.length + 1);
  }

  private calculateCurrentLevelXP(
    totalXP: number,
    level: number,
    userType: 'student' | 'personal',
  ): number {
    const prev = this.getTotalXPRequiredToReachLevel(level, userType);
    return Math.max(0, totalXP - prev);
  }

  private calculateXPToNextLevel(
    level: number,
    currentLevelXP: number,
    userType: 'student' | 'personal',
  ): number {
    const thresholds = this.getLevelThresholds(userType);
    // Se já está no nível máximo (6), não há próximo nível
    if (level >= thresholds.length + 1) return 0;
    const requiredForThisLevel = thresholds[level - 1]; // delta para próximo nível
    return Math.max(0, requiredForThisLevel - currentLevelXP);
  }

  private getLevelThresholds(userType: 'student' | 'personal'): number[] {
    // Array de XP necessário para avançar de N para N+1
    // Aluno: 1->2 100, 2->3 250, 3->4 500, 4->5 1000, 5->6 2000
    // Personal: 1->2 200, 2->3 500, 3->4 1000, 4->5 2000, 5->6 5000
    return userType === 'personal'
      ? [200, 500, 1000, 2000, 5000]
      : [100, 250, 500, 1000, 2000];
  }

  private getTotalXPRequiredToReachLevel(
    level: number,
    userType: 'student' | 'personal',
  ): number {
    // XP acumulado necessário para atingir o início do nível informado
    // Ex.: para nível 1 => 0, nível 2 => t[0], nível 3 => t[0]+t[1] ...
    const thresholds = this.getLevelThresholds(userType);
    if (level <= 1) return 0;
    let sum = 0;
    for (let i = 0; i < level - 1 && i < thresholds.length; i++)
      sum += thresholds[i];
    return sum;
  }

  // ===== SISTEMA DE MISSÕES =====

  async createMission(
    createMissionDto: CreateMissionDto,
    createdBy?: string,
  ): Promise<MissionResponseDto> {
    // Converter strings de data para objetos Date
    const missionData = {
      ...createMissionDto,
      startDate: createMissionDto.startDate
        ? new Date(createMissionDto.startDate)
        : null,
      endDate: createMissionDto.endDate
        ? new Date(createMissionDto.endDate)
        : null,
      createdBy: createdBy || null, // Usar o userId do token ou null
    };

    const [mission] = await this.db
      .insert(missions)
      .values(missionData)
      .returning();

    // Auto-atribuir missão recém-criada para todos usuários elegíveis
    try {
      await this.assignMissionToAllEligibleUsers(mission);
    } catch (err) {
      console.error(
        '⚠️ [GAMIFICATION] Erro ao auto-atribuir missão criada para usuários existentes:',
        err,
      );
    }

    return mission;
  }

  /**
   * Atribui a missão criada a todos os usuários elegíveis (ex.: por user_type em requirements.conditions)
   * Evita duplicatas usando verificação prévia em user_missions.
   */
  private async assignMissionToAllEligibleUsers(
    mission: MissionResponseDto,
  ): Promise<{
    usersProcessed: number;
    missionsAssigned: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let usersProcessed = 0;
    let missionsAssigned = 0;

    // Descobrir filtro de elegibilidade pelo requirements.conditions.user_type (se houver)
    let requiredUserType: 'student' | 'personal' | undefined;
    try {
      const req = (mission as any).requirements as
        | { conditions?: any }
        | undefined;
      const cond = req?.conditions || {};
      if (cond.user_type === 'student' || cond.user_type === 'personal') {
        requiredUserType = cond.user_type;
      }
    } catch (_) {
      // ignorar
    }

    // Buscar usuários elegíveis
    // Import do schema de usuários
    const { users, userStatusEnum } = await import(
      '../../database/schema/users'
    );

    const conditions: any[] = [];
    if (requiredUserType) {
      conditions.push(eq(users.userType, requiredUserType));
    }
    // Usar comparação por string 'active' conforme schema
    conditions.push(eq(users.status, 'active'));

    const whereClause =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    const eligibleUsers = await this.db.select().from(users).where(whereClause);

    // Atribuir missão para cada usuário (idempotente)
    for (const u of eligibleUsers) {
      try {
        usersProcessed++;
        // Verificar se já possui
        const already = await this.db
          .select({ id: userMissions.id })
          .from(userMissions)
          .where(
            and(
              eq(userMissions.userId, u.id),
              eq(userMissions.missionId, mission.id),
            ),
          )
          .limit(1);
        if (already.length > 0) continue;

        await this.assignMissionToUser(u.id, mission.id);
        missionsAssigned++;
      } catch (e: any) {
        errors.push(`user ${u.id}: ${e?.message || e}`);
      }
    }

    console.log('🎯 [GAMIFICATION] Missão atribuída:', {
      missionId: mission.id,
      usersProcessed,
      missionsAssigned,
      errors: errors.length,
    });
    return { usersProcessed, missionsAssigned, errors };
  }

  async getMissions(query: MissionQueryDto): Promise<{
    missions: MissionResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10, type, isActive } = query;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (type) conditions.push(eq(missions.type, type));
    if (isActive !== undefined)
      conditions.push(eq(missions.isActive, isActive));

    // Se não há condições, buscar todas as missões
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [missionsList, totalResult] = await Promise.all([
      this.db
        .select()
        .from(missions)
        .where(whereClause)
        .orderBy(desc(missions.createdAt))
        .limit(limit)
        .offset(offset),

      this.db.select({ count: count() }).from(missions).where(whereClause),
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

  async updateMission(
    id: string,
    updateMissionDto: UpdateMissionDto,
  ): Promise<MissionResponseDto> {
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
    const result = await this.db.delete(missions).where(eq(missions.id, id));

    if (result.rowCount === 0) {
      throw new NotFoundException('Missão não encontrada');
    }
  }

  async assignMissionToUser(
    userId: string,
    missionId: string,
  ): Promise<UserMissionResponseDto> {
    // Verificar se a missão existe e está ativa
    const mission = await this.getMissionById(missionId);
    if (!mission.isActive) {
      throw new BadRequestException('Missão não está ativa');
    }

    // Verificar se já está atribuída
    const [existingAssignment] = await this.db
      .select()
      .from(userMissions)
      .where(
        and(
          eq(userMissions.userId, userId),
          eq(userMissions.missionId, missionId),
        ),
      )
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

    // Emitir evento WebSocket de missão atribuída
    try {
      this.chatGateway.server.emit('profile_update', {
        eventId: randomUUID(),
        action: 'mission_assigned',
        type: 'mission_assigned',
        profile: {
          mission: {
            id: mission.id,
            title: mission.title,
            description: mission.description,
            xpReward: mission.xpReward,
            progress: 0,
            totalRequired: mission.requirements.count,
            assignedAt: new Date(),
          },
        },
        userId: userId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(
        '❌ [GAMIFICATION] Erro ao emitir evento mission_assigned:',
        error as any,
      );
    }

    return {
      ...userMission,
      totalRequired: mission.requirements.count,
      mission,
    };
  }

  async getUserMissions(
    userId: string,
    status?: MissionStatus,
  ): Promise<UserMissionResponseDto[]> {
    const conditions = [eq(userMissions.userId, userId)];
    if (status) conditions.push(eq(userMissions.status, status));

    const userMissionsList = await this.db
      .select()
      .from(userMissions)
      .leftJoin(missions, eq(userMissions.missionId, missions.id))
      .where(and(...conditions))
      .orderBy(desc(userMissions.createdAt));

    return userMissionsList.map((um) => ({
      ...um.user_missions,
      totalRequired: um.missions?.requirements?.count || 0,
      mission: um.missions,
    }));
  }

  async updateMissionProgress(
    progressDto: MissionProgressDto,
  ): Promise<UserMissionResponseDto[]> {
    const { userId, action, count, metadata } = progressDto;

    this.logger.log(
      `🎯 [GAMIFICATION] ===== ATUALIZANDO PROGRESSO DE MISSÕES =====`,
    );
    this.logger.log(`🎯 [GAMIFICATION] UserId: ${userId}`);
    this.logger.log(`🎯 [GAMIFICATION] Action: ${action}`);
    this.logger.log(`🎯 [GAMIFICATION] Count: ${count}`);

    // Buscar missões ativas do usuário que correspondem à ação
    this.logger.log(`🎯 [GAMIFICATION] Buscando missões ativas...`);
    const activeMissions = await this.db
      .select()
      .from(userMissions)
      .leftJoin(missions, eq(userMissions.missionId, missions.id))
      .where(
        and(
          eq(userMissions.userId, userId),
          eq(userMissions.status, MissionStatus.ACTIVE),
          eq(missions.action, action),
        ),
      );

    this.logger.log(
      `🎯 [GAMIFICATION] Missões ativas encontradas: ${activeMissions.length}`,
    );

    const updatedMissions = [];

    for (const userMission of activeMissions) {
      this.logger.log(
        `🎯 [GAMIFICATION] Processando missão: ${userMission.missions.title}`,
      );
      this.logger.log(
        `🎯 [GAMIFICATION] Progresso atual: ${userMission.user_missions.progress}`,
      );
      this.logger.log(
        `🎯 [GAMIFICATION] Total necessário: ${userMission.missions.requirements.count}`,
      );

      const newProgress = userMission.user_missions.progress + count;
      const totalRequired = userMission.missions.requirements.count;

      this.logger.log(
        `🎯 [GAMIFICATION] Novo progresso: ${newProgress}/${totalRequired}`,
      );

      if (newProgress >= totalRequired) {
        // Missão completada
        this.logger.log(
          `🎯 [GAMIFICATION] Missão completada! Atualizando status...`,
        );
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
        const weeklyBonusXP =
          userMission.missions.type === 'weekly'
            ? 20
            : userMission.missions.xpReward;
        this.logger.log(
          `🎯 [GAMIFICATION] Adicionando XP de recompensa: ${weeklyBonusXP}`,
        );
        await this.addXP(userId, {
          xpAmount: weeklyBonusXP,
          source: XPSource.MISSION,
          sourceId: userMission.missions.id,
          description: `Missão completada: ${userMission.missions.title}`,
        });

        this.logger.log(
          `🎯 [GAMIFICATION] Missão completada: ${userMission.missions.title} (${userId})`,
        );

        const completedMissionData = {
          ...userMission.user_missions,
          status: MissionStatus.COMPLETED,
          progress: totalRequired,
          completedAt: new Date(),
          totalRequired,
          mission: userMission.missions,
        };

        updatedMissions.push(completedMissionData);

        // ===== EVENTO WEBSOCKET PARA MISSÃO COMPLETADA =====
        this.logger.log(
          `🎯 [GAMIFICATION] Emitindo evento WebSocket mission_completed...`,
        );
        this.emitProfileUpdate(
          'mission_completed',
          {
            profile: {
              mission: {
                id: userMission.missions.id,
                title: userMission.missions.title,
                description: userMission.missions.description,
                xpReward: userMission.missions.xpReward,
                progress: totalRequired,
                totalRequired: totalRequired,
                completedAt: new Date(),
              },
            },
          },
          userId,
        );
        this.logger.log(
          `🎯 [GAMIFICATION] Evento WebSocket emitido com sucesso`,
        );

        // Criar notificação in-app para missão completada
        try {
          await this.notificationsService.sendInAppNotification(userId, 'mission-completed', {
            missionId: userMission.missions.id,
            title: userMission.missions.title,
            xpReward: userMission.missions.xpReward,
          });
          this.logger.log(`🔔 [GAMIFICATION] Notificação in-app criada para missão completada`);
        } catch (error) {
          this.logger.error(`❌ [GAMIFICATION] Erro ao criar notificação in-app:`, error);
          // Não bloquear o fluxo se notificação falhar
        }

        // Atribuir próxima missão automaticamente
        this.logger.log(`🎯 [GAMIFICATION] Atribuindo próxima missão...`);
        await this.assignNextMission(userId);
        this.logger.log(`🎯 [GAMIFICATION] Próxima missão atribuída`);
      } else {
        // Atualizar progresso
        this.logger.log(`🎯 [GAMIFICATION] Atualizando progresso da missão...`);
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

        // ===== EVENTO WEBSOCKET PARA PROGRESSO DE MISSÃO =====
        this.logger.log(
          `🎯 [GAMIFICATION] Emitindo evento WebSocket mission_progressed...`,
        );
        this.emitProfileUpdate(
          'mission_progressed',
          {
            profile: {
              mission: {
                id: userMission.missions.id,
                title: userMission.missions.title,
                description: userMission.missions.description,
                xpReward: userMission.missions.xpReward,
                progress: newProgress,
                totalRequired: totalRequired,
              },
            },
          },
          userId,
        );
        this.logger.log(
          `🎯 [GAMIFICATION] Evento WebSocket mission_progressed emitido`,
        );
        this.logger.log(
          `🎯 [GAMIFICATION] Progresso atualizado: ${newProgress}/${totalRequired}`,
        );
      }
    }

    this.logger.log(
      `✅ [GAMIFICATION] ===== ATUALIZAÇÃO DE MISSÕES FINALIZADA =====`,
    );
    return updatedMissions;
  }

  // ===== SISTEMA DE CONQUISTAS =====

  async createAchievement(
    createAchievementDto: CreateAchievementDto,
  ): Promise<AchievementResponseDto> {
    const [achievement] = await this.db
      .insert(achievements)
      .values(createAchievementDto)
      .returning();

    return achievement;
  }

  async getAchievements(query: AchievementQueryDto): Promise<{
    achievements: AchievementResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10, category, isActive } = query;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (category) conditions.push(eq(achievements.category, category));
    if (isActive !== undefined)
      conditions.push(eq(achievements.isActive, isActive));

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
        .where(and(...conditions)),
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

  async updateAchievement(
    id: string,
    updateAchievementDto: UpdateAchievementDto,
  ): Promise<AchievementResponseDto> {
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

  async getUserAchievements(
    userId: string,
  ): Promise<UserAchievementResponseDto[]> {
    const userAchievementsList = await this.db
      .select()
      .from(userAchievements)
      .leftJoin(
        achievements,
        eq(userAchievements.achievementId, achievements.id),
      )
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.isActive, true),
        ),
      )
      .orderBy(desc(userAchievements.earnedAt));

    return userAchievementsList.map((ua) => ({
      ...ua.user_achievements,
      achievement: ua.achievements,
    }));
  }

  async updateAchievementProgress(
    progressDto: AchievementProgressDto,
  ): Promise<UserAchievementResponseDto[]> {
    const { userId, action, count, metadata } = progressDto;

    // Buscar conquistas ativas que correspondem à ação
    const activeAchievements = await this.db
      .select()
      .from(achievements)
      .where(
        and(eq(achievements.isActive, true), eq(achievements.action, action)),
      );

    const unlockedAchievements = [];

    for (const achievement of activeAchievements) {
      // Verificar se já foi conquistada
      const [existingAchievement] = await this.db
        .select()
        .from(userAchievements)
        .where(
          and(
            eq(userAchievements.userId, userId),
            eq(userAchievements.achievementId, achievement.id),
          ),
        )
        .limit(1);

      if (existingAchievement) continue;

      // Verificar se os requisitos foram atendidos
      const totalProgress = await this.getUserActionCount(
        userId,
        action,
        achievement.requirements.conditions,
      );

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
        await this.addXP(userId, {
          xpAmount: achievement.xpReward,
          source: XPSource.ACHIEVEMENT,
          sourceId: achievement.id,
          description: `Conquista desbloqueada: ${achievement.name}`,
        });

        this.logger.log(
          `🏆 [GAMIFICATION] Conquista desbloqueada: ${achievement.name} (${userId})`,
        );

        unlockedAchievements.push({
          ...userAchievement,
          achievement,
        });
      }
    }

    return unlockedAchievements;
  }

  private async checkAndUnlockAchievements(
    userId: string,
    level: number,
  ): Promise<Achievement[]> {
    // Buscar conquistas baseadas em nível
    const levelAchievements = await this.db
      .select()
      .from(achievements)
      .where(
        and(
          eq(achievements.isActive, true),
          eq(achievements.action, 'reach_level'),
        ),
      );

    if (!levelAchievements || !Array.isArray(levelAchievements)) {
      return [];
    }

    const unlockedAchievements = [];

    for (const achievement of levelAchievements) {
      // Verificar se já foi conquistada
      const [existingAchievement] = await this.db
        .select()
        .from(userAchievements)
        .where(
          and(
            eq(userAchievements.userId, userId),
            eq(userAchievements.achievementId, achievement.id),
          ),
        )
        .limit(1);

      if (!existingAchievement) {
        // Conquistar achievement
        await this.db.insert(userAchievements).values({
          userId,
          achievementId: achievement.id,
          earnedAt: new Date(),
        });

        unlockedAchievements.push(achievement);
      }
    }

    return unlockedAchievements;
  }

  private async getUserActionCount(
    userId: string,
    action: string,
    conditions?: Record<string, any>,
  ): Promise<number> {
    // Implementar lógica para contar ações específicas do usuário
    // Por exemplo, aulas completadas, dias consecutivos, etc.
    // Por enquanto, retornar 0 - será implementado conforme necessário
    return 0;
  }

  // ===== HISTÓRICO DE XP =====

  async getXPHistory(
    userId: string,
    query: XPHistoryQueryDto,
  ): Promise<{
    history: XPHistoryResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10, source, startDate, endDate } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(xpHistory.userId, userId)];
    if (source) conditions.push(eq(xpHistory.source, source));
    if (startDate)
      conditions.push(gte(xpHistory.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(xpHistory.createdAt, new Date(endDate)));

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
        .where(and(...conditions)),
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

  async getGamificationStats(
    userId: string,
  ): Promise<GamificationStatsResponseDto> {
    this.logger.log(
      `📊 [GAMIFICATION_SERVICE] getGamificationStats chamado com userId: ${userId}`,
    );

    const profile = await this.getUserProfile(userId);
    this.logger.log(
      `📊 [GAMIFICATION_SERVICE] Profile retornado - userId: ${profile.userId}, level: ${profile.level}, totalXP: ${profile.totalXP}`,
    );

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
        .where(
          and(
            eq(xpHistory.userId, userId),
            gte(xpHistory.createdAt, oneWeekAgo),
          ),
        ),

      this.db
        .select({ total: sql<number>`sum(${xpHistory.xpAmount})` })
        .from(xpHistory)
        .where(
          and(
            eq(xpHistory.userId, userId),
            gte(xpHistory.createdAt, oneMonthAgo),
          ),
        ),
    ]);

    const completedMissions = userMissions.filter(
      (um) => um.status === MissionStatus.COMPLETED,
    );
    const activeMissions = userMissions.filter(
      (um) => um.status === MissionStatus.ACTIVE,
    );
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
      xpThisWeek: Number(weeklyXP[0]?.total) || 0,
      xpThisMonth: Number(monthlyXP[0]?.total) || 0,
      recentAchievements: recentAchievements.map((ua) => ua.achievement),
      activeMissionsList: activeMissions,
    };
  }

  // ===== SISTEMA DE ATRIBUIÇÃO AUTOMÁTICA =====

  async assignNextMission(
    userId: string,
  ): Promise<UserMissionResponseDto | null> {
    try {
      // Buscar missões disponíveis para atribuição automática
      const availableMissions = await this.getAvailableMissionsForUser(userId);

      if (availableMissions.length === 0) {
        return null;
      }

      // Pegar a missão com maior prioridade (menor número = maior prioridade)
      const nextMission = availableMissions[0];

      // Atribuir missão ao usuário
      const assignedMission = await this.assignMissionToUser(
        userId,
        nextMission.id,
      );

      return assignedMission;
    } catch (error) {
      console.error(
        '❌ [GAMIFICATION] Erro ao atribuir próxima missão:',
        error,
      );
      return null;
    }
  }

  async getAvailableMissionsForUser(
    userId: string,
  ): Promise<MissionResponseDto[]> {
    // Buscar missões que o usuário já completou
    const completedMissions = await this.db
      .select({ missionId: userMissions.missionId })
      .from(userMissions)
      .where(
        and(
          eq(userMissions.userId, userId),
          eq(userMissions.status, MissionStatus.COMPLETED),
        ),
      );

    const completedMissionIds = completedMissions.map((m) => m.missionId);

    // Buscar missões ativas que podem ser atribuídas automaticamente
    // Primeiro, buscar todas as missões ativas com autoAssign
    const allActiveMissions = await this.db
      .select()
      .from(missions)
      .where(and(eq(missions.isActive, true), eq(missions.autoAssign, true)))
      .orderBy(missions.priority, missions.createdAt);

    // Buscar missões já atribuídas ao usuário
    const userAssignedMissions = await this.db
      .select({ missionId: userMissions.missionId })
      .from(userMissions)
      .where(
        and(
          eq(userMissions.userId, userId),
          eq(userMissions.status, MissionStatus.ACTIVE),
        ),
      );

    const assignedMissionIds = userAssignedMissions.map((m) => m.missionId);

    // Filtrar missões que não estão atribuídas
    const availableMissions = allActiveMissions.filter(
      (mission) => !assignedMissionIds.includes(mission.id),
    );

    // Filtrar missões que atendem aos pré-requisitos
    const eligibleMissions = availableMissions.filter((mission) => {
      if (!mission.prerequisites || mission.prerequisites.length === 0) {
        return true; // Sem pré-requisitos
      }

      // Verificar se todos os pré-requisitos foram completados
      const hasAllPrerequisites = mission.prerequisites.every((prereqId) =>
        completedMissionIds.includes(prereqId),
      );

      return hasAllPrerequisites;
    });

    // Ordenar missões: primeiro as sem pré-requisitos, depois as com pré-requisitos
    eligibleMissions.sort((a, b) => {
      const aHasPrereq = a.prerequisites && a.prerequisites.length > 0;
      const bHasPrereq = b.prerequisites && b.prerequisites.length > 0;

      if (aHasPrereq && !bHasPrereq) return 1; // b vem primeiro
      if (!aHasPrereq && bHasPrereq) return -1; // a vem primeiro
      return 0; // mantém ordem original
    });

    return eligibleMissions;
  }

  // ===== MIGRAÇÃO DE USUÁRIOS EXISTENTES =====

  async migrateExistingUsers(): Promise<{
    message: string;
    usersProcessed: number;
    missionsAssigned: number;
    errors: string[];
  }> {
    this.logger.log(
      '🔄 [GAMIFICATION] Iniciando migração de usuários existentes...',
    );

    let usersProcessed = 0;
    let missionsAssigned = 0;
    const errors: string[] = [];

    try {
      // Buscar todos os usuários que não têm perfil de gamificação
      const usersWithoutProfile = await this.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(isNull(userProfiles.userId));

      this.logger.log(
        `📊 [GAMIFICATION] Encontrados ${usersWithoutProfile.length} usuários sem perfil de gamificação`,
      );

      for (const user of usersWithoutProfile) {
        try {
          // Criar perfil inicial (que já atribui primeira missão)
          await this.createInitialProfile(user.id);
          missionsAssigned++;
          this.logger.log(
            `✅ [GAMIFICATION] Perfil criado para usuário: ${user.email}`,
          );
        } catch (error) {
          const errorMsg = `Erro ao criar perfil para ${user.email}: ${error.message}`;
          errors.push(errorMsg);
          this.logger.error(`❌ [GAMIFICATION] ${errorMsg}`);
        }

        usersProcessed++;
      }

      const message = `Migração concluída! ${usersProcessed} usuários processados, ${missionsAssigned} missões atribuídas`;
      this.logger.log(`🎉 [GAMIFICATION] ${message}`);

      return {
        message,
        usersProcessed,
        missionsAssigned,
        errors,
      };
    } catch (error) {
      const errorMsg = `Erro geral na migração: ${error.message}`;
      this.logger.error(`❌ [GAMIFICATION] ${errorMsg}`);

      return {
        message: 'Migração falhou',
        usersProcessed,
        missionsAssigned,
        errors: [...errors, errorMsg],
      };
    }
  }

  // ===== MÉTODOS DE INTEGRAÇÃO =====

  async processClassCompletion(userId: string, classId: string): Promise<void> {
    this.logger.log(
      `🎯 [GAMIFICATION] ===== INICIANDO PROCESSAMENTO DE CONCLUSÃO =====`,
    );
    this.logger.log(`🎯 [GAMIFICATION] UserId: ${userId}`);
    this.logger.log(`🎯 [GAMIFICATION] ClassId: ${classId}`);

    try {
      // Dar XP por completar aula
      this.logger.log(
        `🎯 [GAMIFICATION] Adicionando XP por aula completada...`,
      );
      await this.addXP(userId, {
        xpAmount: 10, // XP fixo por aula completada (ajustado)
        source: XPSource.CLASS_COMPLETION,
        sourceId: classId,
        description: 'Aula completada',
      });
      this.logger.log(`🎯 [GAMIFICATION] XP adicionado com sucesso`);

      // Atualizar progresso de missões relacionadas a aulas
      this.logger.log(`🎯 [GAMIFICATION] Atualizando progresso de missões...`);
      const updatedMissions = await this.updateMissionProgress({
        userId,
        action: 'attend_class',
        count: 1,
        metadata: { classId },
      });
      this.logger.log(`🎯 [GAMIFICATION] Progresso de missões atualizado`);

      // Atualizar progresso de conquistas relacionadas a aulas
      this.logger.log(
        `🎯 [GAMIFICATION] Atualizando progresso de conquistas...`,
      );
      await this.updateAchievementProgress({
        userId,
        action: 'attend_class',
        count: 1,
        metadata: { classId },
      });
      this.logger.log(`🎯 [GAMIFICATION] Progresso de conquistas atualizado`);

      // Emitir evento consolidado com as missões atualizadas para resolver race condition
      this.logger.log(
        `🎯 [GAMIFICATION] Emitindo evento consolidado de conclusão...`,
      );
      this.emitProfileUpdate(
        'class_completion_processed',
        {
          profile: {
            classId,
            missionsUpdated: updatedMissions.map((m) => ({
              id: m.mission.id,
              title: m.mission.title,
              progress: m.progress,
              totalRequired: m.totalRequired,
              status: m.status,
            })),
            xpGained: 10,
            source: 'class_completion',
          },
        },
        userId,
      );
      this.logger.log(
        `🎯 [GAMIFICATION] Evento consolidado emitido com sucesso`,
      );

      this.logger.log(
        `✅ [GAMIFICATION] ===== PROCESSAMENTO DE CONCLUSÃO FINALIZADO COM SUCESSO =====`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [GAMIFICATION] Erro ao processar conclusão de aula:`,
        error,
      );
      this.logger.error(`❌ [GAMIFICATION] Stack trace:`, error.stack);
      this.logger.error(`❌ [GAMIFICATION] Detalhes do erro:`, {
        message: error.message,
        name: error.name,
        userId,
        classId,
      });
      throw error; // Re-throw para que o chamador saiba que falhou
    }
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
