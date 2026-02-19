import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

// Mock do banco de dados
const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(),
    },
  },
  select: jest.fn(),
  update: jest.fn(),
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
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
        { status: 'rejected', notes: 'CREF não encontrado após contato com CONFEF.' },
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
});
