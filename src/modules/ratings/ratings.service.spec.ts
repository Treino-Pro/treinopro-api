import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { RatingType, RatingStatus } from './dto/ratings.dto';

// Mock do banco de dados
const mockDb = {
  query: {
    classes: {
      findFirst: jest.fn(),
    },
    ratings: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    },
    users: {
      findFirst: jest.fn(),
    },
  },
  insert: jest.fn(),
  update: jest.fn(),
  select: jest.fn(),
};

describe('RatingsService', () => {
  let service: RatingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRating', () => {
    const mockClass = {
      id: 'class-1',
      status: 'completed',
      studentId: 'student-1',
      personalId: 'personal-1',
      student: { id: 'student-1', name: 'João', email: 'joao@email.com', role: 'student' },
      personal: { id: 'personal-1', name: 'Maria', email: 'maria@email.com', role: 'personal' },
    };

    const createRatingDto = {
      classId: 'class-1',
      type: RatingType.STUDENT_TO_PERSONAL,
      rating: 5,
      comment: 'Excelente aula!',
      punctuality: 5,
      communication: 4,
      knowledge: 5,
      motivation: 5,
      equipment: 4,
    };

    it('deve criar avaliação com sucesso', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.query.ratings.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: 'rating-1',
            classId: 'class-1',
            raterId: 'student-1',
            ratedId: 'personal-1',
            type: RatingType.STUDENT_TO_PERSONAL,
            rating: 5,
            comment: 'Excelente aula!',
            status: RatingStatus.COMPLETED,
            completedAt: new Date(),
            punctuality: 5,
            communication: 4,
            knowledge: 5,
            motivation: 5,
            equipment: 4,
            createdAt: new Date(),
            updatedAt: new Date(),
          }]),
        }),
      });

      // Act
      const result = await service.createRating(createRatingDto, 'student-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.rating).toBe(5);
      expect(result.type).toBe(RatingType.STUDENT_TO_PERSONAL);
      expect(mockDb.query.classes.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
        with: { student: true, personal: true },
      });
    });

    it('deve lançar erro quando aula não existe', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.createRating(createRatingDto, 'student-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando aula não está concluída', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue({
        ...mockClass,
        status: 'scheduled',
      });

      // Act & Assert
      await expect(service.createRating(createRatingDto, 'student-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('deve lançar erro quando usuário não é o aluno', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);

      // Act & Assert
      await expect(service.createRating(createRatingDto, 'personal-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve lançar erro quando avaliação já existe', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.query.ratings.findFirst.mockResolvedValue({
        id: 'existing-rating',
        type: RatingType.STUDENT_TO_PERSONAL,
      });

      // Act & Assert
      await expect(service.createRating(createRatingDto, 'student-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('updateRating', () => {
    const existingRating = {
      id: 'rating-1',
      raterId: 'student-1',
      status: RatingStatus.PENDING,
      rating: 0,
    };

    const updateRatingDto = {
      rating: 4,
      comment: 'Boa aula!',
    };

    it('deve atualizar avaliação com sucesso', async () => {
      // Arrange
      mockDb.query.ratings.findFirst.mockResolvedValue(existingRating);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              ...existingRating,
              ...updateRatingDto,
              status: RatingStatus.COMPLETED,
              completedAt: new Date(),
              updatedAt: new Date(),
            }]),
          }),
        }),
      });

      // Act
      const result = await service.updateRating('rating-1', updateRatingDto, 'student-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.rating).toBe(4);
      expect(mockDb.query.ratings.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });

    it('deve lançar erro quando avaliação não existe', async () => {
      // Arrange
      mockDb.query.ratings.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateRating('rating-1', updateRatingDto, 'student-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando avaliação já está concluída', async () => {
      // Arrange
      mockDb.query.ratings.findFirst.mockResolvedValue({
        ...existingRating,
        status: RatingStatus.COMPLETED,
      });

      // Act & Assert
      await expect(service.updateRating('rating-1', updateRatingDto, 'student-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getRatingById', () => {
    it('deve retornar avaliação por ID', async () => {
      // Arrange
      const mockRating = {
        id: 'rating-1',
        raterId: 'student-1',
        rated: { id: 'personal-1', name: 'Maria', email: 'maria@email.com', role: 'personal' },
        class: { id: 'class-1', date: new Date(), time: '10:00', location: 'Academia', duration: 60 },
        rating: 5,
        type: RatingType.STUDENT_TO_PERSONAL,
        status: RatingStatus.COMPLETED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.query.ratings.findFirst.mockResolvedValue(mockRating);

      // Act
      const result = await service.getRatingById('rating-1', 'student-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('rating-1');
      expect(result.rating).toBe(5);
    });

    it('deve lançar erro quando avaliação não existe', async () => {
      // Arrange
      mockDb.query.ratings.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getRatingById('rating-1', 'student-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getRatings', () => {
    it('deve retornar lista de avaliações com filtros', async () => {
      // Arrange
      const mockRatings = [
        {
          id: 'rating-1',
          raterId: 'student-1',
          type: RatingType.STUDENT_TO_PERSONAL,
          rating: 5,
          status: RatingStatus.COMPLETED,
          rated: { id: 'personal-1', name: 'Maria', email: 'maria@email.com', role: 'personal' },
          class: { id: 'class-1', date: new Date(), time: '10:00', location: 'Academia', duration: 60 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.query.ratings.findMany.mockResolvedValue(mockRatings);

      // Act
      const result = await service.getRatings({ type: RatingType.STUDENT_TO_PERSONAL }, 'student-1');

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(RatingType.STUDENT_TO_PERSONAL);
    });
  });

  describe('getRatingStats', () => {
    it('deve retornar estatísticas de avaliações', async () => {
      // Arrange
      // Mock para total count
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      // Mock para avg
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ avg: 4.5 }]),
        }),
      });

      // Mock para completed count
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 4 }]),
        }),
      });

      // Mock para pending count
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Mock para cancelled count
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // Mock para allRatings (distribuição)
      mockDb.query.ratings.findMany.mockResolvedValueOnce([
        { rating: 5 },
        { rating: 4 },
        { rating: 5 },
        { rating: 3 },
        { rating: 5 },
      ]);

      // Mock para personal stats
      mockDb.query.ratings.findMany.mockResolvedValueOnce([
        { rating: 5, punctuality: 5, communication: 4, knowledge: 5, motivation: 5, equipment: 4 },
        { rating: 4, punctuality: 4, communication: 4, knowledge: 4, motivation: 4, equipment: 4 },
      ]);

      // Mock para student stats
      mockDb.query.ratings.findMany.mockResolvedValueOnce([
        { rating: 4, studentEngagement: 4, studentEffort: 4, studentProgress: 4 },
        { rating: 5, studentEngagement: 5, studentEffort: 5, studentProgress: 5 },
      ]);

      // Act
      const result = await service.getRatingStats('student-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.totalRatings).toBe(5);
      expect(result.averageRating).toBe(4.5);
    });
  });

  describe('createAutomaticRatings', () => {
    it('deve criar avaliações automáticas após aula concluída', async () => {
      // Arrange
      const mockClass = {
        id: 'class-1',
        status: 'completed',
        studentId: 'student-1',
        personalId: 'personal-1',
        student: { id: 'student-1', name: 'João', email: 'joao@email.com', role: 'student' },
        personal: { id: 'personal-1', name: 'Maria', email: 'maria@email.com', role: 'personal' },
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      });

      // Act
      await service.createAutomaticRatings({ classId: 'class-1' });

      // Assert
      expect(mockDb.insert).toHaveBeenCalledTimes(2); // Duas avaliações criadas
    });

    it('deve lançar erro quando aula não existe', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.createAutomaticRatings({ classId: 'class-1' }))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando aula não está concluída', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue({
        id: 'class-1',
        status: 'scheduled',
      });

      // Act & Assert
      await expect(service.createAutomaticRatings({ classId: 'class-1' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelRating', () => {
    it('deve cancelar avaliação pendente', async () => {
      // Arrange
      const existingRating = {
        id: 'rating-1',
        raterId: 'student-1',
        status: RatingStatus.PENDING,
      };

      mockDb.query.ratings.findFirst.mockResolvedValue(existingRating);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              ...existingRating,
              status: RatingStatus.CANCELLED,
              updatedAt: new Date(),
            }]),
          }),
        }),
      });

      // Act
      const result = await service.cancelRating('rating-1', 'student-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe(RatingStatus.CANCELLED);
    });

    it('deve lançar erro quando avaliação não existe', async () => {
      // Arrange
      mockDb.query.ratings.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.cancelRating('rating-1', 'student-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando avaliação já está concluída', async () => {
      // Arrange
      mockDb.query.ratings.findFirst.mockResolvedValue({
        id: 'rating-1',
        raterId: 'student-1',
        status: RatingStatus.COMPLETED,
      });

      // Act & Assert
      await expect(service.cancelRating('rating-1', 'student-1'))
        .rejects.toThrow(BadRequestException);
    });
  });
});
