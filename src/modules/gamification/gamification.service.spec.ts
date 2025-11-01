import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService } from './gamification.service';
import {
  XPSource,
  MissionType,
  AchievementCategory,
} from '../../database/schema';

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
      const mockProfile = {
        id: 'profile-1',
        userId,
        level: 5,
        totalXP: 1000,
        currentLevelXP: 200,
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

      const result = await service.getUserProfile(userId);

      expect(result).toEqual({
        ...mockProfile,
        xpToNextLevel: expect.any(Number),
      });
    });

    it('should create initial profile if not exists', async () => {
      const userId = 'user-1';

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 'profile-1',
              userId,
              level: 1,
              totalXP: 0,
              currentLevelXP: 0,
              achievements: [],
              missions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
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
        userId,
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

      const result = await service.addXP(addXPDto);

      expect(result).toBeNull(); // Não subiu de nível
    });

    it('should add XP with level up', async () => {
      const userId = 'user-1';
      const addXPDto = {
        userId,
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

      const result = await service.addXP(addXPDto);

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

      expect(service.addXP).toHaveBeenCalledWith({
        userId,
        xpAmount: 10,
        source: XPSource.CLASS_COMPLETION,
        sourceId: classId,
        description: 'Aula completada',
      });
    });
  });
});
