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
  ConfirmClassStartDto,
} from './dto/classes.dto';
import { GamificationService } from '../gamification/gamification.service';
import { ChatGateway } from '../chat/chat.gateway';
import { PaymentsService } from '../payments/payments.service';
import { RatingsService } from '../ratings/ratings.service';
import { FirebaseNotificationService } from '../notifications/services/firebase-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as crypto from 'crypto';

// Helper para criar um mock de query chain do Drizzle
const createMockQueryChain = (data: any = []) => {
  const chain: any = Promise.resolve(data);
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.groupBy = jest.fn(() => Promise.resolve(data));
  chain.orderBy = jest.fn(() => chain);
  return chain;
};

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
    users: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'u',
        name: 'Test',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@test.com',
        profileImageUrl: null,
      }),
    },
    ratings: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    classPresenceSnapshots: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payments: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
  insert: jest.fn(),
  update: jest.fn(),
  select: jest.fn(() => createMockQueryChain([])),
};

// Mocks dos providers
const mockGamificationService = {
  processClassCompletion: jest.fn(),
  addXP: jest.fn(),
  updateMissionProgress: jest.fn(),
  updateAchievementProgress: jest.fn(),
};

const mockEmit = jest.fn();
const mockChatGateway = {
  server: {
    emit: mockEmit,
    to: jest.fn().mockReturnValue({ emit: mockEmit }),
  },
};

const mockPaymentsService = {
  cancelPaymentBeforeClass: jest.fn(),
  capturePaymentAfterClass: jest.fn(),
  refundPayment: jest.fn(),
};

const mockRatingsService = { getRatingForClass: jest.fn() };

const mockFirebaseService = {
  sendToUser: jest.fn().mockResolvedValue(undefined),
};

const mockNotificationsService = { create: jest.fn() };

describe('ClassesService', () => {
  let service: ClassesService;

  beforeAll(() => {
    process.env.FEATURE_CODE_4_DIGITS = 'true';
    process.env.FEATURE_45_MIN_RULE = 'true';
    process.env.FEATURE_DISPUTE_DEFENSE = 'true';
  });

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
        {
          provide: ChatGateway,
          useValue: mockChatGateway,
        },
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: RatingsService,
          useValue: mockRatingsService,
        },
        {
          provide: FirebaseNotificationService,
          useValue: mockFirebaseService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restaurar defaults dos query mocks após cada teste
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'u',
      name: 'Test',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@test.com',
      profileImageUrl: null,
    });
    mockDb.query.ratings.findFirst.mockResolvedValue(null);
    mockDb.query.classPresenceSnapshots.findFirst.mockResolvedValue(null);
    mockDb.query.payments.findFirst.mockResolvedValue(null);
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
      mockDb.select.mockImplementation(() => createMockQueryChain([]));
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
      mockDb.select.mockImplementation(() =>
        createMockQueryChain([existingClass]),
      );

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

    it('deve sempre gerar código de 4 dígitos ao iniciar aula', async () => {
      const classId = 'class-1';
      const userId = 'personal-1';
      const startClassDto: StartClassDto = {};

      const now = new Date();
      const classTime = new Date(now.getTime() + 30 * 60 * 1000);
      const mockClass = {
        id: classId,
        personalId: userId,
        status: ClassStatus.SCHEDULED,
        date: classTime,
        time: classTime.toTimeString().slice(0, 5),
        startedAt: null,
      };

      const updatedClass = {
        ...mockClass,
        status: ClassStatus.PENDING_CONFIRMATION,
        pendingConfirmationAt: new Date(),
        startConfirmationCodeHash: 'some-hash',
        startConfirmationCodeExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        startConfirmationAttempts: 0,
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      const result = await service.startClass(classId, startClassDto, userId);

      // O código plaintext deve ser retornado na resposta
      expect((result as any).startConfirmationCode).toBeDefined();
      expect((result as any).startConfirmationCode).toMatch(/^\d{4}$/);
      expect((result as any).startConfirmationCodeExpiresAt).toBeDefined();
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

    it('deve bloquear finalização se minimumCompletionAt ainda está no futuro (regra 45min)', async () => {
      const classId = 'class-1';
      const userId = 'personal-1';

      const startedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min atrás
      const minimumCompletionAt = new Date(Date.now() + 40 * 60 * 1000); // 40 min no futuro

      const mockClass = {
        id: classId,
        personalId: userId,
        status: ClassStatus.ACTIVE,
        startedAt,
        minimumCompletionAt,
      };

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(mockClass) // primeira chamada (findFirst na classe)
        .mockResolvedValueOnce({ minimumCompletionAt }); // segunda chamada (minimumCompletionAt)

      await expect(service.completeClass(classId, {}, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve aceitar finalização se minimumCompletionAt já passou (>= 45min)', async () => {
      const classId = 'class-1';
      const userId = 'personal-1';

      const startedAt = new Date(Date.now() - 50 * 60 * 1000); // 50 min atrás
      const minimumCompletionAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min atrás

      const mockClass = {
        id: classId,
        personalId: userId,
        status: ClassStatus.ACTIVE,
        startedAt,
        minimumCompletionAt,
      };

      const updatedClass = {
        ...mockClass,
        status: ClassStatus.COMPLETED,
        completedAt: new Date(),
      };

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(mockClass) // classe
        .mockResolvedValueOnce({ minimumCompletionAt }); // minimumCompletionAt

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      const result = await service.completeClass(classId, {}, userId);
      expect(result.status).toBe(ClassStatus.COMPLETED);
    });
  });

  describe('confirmClassStart', () => {
    const classId = 'class-1';
    const studentId = 'student-1';

    const buildMockClass = (overrides: Partial<any> = {}) => ({
      id: classId,
      personalId: 'personal-1',
      studentId,
      status: ClassStatus.PENDING_CONFIRMATION,
      startConfirmationCodeHash: null,
      startConfirmationCodeExpiresAt: null,
      startConfirmationAttempts: 0,
      ...overrides,
    });

    it('aceita código válido e transita para ACTIVE', async () => {
      const plainCode = '1234';
      const codeHash = crypto
        .createHash('sha256')
        .update(plainCode)
        .digest('hex');
      const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const rawClass = buildMockClass({
        startConfirmationCodeHash: codeHash,
        startConfirmationCodeExpiresAt: codeExpiresAt,
        startConfirmationAttempts: 0,
      });

      const updatedClass = {
        ...rawClass,
        status: ClassStatus.ACTIVE,
        startedAt: new Date(),
      };

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(rawClass) // rawClass
        .mockResolvedValueOnce(rawClass); // getClassById internamente

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      const result = await service.confirmClassStart(
        classId,
        { confirmationCode: plainCode } as ConfirmClassStartDto,
        studentId,
      );

      expect(result.status).toBe(ClassStatus.ACTIVE);
    });

    it('rejeita código inválido → BadRequestException INVALID_CONFIRMATION_CODE', async () => {
      const validCode = '5678';
      const codeHash = crypto
        .createHash('sha256')
        .update(validCode)
        .digest('hex');
      const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const rawClass = buildMockClass({
        startConfirmationCodeHash: codeHash,
        startConfirmationCodeExpiresAt: codeExpiresAt,
        startConfirmationAttempts: 0,
      });

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(rawClass)
        .mockResolvedValueOnce(rawClass);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([rawClass]),
          }),
        }),
      });

      await expect(
        service.confirmClassStart(
          classId,
          { confirmationCode: '0000' } as ConfirmClassStartDto,
          studentId,
        ),
      ).rejects.toThrow(/INVALID_CONFIRMATION_CODE/);
    });

    it('reverte para SCHEDULED se pending_confirmation sem hash (fallback)', async () => {
      const rawClass = buildMockClass({
        startConfirmationCodeHash: null, // sem hash — estado inconsistente
        startConfirmationCodeExpiresAt: null,
        startConfirmationAttempts: 0,
      });

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(rawClass)
        .mockResolvedValueOnce(rawClass);

      const mockSet = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([rawClass]),
        }),
      });
      mockDb.update.mockReturnValue({ set: mockSet });

      await expect(
        service.confirmClassStart(
          classId,
          { confirmationCode: '1234' } as ConfirmClassStartDto,
          studentId,
        ),
      ).rejects.toThrow(/CODE_MISSING/);

      // Verificar que o rollback persistiu os campos corretos
      const rollbackCall = mockSet.mock.calls.find(
        (call: any[]) => call[0]?.status === 'scheduled',
      );
      expect(rollbackCall).toBeDefined();
      expect(rollbackCall[0]).toEqual(
        expect.objectContaining({
          status: 'scheduled',
          pendingConfirmationAt: null,
          startConfirmationCodeHash: null,
          startConfirmationCodeExpiresAt: null,
          startConfirmationAttempts: 0,
        }),
      );
    });

    it('rejeita código expirado → BadRequestException CONFIRMATION_CODE_EXPIRED', async () => {
      const plainCode = '9999';
      const codeHash = crypto
        .createHash('sha256')
        .update(plainCode)
        .digest('hex');
      const expiredAt = new Date(Date.now() - 60 * 1000); // já expirou

      const rawClass = buildMockClass({
        startConfirmationCodeHash: codeHash,
        startConfirmationCodeExpiresAt: expiredAt,
        startConfirmationAttempts: 0,
      });

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(rawClass)
        .mockResolvedValueOnce(rawClass);

      await expect(
        service.confirmClassStart(
          classId,
          { confirmationCode: plainCode } as ConfirmClassStartDto,
          studentId,
        ),
      ).rejects.toThrow(/CONFIRMATION_CODE_EXPIRED/);
    });

    it('permite confirmação sem código quando KILL_CODE_4_DIGITS está ativo e hash é null', async () => {
      // Ativar kill switch
      process.env.KILL_CODE_4_DIGITS = 'true';

      const rawClass = buildMockClass({
        startConfirmationCodeHash: null,
        startConfirmationCodeExpiresAt: null,
        startConfirmationAttempts: 0,
        duration: 60,
      });

      const updatedClass = {
        ...rawClass,
        status: ClassStatus.ACTIVE,
        startedAt: new Date(),
      };

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(rawClass)
        .mockResolvedValueOnce(rawClass);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      const result = await service.confirmClassStart(
        classId,
        { confirmationCode: '' } as ConfirmClassStartDto,
        studentId,
      );

      expect(result.status).toBe(ClassStatus.ACTIVE);

      // Limpar kill switch
      delete process.env.KILL_CODE_4_DIGITS;
    });
  });

  describe('cancelClass', () => {
    const classId = 'class-1';
    const studentId = 'student-1';
    const personalId = 'personal-1';

    const buildScheduledClass = (overrides: Partial<any> = {}) => ({
      id: classId,
      personalId,
      studentId,
      status: ClassStatus.SCHEDULED,
      proposalId: 'proposal-1',
      date: new Date(),
      time: '23:59',
      ...overrides,
    });

    it('aluno dentro da janela 2h cancela com sucesso e aciona reembolso', async () => {
      const mockClass = buildScheduledClass({ date: new Date('2035-12-31') });
      const cancelledClass = { ...mockClass, status: ClassStatus.CANCELLED };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([cancelledClass]),
          }),
        }),
      });
      mockPaymentsService.cancelPaymentBeforeClass.mockResolvedValue(undefined);

      const result = await service.cancelClass(classId, studentId);

      expect(result.status).toBe(ClassStatus.CANCELLED);
      expect(mockPaymentsService.cancelPaymentBeforeClass).toHaveBeenCalledWith(
        classId,
        'Cancelamento pelo aluno com antecedência mínima',
        'proposal-1',
      );
    });

    it('aluno fora da janela 2h → BadRequestException', async () => {
      const mockClass = buildScheduledClass({ date: new Date('2024-01-01') });
      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      await expect(service.cancelClass(classId, studentId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('personal pode cancelar a qualquer momento e aciona reembolso para o aluno', async () => {
      const mockClass = buildScheduledClass();
      const cancelledClass = { ...mockClass, status: ClassStatus.CANCELLED };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([cancelledClass]),
          }),
        }),
      });
      mockPaymentsService.cancelPaymentBeforeClass.mockResolvedValue(undefined);

      const result = await service.cancelClass(classId, personalId);

      expect(result.status).toBe(ClassStatus.CANCELLED);
      expect(mockPaymentsService.cancelPaymentBeforeClass).toHaveBeenCalledWith(
        classId,
        'Cancelamento pelo personal trainer',
        'proposal-1',
      );
    });

    it('deve lançar erro e não cancelar a aula se o reembolso falhar', async () => {
      const mockClass = buildScheduledClass({ date: new Date('2035-12-31') });
      const refundError = new Error('Falha no gateway de pagamento');

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockPaymentsService.cancelPaymentBeforeClass.mockRejectedValue(
        refundError,
      );

      await expect(service.cancelClass(classId, studentId)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('deve abortar cancelamento se pagamento não for encontrado e proposta for paga (valor > 0)', async () => {
      const mockClass = buildScheduledClass({
        date: new Date('2035-12-31'),
        proposal: { value: 100 },
      });

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockPaymentsService.cancelPaymentBeforeClass.mockRejectedValue(
        new NotFoundException('Payment not found'),
      );

      await expect(service.cancelClass(classId, studentId)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('deve prosseguir com cancelamento se pagamento não for encontrado e proposta for gratuita (valor == 0)', async () => {
      const mockClass = buildScheduledClass({
        date: new Date('2035-12-31'),
        proposal: { value: 0 },
      });
      const cancelledClass = { ...mockClass, status: ClassStatus.CANCELLED };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([cancelledClass]),
          }),
        }),
      });
      mockPaymentsService.cancelPaymentBeforeClass.mockRejectedValue(
        new NotFoundException('Payment not found'),
      );

      const result = await service.cancelClass(classId, studentId);

      expect(result.status).toBe(ClassStatus.CANCELLED);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('submitDisputeDefense', () => {
    const classId = 'class-1';
    const studentId = 'student-1';
    const personalId = 'personal-1';

    const buildDisputeClass = (overrides: Partial<any> = {}) => ({
      id: classId,
      personalId,
      studentId,
      status: ClassStatus.NO_SHOW_DISPUTE,
      noShowReportedBy: 'personal', // personal reportou → aluno é parte reportada
      evidenceDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      studentDefenseText: null,
      personalDefenseText: null,
      studentEvidence: null,
      personalEvidence: null,
      ...overrides,
    });

    it('parte reportada (aluno) envia defesa → sucesso', async () => {
      const rawClass = buildDisputeClass();
      const updatedClass = {
        ...rawClass,
        studentDefenseText: 'Estive presente',
      };

      mockDb.query.classes.findFirst.mockResolvedValue(rawClass);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      const result = await service.submitDisputeDefense(
        classId,
        { text: 'Estive presente' },
        studentId,
      );

      expect(result).toBeDefined();
    });

    it('parte que reportou (personal) tenta enviar defesa → ForbiddenException', async () => {
      const rawClass = buildDisputeClass({ noShowReportedBy: 'personal' });

      mockDb.query.classes.findFirst.mockResolvedValue(rawClass);

      // Personal reportou, então personal NÃO pode enviar defesa (só quem foi reportado)
      await expect(
        service.submitDisputeDefense(
          classId,
          { text: 'Defesa indevida' },
          personalId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('após evidenceDeadline → BadRequestException', async () => {
      const rawClass = buildDisputeClass({
        evidenceDeadline: new Date(Date.now() - 60 * 1000), // já expirou
      });

      mockDb.query.classes.findFirst.mockResolvedValue(rawClass);

      await expect(
        service.submitDisputeDefense(
          classId,
          { text: 'Tarde demais' },
          studentId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createPresenceSnapshot', () => {
    const classId = 'class-1';
    const userId = 'student-1';

    const baseSnapshot = {
      latitude: -23.5505,
      longitude: -46.6333,
      accuracyMeters: 10,
      capturedAt: new Date().toISOString(),
      captureSource: 'gps',
      appState: 'foreground',
    };

    it('primeira chamada cria snapshot com sucesso', async () => {
      const now = new Date();
      const rawClass = {
        id: classId,
        personalId: 'personal-1',
        studentId: userId,
        status: ClassStatus.ACTIVE,
        date: now,
        time: now.toTimeString().slice(0, 5),
      };

      const createdSnapshot = {
        id: 'snap-1',
        classId,
        userId,
        ...baseSnapshot,
      };

      mockDb.query.classes.findFirst.mockResolvedValue(rawClass);
      mockDb.query.classPresenceSnapshots.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([createdSnapshot]),
        }),
      });

      const result = await service.createPresenceSnapshot(
        classId,
        baseSnapshot as any,
        userId,
      );

      expect(result).toEqual(expect.objectContaining({ id: 'snap-1' }));
    });

    it('segunda chamada retorna existente (idempotência)', async () => {
      const now = new Date();
      const rawClass = {
        id: classId,
        personalId: 'personal-1',
        studentId: userId,
        status: ClassStatus.ACTIVE,
        date: now,
        time: now.toTimeString().slice(0, 5),
      };

      const existingSnapshot = { id: 'snap-existing', classId, userId };

      mockDb.query.classes.findFirst.mockResolvedValue(rawClass);
      mockDb.query.classPresenceSnapshots.findFirst.mockResolvedValue(
        existingSnapshot,
      );

      const result = await service.createPresenceSnapshot(
        classId,
        baseSnapshot as any,
        userId,
      );

      expect(result).toEqual(expect.objectContaining({ id: 'snap-existing' }));
      expect(mockDb.insert).not.toHaveBeenCalled();
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
      mockDb.select.mockImplementation(() =>
        createMockQueryChain([otherClass]),
      );

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

      mockDb.select.mockImplementation(() =>
        createMockQueryChain([nonOverlapping]),
      );
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

  // ===== BUG 4: janelas de tempo configuráveis via variáveis de ambiente =====

  describe('janelas de tempo configuráveis via env (Bug 4)', () => {
    afterEach(() => {
      delete process.env.CLASS_MIN_COMPLETION_MINUTES;
      delete process.env.CLASS_CANCELLATION_WINDOW_HOURS;
    });

    it('CLASS_MIN_COMPLETION_MINUTES=10 permite finalizar aula de 12 minutos', async () => {
      process.env.CLASS_MIN_COMPLETION_MINUTES = '10';

      const classId = 'class-env-1';
      const userId = 'personal-1';
      const startedAt = new Date(Date.now() - 12 * 60 * 1000); // 12 min atrás

      const mockClass = {
        id: classId,
        personalId: userId,
        status: ClassStatus.ACTIVE,
        startedAt,
      };
      const updatedClass = {
        ...mockClass,
        status: ClassStatus.COMPLETED,
        completedAt: new Date(),
      };

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(mockClass)
        .mockResolvedValueOnce({ minimumCompletionAt: null }); // forçar cálculo dinâmico

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedClass]),
          }),
        }),
      });

      // Com 10 min de mínimo e 12 min de aula → deve completar
      const result = await service.completeClass(classId, {}, userId);
      expect(result.status).toBe(ClassStatus.COMPLETED);
    });

    it('sem override (padrão 45min) bloqueia finalização de aula de 12 minutos', async () => {
      // Sem CLASS_MIN_COMPLETION_MINUTES → padrão 45 min
      const classId = 'class-env-2';
      const userId = 'personal-1';
      const startedAt = new Date(Date.now() - 12 * 60 * 1000); // 12 min atrás

      const mockClass = {
        id: classId,
        personalId: userId,
        status: ClassStatus.ACTIVE,
        startedAt,
      };

      mockDb.query.classes.findFirst
        .mockResolvedValueOnce(mockClass)
        .mockResolvedValueOnce({ minimumCompletionAt: null }); // calculado: startedAt + 45min → futuro

      await expect(service.completeClass(classId, {}, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('CLASS_CANCELLATION_WINDOW_HOURS altera o valor da hora na mensagem de erro', async () => {
      process.env.CLASS_CANCELLATION_WINDOW_HOURS = '3';

      // Aula no passado → cancellationDeadline já passou → sempre lança
      const mockClass = {
        id: 'class-cancel-env',
        personalId: 'personal-1',
        studentId: 'student-1',
        status: ClassStatus.SCHEDULED,
        proposalId: 'proposal-1',
        date: new Date('2020-01-01'),
        time: '10:00',
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);

      await expect(
        service.cancelClass('class-cancel-env', 'student-1'),
      ).rejects.toThrow(/3 hora\(s\)/);
    });

    it('janela padrão (2h) menciona "2 hora(s)" na mensagem de erro', async () => {
      // Sem override
      const mockClass = {
        id: 'class-default-window',
        personalId: 'personal-1',
        studentId: 'student-1',
        status: ClassStatus.SCHEDULED,
        proposalId: 'proposal-1',
        date: new Date('2020-01-01'),
        time: '10:00',
      };

      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);

      await expect(
        service.cancelClass('class-default-window', 'student-1'),
      ).rejects.toThrow(/2 hora\(s\)/);
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

      mockDb.select.mockReturnValue(createMockQueryChain(mockStats));

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
