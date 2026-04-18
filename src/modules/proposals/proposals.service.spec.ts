import { Test, TestingModule } from '@nestjs/testing';
import { ProposalsService } from './proposals.service';
import { BadRequestException } from '@nestjs/common';
import { proposals, classes, users } from '../../database/schema';
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
import { PaymentsService } from '../payments/payments.service';
import { JobsService } from '../jobs/jobs.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ProposalsGateway } from './proposals.gateway';
import { NonceService } from '../notifications/services/nonce.service';
import { ModuleRef } from '@nestjs/core';

// Mock do banco de dados
const mockDb: any = {
  query: {
    proposals: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    payments: {
      findFirst: jest.fn(),
    },
    classes: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
  insert: jest.fn(),
  update: jest.fn(),
  select: jest.fn(),
};

// Mock do StudentPaymentMethodsService
const mockStudentPaymentService = {
  processClassPayment: jest.fn(),
  getStudentPaymentMethods: jest.fn(),
  updatePaymentMethods: jest.fn(),
  saveCard: jest.fn(),
  validateCard: jest.fn(),
  removeCard: jest.fn(),
};

// Mock do PaymentsService
const mockPaymentsService = {
  createPaymentPreference: jest.fn(),
  processWebhook: jest.fn(),
  getPayment: jest.fn(),
  refundPayment: jest.fn(),
  mercadoPagoService: {
    createPreference: jest.fn().mockResolvedValue({
      id: 'pref_123',
      initPoint: 'https://mp.com/init',
      sandboxInitPoint: 'https://mp.com/sandbox',
    }),
  },
};

// Mock do JobsService
const mockJobsService = {
  scheduleProposalExpiration: jest.fn(),
  scheduleNotification: jest.fn(),
  schedulePaymentTimeout: jest.fn(),
};

// Mocks dos serviços auxiliares necessários para compilar o módulo
const mockChatGateway = {
  server: {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    emit: jest.fn(),
  },
};
const mockProposalsGateway = {
  emitToUser: jest.fn(),
  notifyPersonal: jest.fn(),
  server: {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    emit: jest.fn(),
  },
};
const mockNonceService = {
  validateNonce: jest.fn().mockReturnValue(true),
  markNonceAsUsed: jest.fn(),
};
const mockModuleRef = { get: jest.fn() };

describe('ProposalsService', () => {
  let service: ProposalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalsService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        {
          provide: StudentPaymentMethodsService,
          useValue: mockStudentPaymentService,
        },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: JobsService, useValue: mockJobsService },
        { provide: ChatGateway, useValue: mockChatGateway },
        { provide: ProposalsGateway, useValue: mockProposalsGateway },
        { provide: NonceService, useValue: mockNonceService },
        { provide: ModuleRef, useValue: mockModuleRef },
      ],
    }).compile();

    service = module.get<ProposalsService>(ProposalsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // TODO: Adicionar mais testes unitários
  // - createProposal
  // - getProposals
  // - getProposalById
  // - updateProposal
  // - cancelProposal
  // - acceptProposal

  describe('acceptProposal - conflitos de horário', () => {
    /**
     * Helper: constrói um tx mock para o callback de this.db.transaction().
     * Permite customizar o resultado de cada tabela consultada via select().
     */
    const buildTx = (opts: {
      proposal: any;
      classesForConflict?: any[];
      classesForProposalId?: any[];
      student?: any;
    }) => {
      const classesForConflict = opts.classesForConflict ?? [];
      const classesForProposalId = opts.classesForProposalId ?? [];
      let classSelectCallCount = 0;

      return {
        select: jest.fn().mockImplementation(() => ({
          from: (table: any) => ({
            where: jest.fn().mockImplementation(() => {
              if (table === proposals) {
                // Thenable para: limit(1) → [proposal] | await-direto → []
                return {
                  then: (resolve: any) => resolve([]),
                  limit: () => Promise.resolve([opts.proposal]),
                };
              }
              if (table === classes) {
                classSelectCallCount += 1;
                // 1ª chamada = conflito pessoal, 2ª = aula existente para proposta
                const result =
                  classSelectCallCount === 1
                    ? classesForConflict
                    : classesForProposalId;
                return {
                  then: (resolve: any) => resolve(result),
                  limit: () => Promise.resolve(result),
                };
              }
              if (table === users) {
                return {
                  then: (resolve: any) =>
                    resolve([
                      opts.student ?? {
                        id: opts.proposal.studentId,
                        name: 'Aluno',
                      },
                    ]),
                  limit: () =>
                    Promise.resolve([
                      opts.student ?? {
                        id: opts.proposal.studentId,
                        name: 'Aluno',
                      },
                    ]),
                };
              }
              return {
                then: (r: any) => r([]),
                limit: () => Promise.resolve([]),
              };
            }),
          }),
        })),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest
                .fn()
                .mockResolvedValue([{ ...opts.proposal, status: 'matched' }]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'class-new' }]),
          }),
        }),
        query: {
          classes: { findMany: jest.fn().mockResolvedValue([]) },
          payments: { findFirst: jest.fn().mockResolvedValue(null) },
        },
      };
    };

    afterEach(() => {
      delete mockDb.transaction;
    });

    it('deve lançar BadRequestException quando houver conflito de horário com aulas existentes', async () => {
      const proposalId = 'proposal-1';
      const personalId = 'personal-1';
      // Data no futuro para que a aula existente não seja considerada "expirada"
      const trainingDate = new Date('2035-09-17T00:00:00Z');

      const pendingProposal = {
        id: proposalId,
        studentId: 'student-1',
        trainingDate,
        trainingTime: '10:00',
        durationMinutes: 60,
        locationName: 'Academia X',
        locationAddress: 'Rua Y',
        modalityName: 'Musculação',
        price: '100.00',
        additionalNotes: null,
        status: 'pending',
        paymentStatus: 'approved',
      };

      // Aula existente do personal das 09:30 às 10:30 (sobrepõe 10:00-11:00)
      const conflictingClass = {
        id: 'class-1',
        personalId,
        studentId: 'student-x',
        date: new Date(trainingDate),
        time: '09:30',
        duration: 60,
        status: 'scheduled',
      };

      mockDb.transaction = jest.fn().mockImplementation(async (cb: any) =>
        cb(
          buildTx({
            proposal: pendingProposal,
            classesForConflict: [conflictingClass],
          }),
        ),
      );

      await expect(
        service.acceptProposal(proposalId, personalId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deve aceitar proposta quando não houver conflito de horário', async () => {
      const proposalId = 'proposal-2';
      const personalId = 'personal-2';
      const trainingDate = new Date('2035-09-17T00:00:00Z');

      const pendingProposal = {
        id: proposalId,
        studentId: 'student-1',
        trainingDate,
        trainingTime: '12:00',
        durationMinutes: 60,
        locationName: 'Academia X',
        locationAddress: 'Rua Y',
        modalityName: 'Musculação',
        price: '100.00',
        additionalNotes: null,
        status: 'pending',
        paymentStatus: 'approved',
      };

      // Aula existente 10:00-11:00 → não conflita com 12:00-13:00
      const nonConflictingClass = {
        id: 'class-2',
        personalId,
        studentId: 'student-x',
        date: new Date(trainingDate),
        time: '10:00',
        duration: 60,
        status: 'scheduled',
      };

      mockDb.transaction = jest.fn().mockImplementation(async (cb: any) =>
        cb(
          buildTx({
            proposal: pendingProposal,
            classesForConflict: [nonConflictingClass],
          }),
        ),
      );

      const result = await service.acceptProposal(proposalId, personalId);
      expect(result.status).toBe('matched');
    });
  });

  // ===== BUG 1: guard de pagamento em acceptProposal =====

  describe('isPaymentConfirmedStatus', () => {
    it('retorna false para null', () => {
      expect((service as any).isPaymentConfirmedStatus(null)).toBe(false);
    });

    it('retorna false para undefined', () => {
      expect((service as any).isPaymentConfirmedStatus(undefined)).toBe(false);
    });

    it('retorna false para pending', () => {
      expect((service as any).isPaymentConfirmedStatus('pending')).toBe(false);
    });

    it('retorna true para authorized', () => {
      expect((service as any).isPaymentConfirmedStatus('authorized')).toBe(
        true,
      );
    });

    it('retorna true para approved', () => {
      expect((service as any).isPaymentConfirmedStatus('approved')).toBe(true);
    });

    it('retorna true para captured', () => {
      expect((service as any).isPaymentConfirmedStatus('captured')).toBe(true);
    });
  });

  describe('acceptProposal - guard de pagamento (Bug 1)', () => {
    const buildProposalTx = (overrides: Partial<any> = {}) => ({
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              {
                id: 'p-test',
                status: 'pending',
                paymentStatus: null,
                targetPersonalId: null,
                studentId: 'student-1',
                trainingDate: new Date('2025-09-17'),
                trainingTime: '10:00',
                durationMinutes: 60,
                locationName: 'Academia X',
                locationAddress: 'Rua Y',
                modalityName: 'Musculação',
                price: '100.00',
                additionalNotes: null,
                ...overrides,
              },
            ]),
          }),
        }),
      }),
    });

    afterEach(() => {
      delete mockDb.transaction;
    });

    it('deve lançar BadRequestException quando paymentStatus é null (não pago)', async () => {
      mockDb.transaction = jest
        .fn()
        .mockImplementation(async (cb: any) =>
          cb(buildProposalTx({ paymentStatus: null })),
        );

      await expect(
        service.acceptProposal('p-test', 'personal-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve incluir mensagem informando que pagamento não foi confirmado', async () => {
      mockDb.transaction = jest
        .fn()
        .mockImplementation(async (cb: any) =>
          cb(buildProposalTx({ paymentStatus: null })),
        );

      await expect(
        service.acceptProposal('p-test', 'personal-1'),
      ).rejects.toThrow('O pagamento desta proposta ainda não foi confirmado.');
    });

    it('deve rejeitar mesmo em recontratação (targetPersonalId presente) com pagamento não confirmado', async () => {
      mockDb.transaction = jest.fn().mockImplementation(async (cb: any) =>
        cb(
          buildProposalTx({
            paymentStatus: 'pending',
            targetPersonalId: 'personal-1',
          }),
        ),
      );

      await expect(
        service.acceptProposal('p-test', 'personal-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===== BUG 2: PIX deve inserir registro na tabela payments =====

  describe('createProposalPaymentPreference - PIX (Bug 2)', () => {
    const pixDto: any = {
      price: 150,
      paymentMethod: 'pix',
      payerEmail: 'aluno@test.com',
      payerCpf: undefined,
      cardId: undefined,
    };
    const userData = { id: 'student-pix', email: 'aluno@test.com' };
    const trainingDate = new Date('2025-10-15');
    const proposalId = 'proposal-pix-001';

    beforeEach(() => {
      (mockPaymentsService as any).createPixPayment = jest
        .fn()
        .mockResolvedValue({
          paymentId: 'mp-pix-123',
          status: 'pending',
          qrCode: 'qr-code-data',
          qrCodeBase64: 'base64-data',
          ticketUrl: 'https://ticket.pix',
          expiresAt: null,
        });
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue([{ id: 'pay-inserted' }]),
      });
    });

    it('deve chamar db.insert após criar QR Code PIX', async () => {
      await (service as any).createProposalPaymentPreference(
        pixDto,
        userData,
        trainingDate,
        proposalId,
      );

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('deve inserir proposalId, studentId e mpPaymentId corretos', async () => {
      const mockValues = jest.fn().mockResolvedValue([]);
      mockDb.insert.mockReturnValue({ values: mockValues });

      await (service as any).createProposalPaymentPreference(
        pixDto,
        userData,
        trainingDate,
        proposalId,
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId,
          studentId: userData.id,
          mpPaymentId: 'mp-pix-123',
          type: 'class_payment',
        }),
      );
    });

    it('deve inserir status pending quando PIX não está aprovado', async () => {
      const mockValues = jest.fn().mockResolvedValue([]);
      mockDb.insert.mockReturnValue({ values: mockValues });

      await (service as any).createProposalPaymentPreference(
        pixDto,
        userData,
        trainingDate,
        proposalId,
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('deve inserir status authorized quando PIX é aprovado imediatamente (modo teste)', async () => {
      (mockPaymentsService as any).createPixPayment = jest
        .fn()
        .mockResolvedValue({
          paymentId: 'mp-pix-456',
          status: 'approved',
          qrCode: 'qr',
          qrCodeBase64: 'b64',
          ticketUrl: null,
          expiresAt: null,
        });
      const mockValues = jest.fn().mockResolvedValue([]);
      mockDb.insert.mockReturnValue({ values: mockValues });

      await (service as any).createProposalPaymentPreference(
        pixDto,
        userData,
        trainingDate,
        proposalId,
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'authorized' }),
      );
    });

    it('deve retornar dados do PIX com método e paymentId', async () => {
      const result = await (service as any).createProposalPaymentPreference(
        pixDto,
        userData,
        trainingDate,
        proposalId,
      );

      expect(result.method).toBe('pix');
      expect(result.paymentId).toBe('mp-pix-123');
      expect(result.qrCode).toBe('qr-code-data');
    });
  });
});
