import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto, ClassStatus, StartClassDto, CompleteClassDto } from './dto/classes.dto';

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
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockClass]),
        }),
      });

      // Act
      const result = await service.createClass(createClassDto, userId);

      // Assert
      expect(result).toEqual(expect.objectContaining({
        id: 'class-1',
        proposalId: 'proposal-1',
        studentId: 'student-1',
        personalId: 'personal-1',
        location: 'Academia Central',
        status: ClassStatus.SCHEDULED,
      }));
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
      await expect(service.createClass(createClassDto, userId))
        .rejects.toThrow(NotFoundException);
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
      await expect(service.createClass(createClassDto, userId))
        .rejects.toThrow(ForbiddenException);
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
      await expect(service.createClass(createClassDto, userId))
        .rejects.toThrow(BadRequestException);
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

      const now = new Date();
      const classTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutos no futuro
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
        status: ClassStatus.ACTIVE,
        startedAt: new Date(),
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
      expect(result.status).toBe(ClassStatus.ACTIVE);
      expect(result.startedAt).toBeDefined();
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
      await expect(service.startClass(classId, startClassDto, userId))
        .rejects.toThrow(ForbiddenException);
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
      await expect(service.startClass(classId, startClassDto, userId))
        .rejects.toThrow(BadRequestException);
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
        startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutos atrás
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
      const result = await service.completeClass(classId, completeClassDto, userId);

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
      await expect(service.completeClass(classId, completeClassDto, userId))
        .rejects.toThrow(BadRequestException);
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
