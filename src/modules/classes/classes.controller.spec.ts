import { Test, TestingModule } from '@nestjs/testing';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import {
  CreateClassDto,
  UpdateClassDto,
  GetClassesDto,
  ClassStatus,
  StartClassDto,
  CompleteClassDto,
} from './dto/classes.dto';

describe('ClassesController', () => {
  let controller: ClassesController;
  let service: ClassesService;

  const mockUser = {
    sub: 'user-1',
    email: 'test@email.com',
    userType: 'student',
  };

  const mockClass = {
    id: 'class-1',
    proposalId: 'proposal-1',
    studentId: 'student-1',
    personalId: 'personal-1',
    location: 'Academia Central',
    date: new Date('2024-01-15'),
    time: '14:00',
    duration: 60,
    status: ClassStatus.SCHEDULED,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassesController],
      providers: [
        {
          provide: ClassesService,
          useValue: {
            createClass: jest.fn(),
            getClasses: jest.fn(),
            getClassById: jest.fn(),
            updateClass: jest.fn(),
            startClass: jest.fn(),
            completeClass: jest.fn(),
            cancelClass: jest.fn(),
            getClassStats: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClassesController>(ClassesController);
    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createClass', () => {
    it('deve criar uma aula', async () => {
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

      jest.spyOn(service, 'createClass').mockResolvedValue(mockClass);

      // Act
      const result = await controller.createClass(createClassDto, {
        user: mockUser,
      });

      // Assert
      expect(result).toBe(mockClass);
      expect(service.createClass).toHaveBeenCalledWith(
        createClassDto,
        mockUser.sub,
      );
    });
  });

  describe('getClasses', () => {
    it('deve listar aulas com filtros', async () => {
      // Arrange
      const getClassesDto: GetClassesDto = {
        status: ClassStatus.SCHEDULED,
        page: 1,
        limit: 10,
      };

      const mockResponse = {
        classes: [mockClass],
        total: 1,
        page: 1,
        limit: 10,
      };

      jest.spyOn(service, 'getClasses').mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getClasses(getClassesDto, {
        user: mockUser,
      });

      // Assert
      expect(result).toBe(mockResponse);
      expect(service.getClasses).toHaveBeenCalledWith(
        getClassesDto,
        mockUser.sub,
      );
    });
  });

  describe('getClassById', () => {
    it('deve retornar uma aula por ID', async () => {
      // Arrange
      const classId = 'class-1';
      jest.spyOn(service, 'getClassById').mockResolvedValue(mockClass);

      // Act
      const result = await controller.getClassById(classId, { user: mockUser });

      // Assert
      expect(result).toBe(mockClass);
      expect(service.getClassById).toHaveBeenCalledWith(classId, mockUser.sub);
    });
  });

  describe('updateClass', () => {
    it('deve atualizar uma aula', async () => {
      // Arrange
      const classId = 'class-1';
      const updateClassDto: UpdateClassDto = {
        location: 'Nova Academia',
        duration: 90,
      };

      const updatedClass = {
        ...mockClass,
        ...updateClassDto,
        date: new Date('2024-01-15'),
      };
      jest.spyOn(service, 'updateClass').mockResolvedValue(updatedClass);

      // Act
      const result = await controller.updateClass(classId, updateClassDto, {
        user: mockUser,
      });

      // Assert
      expect(result).toBe(updatedClass);
      expect(service.updateClass).toHaveBeenCalledWith(
        classId,
        updateClassDto,
        mockUser.sub,
      );
    });
  });

  describe('startClass', () => {
    it('deve iniciar uma aula', async () => {
      // Arrange
      const classId = 'class-1';
      const startClassDto: StartClassDto = {
        notes: 'Aula iniciada',
      };

      const startedClass = {
        ...mockClass,
        status: ClassStatus.ACTIVE,
        startedAt: new Date(),
      };

      jest.spyOn(service, 'startClass').mockResolvedValue(startedClass);

      // Act
      const result = await controller.startClass(classId, startClassDto, {
        user: mockUser,
      });

      // Assert
      expect(result).toBe(startedClass);
      expect(service.startClass).toHaveBeenCalledWith(
        classId,
        startClassDto,
        mockUser.sub,
      );
    });
  });

  describe('completeClass', () => {
    it('deve finalizar uma aula', async () => {
      // Arrange
      const classId = 'class-1';
      const completeClassDto: CompleteClassDto = {
        notes: 'Aula finalizada',
        studentNotes: 'Excelente aula!',
      };

      const completedClass = {
        ...mockClass,
        status: ClassStatus.COMPLETED,
        completedAt: new Date(),
      };

      jest.spyOn(service, 'completeClass').mockResolvedValue(completedClass);

      // Act
      const result = await controller.completeClass(classId, completeClassDto, {
        user: mockUser,
      });

      // Assert
      expect(result).toBe(completedClass);
      expect(service.completeClass).toHaveBeenCalledWith(
        classId,
        completeClassDto,
        mockUser.sub,
      );
    });
  });

  describe('cancelClass', () => {
    it('deve cancelar uma aula', async () => {
      // Arrange
      const classId = 'class-1';
      const cancelledClass = {
        ...mockClass,
        status: ClassStatus.CANCELLED,
      };

      jest.spyOn(service, 'cancelClass').mockResolvedValue(cancelledClass);

      // Act
      const result = await controller.cancelClass(classId, { user: mockUser });

      // Assert
      expect(result).toBe(cancelledClass);
      expect(service.cancelClass).toHaveBeenCalledWith(classId, mockUser.sub);
    });
  });

  describe('getClassStats', () => {
    it('deve retornar estatísticas das aulas', async () => {
      // Arrange
      const mockStats = {
        total: 10,
        scheduled: 2,
        pendingConfirmation: 1,
        active: 1,
        completed: 6,
        cancelled: 1,
        noShowDispute: 0,
        custody: 0,
        totalDuration: 600,
        averageDuration: 60,
      };

      jest.spyOn(service, 'getClassStats').mockResolvedValue(mockStats);

      // Act
      const result = await controller.getClassStats({ user: mockUser });

      // Assert
      expect(result).toBe(mockStats);
      expect(service.getClassStats).toHaveBeenCalledWith(mockUser.sub);
    });
  });
});
