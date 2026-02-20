import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { GamificationService } from './gamification.service';
import { ChatGateway } from '../chat/chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import {
  XPSource,
  MissionType,
  AchievementCategory,
} from '../../database/schema';

// Mocks de dependências extras
const mockChatGateway = {
  emitGamificationEvent: jest.fn(),
  server: { emit: jest.fn() },
};

const mockEventsQueue = {
  add: jest.fn(),
};

const mockNotificationsService = {
  sendNotification: jest.fn(),
};

// Mock do banco de dados
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  query: {
    userProfiles: {
      findFirst: jest.fn(),
    },
    missions: {
      findFirst: jest.fn(),
    },
    achievements: {
      findFirst: jest.fn(),
    },
  },
};

describe('GamificationService', () => {
  let service: GamificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamificationService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
        {
          provide: ChatGateway,
          useValue: mockChatGateway,
        },
        {
          provide: getQueueToken('gamification-events'),
          useValue: mockEventsQueue,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserProfile', () => {
    it('should return user profile if exists', async () => {
      const userId = 'user-1';
      // totalXP=2050 → student level formula: 100+250+500+1000=1850 → level 5, currentLevelXP=200
      const mockProfile = {
        id: 'profile-1',
        userId,
        level: 5,
        totalXP: 2050,
        currentLevelXP: 200,
        achievements: [],
        missions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 1. User existence check
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: userId }]),
          }),
        }),
      });
      // 2. Profile query
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockProfile]),
          }),
        }),
      });
      // 3. userType query (to recalculate level)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ userType: 'student' }]),
          }),
        }),
      });

      const result = await service.getUserProfile(userId);

      expect(result).toEqual({
        ...mockProfile,
        xpToNextLevel: expect.any(Number),
      });
    });

    it('should create initial profile if not exists', async () => {
      const userId = 'user-1';
      const newProfile = {
        id: 'profile-1',
        userId,
        level: 1,
        totalXP: 0,
        currentLevelXP: 0,
        achievements: [],
        missions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 1. User existence check in getUserProfile
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: userId }]),
          }),
        }),
      });
      // 2. Profile query → empty (triggers createInitialProfile)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      // 3. User/userType check inside createInitialProfile
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ userType: 'student', id: userId }]),
          }),
        }),
      });
      // 4. Insert userProfile returning
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([newProfile]),
        }),
      });

      const result = await service.getUserProfile(userId);

      expect(result.level).toBe(1);
      expect(result.totalXP).toBe(0);
      expect(result.xpToNextLevel).toBe(100); // XP necessário para nível 2
    });
  });

  describe('addXP', () => {
    it('should add XP without level up', async () => {
      const userId = 'user-1';
      const addXPDto = {
        xpAmount: 25,
        source: XPSource.CLASS_COMPLETION,
        sourceId: 'class-1',
        description: 'Aula completada',
      };

      const mockProfile = {
        id: 'profile-1',
        userId,
        level: 1,
        totalXP: 25,
        currentLevelXP: 25,
        achievements: [],
        missions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockProfile]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.addXP(userId, addXPDto);

      expect(result).toBeNull(); // Não subiu de nível
    });

    it('should add XP with level up', async () => {
      const userId = 'user-1';
      const addXPDto = {
        xpAmount: 100,
        source: XPSource.CLASS_COMPLETION,
        sourceId: 'class-1',
        description: 'Aula completada',
      };

      const mockProfile = {
        id: 'profile-1',
        userId,
        level: 1,
        totalXP: 0,
        currentLevelXP: 0,
        achievements: [],
        missions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockProfile]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.addXP(userId, addXPDto);

      expect(result).toEqual({
        userId,
        newLevel: 2,
        previousLevel: 1,
        xpGained: 100,
        message: 'Parabéns! Você subiu para o nível 2!',
        unlockedAchievements: [],
      });
    });
  });

  describe('createMission', () => {
    it('should create a mission', async () => {
      const createMissionDto = {
        title: 'Complete 5 classes',
        description: 'Complete 5 classes this week',
        xpReward: 100,
        type: MissionType.WEEKLY,
        action: 'attend_class',
        requirements: {
          action: 'attend_class',
          count: 5,
          timeframe: 'week',
        },
      };

      const mockMission = {
        id: 'mission-1',
        ...createMissionDto,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockMission]),
        }),
      });

      const result = await service.createMission(createMissionDto);

      expect(result).toEqual(mockMission);
    });
  });

  describe('createAchievement', () => {
    it('should create an achievement', async () => {
      const createAchievementDto = {
        name: 'First Class',
        description: 'Complete your first class',
        xpReward: 50,
        category: AchievementCategory.TRAINING,
        action: 'attend_class',
        requirements: {
          action: 'attend_class',
          count: 1,
        },
      };

      const mockAchievement = {
        id: 'achievement-1',
        ...createAchievementDto,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockAchievement]),
        }),
      });

      const result = await service.createAchievement(createAchievementDto);

      expect(result).toEqual(mockAchievement);
    });
  });

  describe('processClassCompletion', () => {
    it('should process class completion and add XP', async () => {
      const userId = 'user-1';
      const classId = 'class-1';

      // Mock do addXP
      jest.spyOn(service, 'addXP').mockResolvedValue(null);
      jest.spyOn(service, 'updateMissionProgress').mockResolvedValue([]);
      jest.spyOn(service, 'updateAchievementProgress').mockResolvedValue([]);

      await service.processClassCompletion(userId, classId);

      expect(service.addXP).toHaveBeenCalledWith(userId, {
        xpAmount: 10,
        source: XPSource.CLASS_COMPLETION,
        sourceId: classId,
        description: 'Aula completada',
      });
    });
  });

  // ===== NOVOS TESTES: checkAndUnlockAchievements (via método privado) =====

  describe('checkAndUnlockAchievements - level check', () => {
    const userId = 'user-1';
    const level5Achievement = {
      id: 'ach-level5',
      name: 'Mestre',
      action: 'reach_level',
      requirements: { count: 5 },
      xpReward: 100,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should NOT unlock reach_level achievement when currentLevel < requiredLevel', async () => {
      // 1. achievements query (no .limit())
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([level5Achievement]),
        }),
      });
      // 2. userType query (with .limit())
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ userType: 'student' }]),
          }),
        }),
      });
      // Step 3 (check existing) is SKIPPED because level 2 < 5

      const result = await (service as any).checkAndUnlockAchievements(
        userId,
        2, // currentLevel = 2, requiredLevel = 5 → must NOT unlock
      );

      expect(result).toEqual([]);
    });

    it('should unlock reach_level achievement when currentLevel >= requiredLevel', async () => {
      // 1. achievements query
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([level5Achievement]),
        }),
      });
      // 2. userType query
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ userType: 'student' }]),
          }),
        }),
      });
      // 3. check existing achievement → not earned
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      // 4. insert userAchievements
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValue(undefined),
      });

      const result = await (service as any).checkAndUnlockAchievements(
        userId,
        5, // currentLevel = 5 >= requiredLevel = 5 → MUST unlock
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Mestre');
    });

    it('should NOT unlock reach_level achievement when user_type condition is not met', async () => {
      const personalOnlyAchievement = {
        ...level5Achievement,
        id: 'ach-personal-level5',
        name: 'Personal Expert',
        requirements: { count: 5, conditions: { user_type: 'personal' } },
      };

      // 1. achievements query
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([personalOnlyAchievement]),
        }),
      });
      // 2. userType query → student
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ userType: 'student' }]),
          }),
        }),
      });
      // Step 3 skipped: conditions.user_type 'personal' !== 'student'

      const result = await (service as any).checkAndUnlockAchievements(
        userId,
        5,
      );

      expect(result).toEqual([]);
    });
  });

  // ===== NOVOS TESTES: updateAchievementProgress - conditions.user_type =====

  describe('updateAchievementProgress - conditions.user_type', () => {
    const userId = 'user-1';
    const studentAchievement = {
      id: 'ach-student',
      name: 'Aluno Dedicado',
      action: 'attend_class',
      requirements: { count: 1, conditions: { user_type: 'student' } },
      xpReward: 50,
      isActive: true,
    };

    it('should NOT unlock achievement when user_type condition is not met', async () => {
      // 1. userType query → personal
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ userType: 'personal' }]),
          }),
        }),
      });
      // 2. achievements query → [studentAchievement]
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([studentAchievement]),
        }),
      });
      // Step 3 skipped: conditions.user_type 'student' !== 'personal'

      const result = await service.updateAchievementProgress({
        userId,
        action: 'attend_class',
        count: 1,
      });

      expect(result).toEqual([]);
    });

    it('should unlock achievement when user_type condition is met', async () => {
      const mockUserAchievement = {
        userId,
        achievementId: 'ach-student',
        earnedAt: new Date(),
      };

      // 1. userType query → student
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ userType: 'student' }]),
          }),
        }),
      });
      // 2. achievements query → [studentAchievement]
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([studentAchievement]),
        }),
      });
      // 3. check existing achievement → not earned
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      // 4. getUserActionCount: xpHistory count (no .limit())
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: 1 }]),
        }),
      });
      // 5. insert userAchievements
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockUserAchievement]),
        }),
      });
      // 6. addXP called internally → spy to avoid cascade
      jest.spyOn(service, 'addXP').mockResolvedValue(null);

      const result = await service.updateAchievementProgress({
        userId,
        action: 'attend_class',
        count: 1,
      });

      expect(result).toHaveLength(1);
      expect(result[0].achievement.name).toBe('Aluno Dedicado');
    });
  });
});
