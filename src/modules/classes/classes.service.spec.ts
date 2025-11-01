import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import {
  CreateClassDto,
  ClassStatus,
  StartClassDto,
  CompleteClassDto,
} from './dto/classes.dto';
import { GamificationService } from '../gamification/gamification.service';

// Mock do banco de dados
const mockDb = {
  query: {
    classes: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    proposals: {
      findFirst: jest.fn(),
    },
  },
  insert: jest.fn(),
  update: jest.fn(),
  select: jest.fn(),
};

// Mock do GamificationService
const mockGamificationService = {
  processClassCompletion: jest.fn(),
  addXP: jest.fn(),
  updateMissionProgress: jest.fn(),
  updateAchievementProgress: jest.fn(),
};

describe('ClassesService', () => {
  let service: ClassesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
        {
          provide: GamificationService,
          useValue: mockGamificationService,
        },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createClass', () => {
    it('deve criar uma aula com sucesso', async () => {
      // Arrange
      const createClassDto: CreateClassDto = {
        proposalId: 'proposal-1',
        studentId: 'student-1',
        personalId: 'personal-1',
        location: 'Academia Central',
        date: '2024-01-15',
        time: '14:00',
        duration: 60,
      };

      const userId = 'student-1';
      const mockProposal = {
        id: 'proposal-1',
        studentId: 'student-1',
        status: 'accepted',
      };

      const mockClass = {
        id: 'class-1',
        ...createClassDto,
        status: ClassStatus.SCHEDULED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.query.proposals.findFirst.mockResolvedValue(mockProposal);
      mockDb.query.classes.findFirst.mockResolvedValue(null);
      // Sem conflito de horário no dia (select classes retorna lista vazia)
      mockDb.select.mockImplementation(() => ({
        from: () => ({ where: () => Promise.resolve([]) }),
      }));
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockClass]),
        }),
      });

      // Act
      const result = await service.createClass(createClassDto, userId);

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          id: 'class-1',
          proposalId: 'proposal-1',
          studentId: 'student-1',
          personalId: 'personal-1',
          location: 'Academia Central',
          status: ClassStatus.SCHEDULED,
        }),
      );
    });

    it('deve lançar erro se proposta não for encontrada', async () => {
      // Arrange
      const createClassDto: CreateClassDto = {
        proposalId: 'proposal-inexistente',
        studentId: 'student-1',
        personalId: 'personal-1',
        location: 'Academia Central',
        date: '2024-01-15',
        time: '14:00',
        duration: 60,
      };

      const userId = 'student-1';
      mockDb.query.proposals.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.createClass(createClassDto, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar erro se usuário não for o aluno da proposta', async () => {
      // Arrange
      const createClassDto: CreateClassDto = {
        proposalId: 'proposal-1',
        studentId: 'student-1',
        personalId: 'personal-1',
        location: 'Academia Central',
        date: '2024-01-15',
        time: '14:00',
        duration: 60,
      };

      const userId = 'outro-usuario';
      const mockProposal = {
        id: 'proposal-1',
        studentId: 'student-1',
        status: 'accepted',
      };

      mockDb.query.proposals.findFirst.mockResolvedValue(mockProposal);

      // Act & Assert
      await expect(service.createClass(createClassDto, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar erro se proposta não estiver aceita', async () => {
      // Arrange
      const createClassDto: CreateClassDto = {
        proposalId: 'proposal-1',
        studentId: 'student-1',
        personalId: 'personal-1',
        location: 'Academia Central',
        date: '2024-01-15',
        time: '14:00',
        duration: 60,
      };

      const userId = 'student-1';
      const mockProposal = {
        id: 'proposal-1',
        studentId: 'student-1',
        status: 'pending',
      };

      mockDb.query.proposals.findFirst.mockResolvedValue(mockProposal);

      // Act & Assert
      await expect(service.createClass(createClassDto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar erro de conflito quando já houver aula do personal no mesmo período', async () => {
      const createClassDto: CreateClassDto = {
        proposalId: 'proposal-1',
        studentId: 'student-1',
        personalId: 'personal-1',
        location: 'Academia Central',
        date: '2024-01-15',
        time: '14:00', // 14:00-15:00
        duration: 60,
      };

      const userId = 'student-1';
      const mockProposal = {
        id: 'proposal-1',
        studentId: 'student-1',
        personalId: 'personal-1',
        status: 'accepted',
      } as any;

      const existingClass = {
        id: 'class-9',
        personalId: 'personal-1',
        studentId: 'student-x',
        date: new Date('2024-01-15T00:00:00Z'),
        time: '14:30', // 14:30-15:30 (conflita)
        duration: 60,
        status: 'scheduled',
      };

      mockDb.query.proposals.findFirst.mockResolvedValue(mockProposal);
      mockDb.query.classes.findFirst.mockResolvedValue(null);
      mockDb.select.mockImplementation(() => ({
        from: () => ({ where: () => Promise.resolve([existingClass]) }),
      }));

      await expect(service.createClass(createClassDto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('startClass', () => {
    it('deve iniciar uma aula com sucesso', async () => {
      // Arrange
      const classId = 'class-1';
      const userId = 'personal-1';
      const startClassDto: StartClassDto = {
        notes: 'Aula iniciada com sucesso',
      };

      // Usar uma data atual para evitar problemas de timing
      const now = new Date();
      const classTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutos no futuro
      const mockClass = {
        id: 'class-1',
        personalId: 'personal-1',
        status: ClassStatus.SCHEDULED,
        date: classTime,
        time: classTime.toTimeString().slice(0, 5), // HH:MM format
        startedAt: null,
      };

      const updatedClass = {
        ...mockClass,
        status: ClassStatus.PENDING_CONFIRMATION, // O status correto após startClass
        pendingConfirmationAt: new Date(),
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      // Act
      const result = await service.startClass(classId, startClassDto, userId);

      // Assert
      expect(result.status).toBe(ClassStatus.PENDING_CONFIRMATION);
      expect(result.pendingConfirmationAt).toBeDefined();
    });

    it('deve lançar erro se usuário não for o personal trainer', async () => {
      // Arrange
      const classId = 'class-1';
      const userId = 'student-1';
      const startClassDto: StartClassDto = {};

      const mockClass = {
        id: 'class-1',
        personalId: 'personal-1',
        status: ClassStatus.SCHEDULED,
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);

      // Act & Assert
      await expect(
        service.startClass(classId, startClassDto, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar erro se aula não estiver agendada', async () => {
      // Arrange
      const classId = 'class-1';
      const userId = 'personal-1';
      const startClassDto: StartClassDto = {};

      const mockClass = {
        id: 'class-1',
        personalId: 'personal-1',
        status: ClassStatus.ACTIVE,
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);

      // Act & Assert
      await expect(
        service.startClass(classId, startClassDto, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeClass', () => {
    it('deve finalizar uma aula com sucesso', async () => {
      // Arrange
      const classId = 'class-1';
      const userId = 'personal-1';
      const completeClassDto: CompleteClassDto = {
        notes: 'Aula finalizada com sucesso',
      };

      const mockClass = {
        id: 'class-1',
        personalId: 'personal-1',
        status: ClassStatus.ACTIVE,
        startedAt: new Date('2024-01-01T09:30:00.000Z'), // 30 minutos atrás
      };

      const updatedClass = {
        ...mockClass,
        status: ClassStatus.COMPLETED,
        completedAt: new Date(),
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      // Act
      const result = await service.completeClass(
        classId,
        completeClassDto,
        userId,
      );

      // Assert
      expect(result.status).toBe(ClassStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });

    it('deve lançar erro se aula não estiver ativa', async () => {
      // Arrange
      const classId = 'class-1';
      const userId = 'personal-1';
      const completeClassDto: CompleteClassDto = {};

      const mockClass = {
        id: 'class-1',
        personalId: 'personal-1',
        status: ClassStatus.SCHEDULED,
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);

      // Act & Assert
      await expect(
        service.completeClass(classId, completeClassDto, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });
  describe('updateClass', () => {
    it('deve lançar erro de conflito ao atualizar para horário que sobrepõe outra aula', async () => {
      const classId = 'class-1';
      const userId = 'personal-1';

      const currentClass = {
        id: classId,
        personalId: userId,
        studentId: 'student-1',
        date: new Date('2024-01-15T00:00:00Z'),
        time: '12:00',
        duration: 60,
        status: ClassStatus.SCHEDULED,
      } as any;

      const updateDto = { time: '14:00', duration: 60 };

      const otherClass = {
        id: 'class-2',
        personalId: userId,
        date: new Date('2024-01-15T00:00:00Z'),
        time: '14:30', // 14:30-15:30 (conflita com 14:00-15:00)
        duration: 60,
        status: ClassStatus.SCHEDULED,
      } as any;

      mockDb.query.classes.findFirst.mockResolvedValue(currentClass);
      mockDb.select.mockImplementation(() => ({
        from: () => ({ where: () => Promise.resolve([otherClass]) }),
      }));

      await expect(
        service.updateClass(classId, updateDto as any, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve atualizar aula quando não houver conflito', async () => {
      const classId = 'class-1';
      const userId = 'personal-1';

      const currentClass = {
        id: classId,
        personalId: userId,
        studentId: 'student-1',
        date: new Date('2024-01-15T00:00:00Z'),
        time: '12:00',
        duration: 60,
        status: ClassStatus.SCHEDULED,
      } as any;

      const updateDto = { time: '16:00', duration: 60 };

      const nonOverlapping = {
        id: 'class-2',
        personalId: userId,
        date: new Date('2024-01-15T00:00:00Z'),
        time: '14:00', // 14:00-15:00 não conflita com 16:00-17:00
        duration: 60,
        status: ClassStatus.SCHEDULED,
      } as any;

      const updated = { ...currentClass, ...updateDto } as any;

      mockDb.query.classes.findFirst.mockResolvedValue(currentClass);
      mockDb.select.mockImplementation(() => ({
        from: () => ({ where: () => Promise.resolve([nonOverlapping]) }),
      }));
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const result = await service.updateClass(
        classId,
        updateDto as any,
        userId,
      );
      expect(result.time).toBe('16:00');
    });
  });

  describe('getClassStats', () => {
    it('deve retornar estatísticas das aulas', async () => {
      // Arrange
      const userId = 'user-1';
      const mockStats = [
        { status: ClassStatus.SCHEDULED, duration: 60, count: 2 },
        { status: ClassStatus.ACTIVE, duration: 60, count: 1 },
        { status: ClassStatus.COMPLETED, duration: 60, count: 5 },
        { status: ClassStatus.COMPLETED, duration: 90, count: 3 },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockResolvedValue(mockStats),
          }),
        }),
      });

      // Act
      const result = await service.getClassStats(userId);

      // Assert
      expect(result).toEqual({
        total: 11,
        scheduled: 2,
        pendingConfirmation: 0,
        active: 1,
        completed: 8,
        cancelled: 0,
        noShowDispute: 0,
        custody: 0,
        totalDuration: 750, // (2*60) + (1*60) + (5*60) + (3*90)
        averageDuration: 68, // 750 / 11
      });
    });
  });
});
