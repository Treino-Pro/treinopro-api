import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PaymentsService } from '../payments/payments.service';
import { FirebaseNotificationService } from '../notifications/services/firebase-notification.service';

// Mock do banco de dados
const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(),
    },
    payments: {
      findFirst: jest.fn(),
    },
  },
  select: jest.fn(),
  update: jest.fn(),
};

const mockPaymentsService = {
  cancelPaymentBeforeClass: jest.fn(),
  capturePaymentAfterClass: jest.fn(),
  refundPayment: jest.fn(),
};

const mockFirebaseNotificationService = {
  sendToUser: jest.fn().mockResolvedValue(undefined),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: FirebaseNotificationService,
          useValue: mockFirebaseNotificationService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb.query.payments.findFirst.mockResolvedValue(null);
  });

  // ===== listPendingPersonals =====

  describe('listPendingPersonals', () => {
    it('deve retornar lista paginada de personals com approval_status=pending_review', async () => {
      // Arrange
      const pendingList = [
        {
          id: 'uuid-1',
          email: 'personal1@test.com',
          firstName: 'João',
          lastName: 'Silva',
          cref: 'SP-111111',
          crefImageId: 'img-1',
          approvalStatus: 'pending_review',
          adminNotes: 'Aprovação manual necessária.',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'uuid-2',
          email: 'personal2@test.com',
          firstName: 'Maria',
          lastName: 'Santos',
          cref: 'RJ-222222',
          crefImageId: 'img-2',
          approvalStatus: 'pending_review',
          adminNotes: null,
          createdAt: new Date().toISOString(),
        },
      ];

      // Simular select encadeado que retorna [pendingList, totalResult]
      const mockSelectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(pendingList),
      };
      const mockCountChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ total: 2 }]),
      };

      mockDb.select
        .mockReturnValueOnce(mockSelectChain)
        .mockReturnValueOnce(mockCountChain);

      // Act
      const result = await service.listPendingPersonals({ page: 1, limit: 20 });

      // Assert
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.items[0].approvalStatus).toBe('pending_review');
    });

    it('deve retornar lista vazia quando não há pendências', async () => {
      // Arrange
      const mockSelectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };
      const mockCountChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ total: 0 }]),
      };

      mockDb.select
        .mockReturnValueOnce(mockSelectChain)
        .mockReturnValueOnce(mockCountChain);

      // Act
      const result = await service.listPendingPersonals();

      // Assert
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1); // pelo menos 1 página
    });

    it('deve aplicar paginação corretamente', async () => {
      // Arrange
      const mockSelectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };
      const mockCountChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ total: 45 }]),
      };

      mockDb.select
        .mockReturnValueOnce(mockSelectChain)
        .mockReturnValueOnce(mockCountChain);

      // Act
      const result = await service.listPendingPersonals({ page: 3, limit: 10 });

      // Assert
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(45);
      expect(result.totalPages).toBe(5); // Math.ceil(45/10)
    });
  });

  // ===== reviewPersonalApproval =====

  describe('reviewPersonalApproval', () => {
    const personalId = 'uuid-personal-1';
    const reviewerId = 'uuid-admin-1';

    it('deve aprovar personal e retornar registro atualizado', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue({
        id: personalId,
        approvalStatus: 'pending_review',
        email: 'personal@test.com',
      });

      const updatedPersonal = {
        id: personalId,
        email: 'personal@test.com',
        firstName: 'João',
        lastName: 'Silva',
        approvalStatus: 'approved',
        adminNotes: 'Verificado manualmente.',
        approvalReviewedAt: new Date(),
      };

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([updatedPersonal]),
      });

      // Act
      const result = await service.reviewPersonalApproval(
        personalId,
        { status: 'approved', notes: 'Verificado manualmente.' },
        reviewerId,
      );

      // Assert
      expect(result.approvalStatus).toBe('approved');
      expect(result.adminNotes).toBe('Verificado manualmente.');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('deve rejeitar personal e retornar registro atualizado', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue({
        id: personalId,
        approvalStatus: 'pending_review',
        email: 'personal@test.com',
      });

      const updatedPersonal = {
        id: personalId,
        email: 'personal@test.com',
        firstName: 'João',
        lastName: 'Silva',
        approvalStatus: 'rejected',
        adminNotes: 'CREF não encontrado após contato com CONFEF.',
        approvalReviewedAt: new Date(),
      };

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([updatedPersonal]),
      });

      // Act
      const result = await service.reviewPersonalApproval(
        personalId,
        {
          status: 'rejected',
          notes: 'CREF não encontrado após contato com CONFEF.',
        },
        reviewerId,
      );

      // Assert
      expect(result.approvalStatus).toBe('rejected');
      expect(result.adminNotes).toContain('CREF não encontrado');
    });

    it('deve lançar NotFoundException quando personal não existe', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.reviewPersonalApproval(
          'uuid-inexistente',
          { status: 'approved' },
          reviewerId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException quando usuário não é personal', async () => {
      // Arrange — findFirst retorna null porque where filtra por userType='personal'
      mockDb.query.users.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.reviewPersonalApproval(
          'uuid-student',
          { status: 'approved' },
          reviewerId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve gravar approvalReviewedBy com o ID do revisor', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue({
        id: personalId,
        approvalStatus: 'pending_review',
        email: 'personal@test.com',
      });

      const mockSet = jest.fn().mockReturnThis();
      const mockWhere = jest.fn().mockReturnThis();
      const mockReturning = jest.fn().mockResolvedValue([
        {
          id: personalId,
          email: 'personal@test.com',
          firstName: 'João',
          lastName: 'Silva',
          approvalStatus: 'approved',
          adminNotes: null,
          approvalReviewedAt: new Date(),
        },
      ]);

      mockDb.update.mockReturnValue({
        set: mockSet,
        where: mockWhere,
        returning: mockReturning,
      });

      // Act
      await service.reviewPersonalApproval(
        personalId,
        { status: 'approved' },
        reviewerId,
      );

      // Assert — verificar que set recebeu approvalReviewedBy
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ approvalReviewedBy: reviewerId }),
      );
    });
  });

  // ===== resolveClassDispute =====

  describe('resolveClassDispute', () => {
    const classId = 'class-dispute-1';

    const buildDisputeClass = (overrides: Partial<any> = {}) => ({
      id: classId,
      personalId: 'personal-1',
      studentId: 'student-1',
      status: 'no_show_dispute',
      ...overrides,
    });

    const mockSelectChainFor = (row: any) => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(row ? [row] : []),
    });

    it('resolved_for_personal → chama capturePaymentAfterClass e status completed', async () => {
      const classRow = buildDisputeClass();
      mockDb.select.mockReturnValue(mockSelectChainFor(classRow));

      mockPaymentsService.capturePaymentAfterClass.mockResolvedValue(undefined);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.resolveClassDispute(classId, {
        resolution: 'resolved_for_personal',
        adminNotes: 'Aluno faltou',
      });

      expect(mockPaymentsService.capturePaymentAfterClass).toHaveBeenCalledWith(
        classId,
        expect.any(String),
      );
      expect(result.status).toBe('completed');
      expect(result.disputeStatus).toBe('resolved_for_personal');
    });

    it('resolved_for_student → chama refundPayment + strike + notificação', async () => {
      const classRow = buildDisputeClass();
      mockDb.select.mockReturnValue(mockSelectChainFor(classRow));

      const payment = { id: 'payment-1', classId };
      mockDb.query.payments.findFirst.mockResolvedValue(payment);
      mockPaymentsService.refundPayment.mockResolvedValue(undefined);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.resolveClassDispute(classId, {
        resolution: 'resolved_for_student',
        adminNotes: 'Personal faltou',
      });

      expect(mockPaymentsService.refundPayment).toHaveBeenCalledWith(
        payment.id,
        expect.any(String),
      );
      expect(mockFirebaseNotificationService.sendToUser).toHaveBeenCalledWith(
        classRow.personalId,
        expect.objectContaining({ title: expect.any(String) }),
      );
      expect(result.status).toBe('cancelled');
      expect(result.disputeStatus).toBe('resolved_for_student');
    });

    it('aula não em disputa → BadRequestException', async () => {
      const classRow = buildDisputeClass({ status: 'completed' });
      mockDb.select.mockReturnValue(mockSelectChainFor(classRow));

      await expect(
        service.resolveClassDispute(classId, {
          resolution: 'resolved_for_personal',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('aula não encontrada → NotFoundException', async () => {
      mockDb.select.mockReturnValue(mockSelectChainFor(null));

      await expect(
        service.resolveClassDispute(classId, {
          resolution: 'resolved_for_personal',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
