import { Test, TestingModule } from '@nestjs/testing';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { RatingType, RatingStatus } from './dto/ratings.dto';

describe('RatingsController', () => {
  let controller: RatingsController;
  let service: RatingsService;

  const mockRatingsService = {
    createRating: jest.fn(),
    updateRating: jest.fn(),
    getRatingById: jest.fn(),
    getRatings: jest.fn(),
    getReceivedRatings: jest.fn(),
    getRatingStats: jest.fn(),
    getRatingSummary: jest.fn(),
    cancelRating: jest.fn(),
    createAutomaticRatings: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RatingsController],
      providers: [
        {
          provide: RatingsService,
          useValue: mockRatingsService,
        },
      ],
    })
    .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<RatingsController>(RatingsController);
    service = module.get<RatingsService>(RatingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createRating', () => {
    it('deve criar avaliação com sucesso', async () => {
      // Arrange
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

      const mockRating = {
        id: 'rating-1',
        classId: 'class-1',
        raterId: 'student-1',
        ratedId: 'personal-1',
        type: RatingType.STUDENT_TO_PERSONAL,
        rating: 5,
        comment: 'Excelente aula!',
        status: RatingStatus.COMPLETED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.createRating.mockResolvedValue(mockRating);

      // Act
      const result = await controller.createRating(createRatingDto, mockRequest);

      // Assert
      expect(result).toEqual(mockRating);
      expect(service.createRating).toHaveBeenCalledWith(createRatingDto, 'student-1');
    });
  });

  describe('updateRating', () => {
    it('deve atualizar avaliação com sucesso', async () => {
      // Arrange
      const updateRatingDto = {
        rating: 4,
        comment: 'Boa aula!',
      };

      const mockRating = {
        id: 'rating-1',
        rating: 4,
        comment: 'Boa aula!',
        status: RatingStatus.COMPLETED,
        updatedAt: new Date(),
      };

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.updateRating.mockResolvedValue(mockRating);

      // Act
      const result = await controller.updateRating('rating-1', updateRatingDto, mockRequest);

      // Assert
      expect(result).toEqual(mockRating);
      expect(service.updateRating).toHaveBeenCalledWith('rating-1', updateRatingDto, 'student-1');
    });
  });

  describe('getRatingById', () => {
    it('deve retornar avaliação por ID', async () => {
      // Arrange
      const mockRating = {
        id: 'rating-1',
        rating: 5,
        type: RatingType.STUDENT_TO_PERSONAL,
        status: RatingStatus.COMPLETED,
      };

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.getRatingById.mockResolvedValue(mockRating);

      // Act
      const result = await controller.getRatingById('rating-1', mockRequest);

      // Assert
      expect(result).toEqual(mockRating);
      expect(service.getRatingById).toHaveBeenCalledWith('rating-1', 'student-1');
    });
  });

  describe('getRatings', () => {
    it('deve retornar lista de avaliações com filtros', async () => {
      // Arrange
      const filters = { type: RatingType.STUDENT_TO_PERSONAL };
      const mockRatings = [
        {
          id: 'rating-1',
          type: RatingType.STUDENT_TO_PERSONAL,
          rating: 5,
          status: RatingStatus.COMPLETED,
        },
        {
          id: 'rating-2',
          type: RatingType.STUDENT_TO_PERSONAL,
          rating: 4,
          status: RatingStatus.COMPLETED,
        },
      ];

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.getRatings.mockResolvedValue(mockRatings);

      // Act
      const result = await controller.getRatings(filters, mockRequest);

      // Assert
      expect(result).toEqual(mockRatings);
      expect(service.getRatings).toHaveBeenCalledWith(filters, 'student-1');
    });
  });

  describe('getReceivedRatings', () => {
    it('deve retornar avaliações recebidas', async () => {
      // Arrange
      const filters = { type: RatingType.STUDENT_TO_PERSONAL };
      const mockRatings = [
        {
          id: 'rating-1',
          type: RatingType.STUDENT_TO_PERSONAL,
          rating: 5,
          status: RatingStatus.COMPLETED,
        },
      ];

      const mockRequest = { user: { sub: 'personal-1' } };

      mockRatingsService.getReceivedRatings.mockResolvedValue(mockRatings);

      // Act
      const result = await controller.getReceivedRatings(filters, mockRequest);

      // Assert
      expect(result).toEqual(mockRatings);
      expect(service.getReceivedRatings).toHaveBeenCalledWith('personal-1', filters);
    });
  });

  describe('getMyRatingStats', () => {
    it('deve retornar estatísticas de avaliações do usuário', async () => {
      // Arrange
      const mockStats = {
        totalRatings: 10,
        averageRating: 4.5,
        ratingDistribution: { '1': 0, '2': 0, '3': 1, '4': 3, '5': 6 },
        completedRatings: 8,
        pendingRatings: 2,
        cancelledRatings: 0,
        studentToPersonal: {
          total: 5,
          average: 4.6,
          punctuality: 4.5,
          communication: 4.7,
          knowledge: 4.8,
          motivation: 4.4,
          equipment: 4.3,
        },
        personalToStudent: {
          total: 5,
          average: 4.4,
          engagement: 4.5,
          effort: 4.3,
          progress: 4.4,
        },
      };

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.getRatingStats.mockResolvedValue(mockStats);

      // Act
      const result = await controller.getMyRatingStats(mockRequest);

      // Assert
      expect(result).toEqual(mockStats);
      expect(service.getRatingStats).toHaveBeenCalledWith('student-1');
    });
  });

  describe('getRatingSummary', () => {
    it('deve retornar resumo de avaliações de um usuário', async () => {
      // Arrange
      const mockSummary = {
        userId: 'personal-1',
        userName: 'Maria',
        userRole: 'personal',
        totalRatings: 15,
        averageRating: 4.7,
        ratingBreakdown: {
          punctuality: 4.8,
          communication: 4.6,
          knowledge: 4.9,
          motivation: 4.5,
          equipment: 4.4,
        },
        recentRatings: [],
      };

      mockRatingsService.getRatingSummary.mockResolvedValue(mockSummary);

      // Act
      const result = await controller.getRatingSummary('personal-1');

      // Assert
      expect(result).toEqual(mockSummary);
      expect(service.getRatingSummary).toHaveBeenCalledWith('personal-1');
    });
  });

  describe('cancelRating', () => {
    it('deve cancelar avaliação com sucesso', async () => {
      // Arrange
      const mockRating = {
        id: 'rating-1',
        status: RatingStatus.CANCELLED,
        updatedAt: new Date(),
      };

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.cancelRating.mockResolvedValue(mockRating);

      // Act
      const result = await controller.cancelRating('rating-1', mockRequest);

      // Assert
      expect(result).toEqual(mockRating);
      expect(service.cancelRating).toHaveBeenCalledWith('rating-1', 'student-1');
    });
  });

  describe('createAutomaticRatings', () => {
    it('deve criar avaliações automáticas com sucesso', async () => {
      // Arrange
      const createDto = { classId: 'class-1' };

      mockRatingsService.createAutomaticRatings.mockResolvedValue(undefined);

      // Act
      const result = await controller.createAutomaticRatings(createDto);

      // Assert
      expect(result).toEqual({ message: 'Avaliações automáticas criadas com sucesso' });
      expect(service.createAutomaticRatings).toHaveBeenCalledWith(createDto);
    });
  });

  describe('getPendingRatings', () => {
    it('deve retornar avaliações pendentes', async () => {
      // Arrange
      const mockRatings = [
        {
          id: 'rating-1',
          status: RatingStatus.PENDING,
          type: RatingType.STUDENT_TO_PERSONAL,
        },
      ];

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.getRatings.mockResolvedValue(mockRatings);

      // Act
      const result = await controller.getPendingRatings(mockRequest);

      // Assert
      expect(result).toEqual(mockRatings);
      expect(service.getRatings).toHaveBeenCalledWith({ status: 'pending' }, 'student-1');
    });
  });

  describe('getCompletedRatings', () => {
    it('deve retornar avaliações concluídas', async () => {
      // Arrange
      const mockRatings = [
        {
          id: 'rating-1',
          status: RatingStatus.COMPLETED,
          type: RatingType.STUDENT_TO_PERSONAL,
        },
      ];

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.getRatings.mockResolvedValue(mockRatings);

      // Act
      const result = await controller.getCompletedRatings(mockRequest);

      // Assert
      expect(result).toEqual(mockRatings);
      expect(service.getRatings).toHaveBeenCalledWith({ status: 'completed' }, 'student-1');
    });
  });

  describe('getPersonalRatings', () => {
    it('deve retornar avaliações de personal trainers', async () => {
      // Arrange
      const mockRatings = [
        {
          id: 'rating-1',
          type: RatingType.STUDENT_TO_PERSONAL,
          rating: 5,
        },
      ];

      const mockRequest = { user: { sub: 'student-1' } };

      mockRatingsService.getRatings.mockResolvedValue(mockRatings);

      // Act
      const result = await controller.getPersonalRatings(mockRequest);

      // Assert
      expect(result).toEqual(mockRatings);
      expect(service.getRatings).toHaveBeenCalledWith({ type: 'student_to_personal' }, 'student-1');
    });
  });

  describe('getStudentRatings', () => {
    it('deve retornar avaliações de alunos', async () => {
      // Arrange
      const mockRatings = [
        {
          id: 'rating-1',
          type: RatingType.PERSONAL_TO_STUDENT,
          rating: 4,
        },
      ];

      const mockRequest = { user: { sub: 'personal-1' } };

      mockRatingsService.getRatings.mockResolvedValue(mockRatings);

      // Act
      const result = await controller.getStudentRatings(mockRequest);

      // Assert
      expect(result).toEqual(mockRatings);
      expect(service.getRatings).toHaveBeenCalledWith({ type: 'personal_to_student' }, 'personal-1');
    });
  });
});
