import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MercadoPagoService } from './mercadopago.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentStatus, PaymentType, DisputeStatus } from './dto/payments.dto';
import { WITHDRAWAL_PAYOUT_PROVIDER } from './withdrawal-payout.provider';
import { StripeRefundsService } from './stripe-refunds.service';
import { StripeTransfersService } from './stripe-transfers.service';

// Mock do banco de dados
const mockDb = {
  query: {
    classes: {
      findFirst: jest.fn(),
    },
    payments: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    },
    financialProfiles: {
      findFirst: jest.fn(),
    },
    paymentDisputes: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    },
    paymentTransactions: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    },
    userWallets: {
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
  update: jest.fn(() => ({
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
  })),
  select: jest.fn(),
  transaction: jest.fn(async (callback: any) => callback(mockDb)),
};

// Mock do MercadoPagoService
const mockMercadoPagoService = {
  isConfigured: jest.fn().mockReturnValue(true),
  createPreference: jest.fn().mockResolvedValue({
    id: 'pref_123',
    initPoint: 'https://mp.com/init',
    sandboxInitPoint: 'https://mp.com/sandbox',
  }),
  getPayment: jest.fn().mockResolvedValue({
    id: 'mp_payment_123',
    status: 'approved',
    external_reference: 'payment-1',
  }),
  validateWebhook: jest.fn().mockReturnValue(true),
  mapPaymentStatus: jest.fn().mockReturnValue('captured'),
  capturePayment: jest.fn().mockResolvedValue({}),
  refundPayment: jest.fn().mockResolvedValue({}),
  cancelPayment: jest.fn().mockResolvedValue({}),
  sendMpTransfer: jest.fn(),
};

const mockWithdrawalPayoutProvider = {
  executePayout: jest.fn(),
};

const mockStripeRefundsService = {
  isConfigured: jest.fn().mockReturnValue(true),
  createRefund: jest.fn().mockResolvedValue({
    id: 're_123',
    amount: 10000,
    status: 'succeeded',
    payment_intent: 'pi_123',
    charge: 'ch_123',
  }),
};

const mockStripeTransfersService = {
  isConfigured: jest.fn().mockReturnValue(true),
  createTransferReversal: jest.fn().mockResolvedValue({
    id: 'trr_123',
    transfer: 'tr_123',
    balance_transaction: 'txn_123',
  }),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    mockDb.transaction.mockImplementation(async (callback: any) =>
      callback(mockDb),
    );
    mockDb.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        returning: jest.fn().mockResolvedValue([]),
      }),
    });
    mockDb.update.mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        { provide: MercadoPagoService, useValue: mockMercadoPagoService },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        {
          provide: WITHDRAWAL_PAYOUT_PROVIDER,
          useValue: mockWithdrawalPayoutProvider,
        },
        { provide: StripeRefundsService, useValue: mockStripeRefundsService },
        {
          provide: StripeTransfersService,
          useValue: mockStripeTransfersService,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPaymentPreference', () => {
    const mockClass = {
      id: 'class-1',
      studentId: 'student-1',
      personalId: 'personal-1',
      location: 'Academia XYZ',
      date: new Date('2024-12-01'),
      time: '10:00',
      student: { id: 'student-1', name: 'João', email: 'joao@email.com' },
      personal: { id: 'personal-1', name: 'Maria', email: 'maria@email.com' },
    };

    const createDto = {
      classId: 'class-1',
      totalAmount: 100,
      description: 'Aula de musculação',
    };

    it('deve criar preferência de pagamento com sucesso', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 'payment-1',
              classId: 'class-1',
              studentId: 'student-1',
              personalId: 'personal-1',
              totalAmount: '100.00',
              platformFee: '10.00',
              personalAmount: '90.00',
              status: PaymentStatus.PENDING,
              type: PaymentType.CLASS_PAYMENT,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });

      // Act
      const result = await service.createPaymentPreference(
        createDto,
        'student-1',
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.preferenceId).toBe('pref_123'); // Vem do mock do MercadoPago
      expect(result.paymentId).toBe('payment-1');
      expect(mockDb.query.classes.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
        with: { student: true, personal: true },
      });
    });

    it('deve lançar erro quando aula não existe', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createPaymentPreference(createDto, 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando usuário não é o aluno', async () => {
      // Arrange
      mockDb.query.classes.findFirst.mockResolvedValue(mockClass);

      // Act & Assert
      await expect(
        service.createPaymentPreference(createDto, 'personal-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('transferPixSplitToPersonal', () => {
    it('deve registrar o repasse externo como desativado e manter o saldo na carteira interna', async () => {
      mockDb.query.payments.findFirst.mockResolvedValueOnce({
        id: 'payment-1',
        splitData: {},
      });

      const setMock = jest.fn().mockReturnThis();
      const whereMock = jest.fn().mockReturnThis();
      const returningMock = jest.fn().mockResolvedValue([]);
      mockDb.update.mockReturnValueOnce({
        set: setMock,
        where: whereMock,
        returning: returningMock,
      });

      const result = await service.transferPixSplitToPersonal({
        personalId: 'personal-1',
        amount: 36,
        classId: 'class-1',
        proposalId: 'proposal-1',
      });

      expect(result).toEqual(
        expect.objectContaining({
          attempted: false,
          success: false,
          skipped: true,
          reason: 'disabled_invalid_mp_payout_flow',
          usedOAuthToken: false,
        }),
      );
      expect(mockMercadoPagoService.sendMpTransfer).not.toHaveBeenCalled();
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          splitData: expect.objectContaining({
            externalPayout: expect.objectContaining({
              success: false,
              skipped: true,
              reason: 'disabled_invalid_mp_payout_flow',
              usedOAuthToken: false,
            }),
          }),
        }),
      );
    });

    it('deve pular novo envio quando o repasse externo já foi concluído', async () => {
      mockDb.query.payments.findFirst.mockResolvedValueOnce({
        id: 'payment-1',
        splitData: {
          externalPayout: {
            success: true,
            transferId: 'tx-existing',
            usedOAuthToken: true,
          },
        },
      });

      const result = await service.transferPixSplitToPersonal({
        personalId: 'personal-1',
        amount: 36,
        classId: 'class-1',
        proposalId: 'proposal-1',
      });

      expect(result).toEqual(
        expect.objectContaining({
          attempted: false,
          success: true,
          skipped: true,
          reason: 'already_succeeded',
          transferId: 'tx-existing',
        }),
      );
      expect(mockMercadoPagoService.sendMpTransfer).not.toHaveBeenCalled();
    });
  });

  describe('processWebhook', () => {
    const webhookDto = {
      id: 'mp_payment_123',
      type: 'payment',
      action: 'payment.created',
      data: { id: 'mp_payment_123' },
    };

    it('deve processar webhook com sucesso', async () => {
      // Arrange
      const mockPayment = {
        id: 'payment-1',
        mpPaymentId: 'mp_payment_123',
        status: PaymentStatus.PENDING,
        personalId: 'personal-1',
        personalAmount: '90.00',
      };

      mockDb.query.payments.findFirst.mockResolvedValue(mockPayment);
      mockMercadoPagoService.mapPaymentStatus.mockReturnValueOnce(
        PaymentStatus.AUTHORIZED,
      );
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });

      // Mock para getUserWallet e updateWallet (usado em updateWallets)
      jest.spyOn(service, 'getUserWallet').mockResolvedValue({
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: 0,
        pendingBalance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jest.spyOn(service, 'updateWallet').mockResolvedValue({
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: 90,
        pendingBalance: 0,
        totalEarned: 90,
        totalWithdrawn: 0,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      await service.processWebhook(webhookDto);

      // Assert
      expect(mockMercadoPagoService.getPayment).toHaveBeenCalledWith(
        'mp_payment_123',
      );
    });

    it('deve lançar erro quando pagamento não existe', async () => {
      // Arrange
      mockDb.query.payments.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.processWebhook(webhookDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createDispute', () => {
    const mockPayment = {
      id: 'payment-1',
      studentId: 'student-1',
      personalId: 'personal-1',
      student: { id: 'student-1', name: 'João', email: 'joao@email.com' },
      personal: { id: 'personal-1', name: 'Maria', email: 'maria@email.com' },
    };

    const createDto = {
      paymentId: 'payment-1',
      reason: 'no_show',
      description: 'Aluno não compareceu',
    };

    it('deve criar disputa com sucesso', async () => {
      // Arrange
      mockDb.query.payments.findFirst.mockResolvedValue(mockPayment);
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(null);
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 'dispute-1',
              paymentId: 'payment-1',
              reportedBy: 'student-1',
              reason: 'no_show',
              description: 'Aluno não compareceu',
              status: DisputeStatus.PENDING,
              expiresAt: new Date(),
              studentDisputeCount: 0,
              personalDisputeCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });

      // Act
      const result = await service.createDispute(createDto, 'student-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('dispute-1');
      expect(result.reason).toBe('no_show');
      expect(mockDb.query.payments.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
        with: { student: true, personal: true },
      });
    });

    it('deve lançar erro quando pagamento não existe', async () => {
      // Arrange
      mockDb.query.payments.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createDispute(createDto, 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando usuário não autorizado', async () => {
      // Arrange
      mockDb.query.payments.findFirst.mockResolvedValue(mockPayment);

      // Act & Assert
      await expect(
        service.createDispute(createDto, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar erro quando disputa já existe', async () => {
      // Arrange
      mockDb.query.payments.findFirst.mockResolvedValue(mockPayment);
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue({
        id: 'existing-dispute',
        status: DisputeStatus.PENDING,
      });

      // Act & Assert
      await expect(
        service.createDispute(createDto, 'student-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitEvidence', () => {
    const mockDispute = {
      id: 'dispute-1',
      paymentId: 'payment-1',
      payment: {
        studentId: 'student-1',
        personalId: 'personal-1',
      },
      status: DisputeStatus.PENDING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h no futuro
    };

    const evidenceDto = {
      evidence: 'Estava presente no local',
      attachments: 'foto.jpg',
    };

    it('deve submeter evidências com sucesso', async () => {
      // Arrange
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(mockDispute);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([
          {
            ...mockDispute,
            studentEvidence: evidenceDto.evidence,
            updatedAt: new Date(),
          },
        ]),
      });

      // Act
      const result = await service.submitEvidence(
        'dispute-1',
        evidenceDto,
        'student-1',
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockDb.query.paymentDisputes.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
        with: { payment: true },
      });
    });

    it('deve lançar erro quando disputa não existe', async () => {
      // Arrange
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.submitEvidence('dispute-1', evidenceDto, 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando usuário não autorizado', async () => {
      // Arrange
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(mockDispute);

      // Act & Assert
      await expect(
        service.submitEvidence('dispute-1', evidenceDto, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar erro quando disputa expirada', async () => {
      // Arrange
      const expiredDispute = {
        ...mockDispute,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h atrás
      };
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(expiredDispute);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });

      // Act & Assert
      await expect(
        service.submitEvidence('dispute-1', evidenceDto, 'student-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolveDispute', () => {
    const mockDispute = {
      id: 'dispute-1',
      paymentId: 'payment-1',
      status: DisputeStatus.UNDER_REVIEW,
      payment: {
        id: 'payment-1',
        totalAmount: '100.00',
        platformFee: '10.00',
        personalAmount: '90.00',
      },
    };

    const resolveDto = {
      resolution: DisputeStatus.RESOLVED_PRO_PERSONAL,
      adminNotes: 'Evidências do personal são mais convincentes',
      reason: 'personal_evidence_stronger',
    };

    it('deve resolver disputa com sucesso', async () => {
      // Arrange
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(mockDispute);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([
          {
            ...mockDispute,
            status: DisputeStatus.RESOLVED_PRO_PERSONAL,
            resolution: DisputeStatus.RESOLVED_PRO_PERSONAL,
            adminNotes: resolveDto.adminNotes,
            resolvedBy: 'admin-1',
            resolvedAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      });

      // Mock para capturePayment
      jest.spyOn(service, 'capturePayment').mockResolvedValue(undefined);

      // Mock para getUserWallet (usado em updateWallets)
      jest.spyOn(service, 'getUserWallet').mockResolvedValue({
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: 0,
        pendingBalance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.resolveDispute(
        'dispute-1',
        resolveDto,
        'admin-1',
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe(DisputeStatus.RESOLVED_PRO_PERSONAL);
      expect(service.capturePayment).toHaveBeenCalledWith('payment-1');
    });

    it('deve lançar erro quando disputa não existe', async () => {
      // Arrange
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.resolveDispute('dispute-1', resolveDto, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar erro quando disputa não está em análise', async () => {
      // Arrange
      const mockDisputeNotUnderReview = {
        ...mockDispute,
        status: DisputeStatus.PENDING,
      };
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(
        mockDisputeNotUnderReview,
      );

      // Act & Assert
      await expect(
        service.resolveDispute('dispute-1', resolveDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserWallet', () => {
    it('deve retornar carteira existente', async () => {
      // Arrange
      const mockWallet = {
        id: 'wallet-1',
        userId: 'user-1',
        availableBalance: '100.00',
        pendingBalance: '50.00',
        totalEarned: '500.00',
        totalWithdrawn: '400.00',
        bankAccount: { bank: 'Banco do Brasil', account: '12345-6' },
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-1',
          name: 'João',
          email: 'joao@email.com',
          role: 'student',
        },
      };

      mockDb.query.userWallets.findFirst.mockResolvedValue(mockWallet);

      // Act
      const result = await service.getUserWallet('user-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.availableBalance).toBe(100);
      expect(mockDb.query.userWallets.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
        with: { user: true },
      });
    });

    it('deve criar carteira se não existir', async () => {
      // Arrange
      mockDb.query.userWallets.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 'wallet-1',
              userId: 'user-1',
              availableBalance: '0.00',
              pendingBalance: '0.00',
              totalEarned: '0.00',
              totalWithdrawn: '0.00',
              isActive: 'true',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });

      // Act
      const result = await service.getUserWallet('user-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.availableBalance).toBe(0);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ===== BUG 2: capturePaymentAfterClass com pagamento PIX vinculado via proposalId =====

  describe('capturePaymentAfterClass - pagamento PIX via proposalId (Bug 2)', () => {
    const classId = 'class-pix-1';

    const pixPayment = {
      id: 'pay-pix-1',
      classId,
      proposalId: 'prop-pix-1',
      studentId: 'student-1',
      personalId: 'personal-1',
      mpPaymentId: 'mp-pix-999',
      totalAmount: '100.00',
      platformFee: '10.00',
      personalAmount: '90.00',
      status: PaymentStatus.AUTHORIZED,
      type: PaymentType.CLASS_PAYMENT,
      class: {
        id: classId,
        studentId: 'student-1',
        personalId: 'personal-1',
      },
      student: { id: 'student-1', name: 'Bernardo', email: 'b@test.com' },
      personal: { id: 'personal-1', name: 'Luiz', email: 'l@test.com' },
    };

    it('deve capturar pagamento PIX quando classId foi vinculado após criação da aula', async () => {
      mockDb.query.payments.findFirst.mockResolvedValue(pixPayment);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest
          .fn()
          .mockResolvedValue([
            { ...pixPayment, status: PaymentStatus.CAPTURED },
          ]),
      });

      jest.spyOn(service, 'getUserWallet').mockResolvedValue({
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: 0,
        pendingBalance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(service, 'updateWallet').mockResolvedValue({} as any);
      mockMercadoPagoService.capturePayment.mockResolvedValue({});

      await expect(
        service.capturePaymentAfterClass(classId),
      ).resolves.not.toThrow();

      expect(mockDb.query.payments.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.any(Object) }),
      );
    });

    it('deve lançar NotFoundException quando pagamento PIX não está vinculado ao classId', async () => {
      mockDb.query.payments.findFirst.mockResolvedValue(null);
      mockDb.query.classes.findFirst.mockResolvedValue(null);

      await expect(service.capturePaymentAfterClass(classId)).rejects.toThrow(
        'Pagamento não encontrado para esta aula',
      );
    });

    it('deve ser idempotente se pagamento já foi capturado', async () => {
      mockDb.query.payments.findFirst.mockResolvedValue({
        ...pixPayment,
        status: PaymentStatus.CAPTURED,
      });

      await expect(
        service.capturePaymentAfterClass(classId),
      ).resolves.not.toThrow();
    });
  });

  describe('capturePaymentAfterClass - Stripe Fase 5', () => {
    const classId = 'class-stripe-1';
    const stripePayment = {
      id: 'pay-stripe-1',
      classId,
      proposalId: 'prop-stripe-1',
      studentId: 'student-1',
      personalId: 'personal-1',
      provider: 'stripe',
      stripePaymentIntentId: 'pi_123',
      stripeChargeId: 'ch_123',
      stripeLatestChargeId: 'ch_123',
      stripeTransferGroup: 'proposal_prop-stripe-1',
      processingModel: 'separate_charges_and_transfers',
      totalAmount: '100.00',
      platformFee: '10.00',
      personalAmount: '90.00',
      status: PaymentStatus.AUTHORIZED,
      type: PaymentType.CLASS_PAYMENT,
    };

    it('libera saldo interno e registra metadados Stripe sem chamar Mercado Pago', async () => {
      const capturedPayment = {
        ...stripePayment,
        status: PaymentStatus.CAPTURED,
      };
      const insertValues = jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      });

      mockDb.query.payments.findFirst.mockResolvedValue(stripePayment);
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([capturedPayment]),
      });
      mockDb.insert.mockReturnValue({
        values: insertValues,
      });

      await expect(
        service.capturePaymentAfterClass(classId),
      ).resolves.not.toThrow();

      expect(mockMercadoPagoService.capturePayment).not.toHaveBeenCalled();

      const transactionBatch = insertValues.mock.calls.find(([value]) =>
        Array.isArray(value),
      )?.[0];

      expect(transactionBatch).toHaveLength(2);
      expect(transactionBatch[0]).toEqual(
        expect.objectContaining({
          userId: 'personal-1',
          type: PaymentType.PERSONAL_EARNINGS,
          amount: '90.00',
          status: PaymentStatus.CAPTURED,
          metadata: expect.objectContaining({
            provider: 'stripe',
            processingModel: 'separate_charges_and_transfers',
            releaseType: 'internal_wallet_release',
            stripePaymentIntentId: 'pi_123',
            stripeChargeId: 'ch_123',
            stripeTransferGroup: 'proposal_prop-stripe-1',
          }),
        }),
      );
      expect(transactionBatch[1]).toEqual(
        expect.objectContaining({
          userId: 'student-1',
          type: PaymentType.CLASS_PAYMENT,
          amount: '-100.00',
          status: PaymentStatus.CAPTURED,
        }),
      );
    });

    it('não libera saldo se o PaymentIntent Stripe ainda não foi confirmado', async () => {
      mockDb.query.payments.findFirst.mockResolvedValue({
        ...stripePayment,
        status: PaymentStatus.PENDING,
      });

      await expect(service.capturePaymentAfterClass(classId)).rejects.toThrow(
        'Pagamento Stripe ainda não confirmado',
      );

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });
  });

  describe('refundPayment - Stripe Fase 6', () => {
    const stripePayment = {
      id: 'pay-stripe-refund-1',
      classId: 'class-stripe-1',
      proposalId: 'prop-stripe-1',
      studentId: 'student-1',
      personalId: 'personal-1',
      provider: 'stripe',
      stripePaymentIntentId: 'pi_123',
      stripeChargeId: 'ch_123',
      stripeLatestChargeId: 'ch_123',
      stripeTransferGroup: 'proposal_prop-stripe-1',
      processingModel: 'separate_charges_and_transfers',
      totalAmount: '100.00',
      platformFee: '10.00',
      personalAmount: '90.00',
      status: PaymentStatus.CAPTURED,
      type: PaymentType.CLASS_PAYMENT,
      splitData: {
        internalWalletRelease: {
          releaseType: 'internal_wallet_release',
        },
      },
    };

    it('cria refund Stripe e reverte a carteira interna quando há saldo disponível', async () => {
      const setMock = jest.fn().mockReturnThis();
      mockDb.query.payments.findFirst.mockResolvedValue(stripePayment);
      mockDb.update.mockReturnValue({
        set: setMock,
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });
      jest.spyOn(service, 'getUserWallet').mockResolvedValue({
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: 90,
        pendingBalance: 0,
        totalEarned: 90,
        totalWithdrawn: 0,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(service, 'updateWallet').mockResolvedValue({} as any);
      const createTransactionSpy = jest
        .spyOn(service as any, 'createTransaction')
        .mockResolvedValue({} as any);

      await service.refundPayment(
        stripePayment.id,
        'Cancelamento antes da aula',
      );

      expect(mockStripeRefundsService.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentIntentId: 'pi_123',
          chargeId: 'ch_123',
          amount: 100,
          reverseTransfer: false,
          refundApplicationFee: false,
          idempotencyKey: `stripe_refund:${stripePayment.id}`,
        }),
      );
      expect(service.updateWallet).toHaveBeenCalledWith('personal-1', {
        availableBalance: 0,
        totalEarned: 0,
      });
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.REFUNDED,
          stripeRefundId: 're_123',
          splitData: expect.objectContaining({
            stripeRefund: expect.objectContaining({
              refundId: 're_123',
              personalReversalStatus: 'wallet_reversed',
              recoveryRequiredAmount: '0.00',
            }),
          }),
        }),
      );
      expect(createTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'student-1',
          type: PaymentType.REFUND,
          stripeRefundId: 're_123',
        }),
      );
    });

    it('registra recuperação pendente quando o personal já sacou o saldo', async () => {
      const setMock = jest.fn().mockReturnThis();
      mockDb.query.payments.findFirst.mockResolvedValue(stripePayment);
      mockDb.update.mockReturnValue({
        set: setMock,
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });
      jest.spyOn(service, 'getUserWallet').mockResolvedValue({
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: 0,
        pendingBalance: 0,
        totalEarned: 90,
        totalWithdrawn: 90,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(service, 'updateWallet').mockResolvedValue({} as any);
      const createTransactionSpy = jest
        .spyOn(service as any, 'createTransaction')
        .mockResolvedValue({} as any);

      await service.refundPayment(stripePayment.id, 'Chargeback preventivo');

      expect(service.updateWallet).toHaveBeenCalledWith('personal-1', {
        availableBalance: 0,
        totalEarned: 0,
      });
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          splitData: expect.objectContaining({
            stripeRefund: expect.objectContaining({
              personalReversalStatus: 'recovery_required',
              recoveryRequiredAmount: '90.00',
            }),
          }),
        }),
      );
      expect(createTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'personal-1',
          amount: '0.00',
          metadata: expect.objectContaining({
            recoveryRequiredAmount: '90.00',
          }),
        }),
      );
    });
  });

  describe('Stripe dispute webhooks - Fase 6', () => {
    const stripePayment = {
      id: 'pay-stripe-dispute-1',
      classId: 'class-stripe-1',
      proposalId: 'prop-stripe-1',
      studentId: 'student-1',
      personalId: 'personal-1',
      provider: 'stripe',
      stripePaymentIntentId: 'pi_123',
      stripeChargeId: 'ch_123',
      stripeLatestChargeId: 'ch_123',
      totalAmount: '100.00',
      personalAmount: '90.00',
      status: PaymentStatus.CAPTURED,
      splitData: {},
    };

    it('mapeia charge.dispute.created para uma disputa interna', async () => {
      const disputeInsertValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
      });
      const setMock = jest.fn().mockReturnThis();
      mockDb.query.payments.findFirst.mockResolvedValue(stripePayment);
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: disputeInsertValues,
      });
      mockDb.update.mockReturnValue({
        set: setMock,
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });
      jest
        .spyOn(service as any, 'createTransaction')
        .mockResolvedValue({} as any);

      await service.handleStripeDisputeCreatedEvent({
        id: 'dp_123',
        charge: 'ch_123',
        amount: 10000,
        currency: 'brl',
        reason: 'fraudulent',
        status: 'needs_response',
        evidence_details: {
          due_by: 1767225600,
        },
      } as any);

      expect(disputeInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: stripePayment.id,
          reportedBy: 'student-1',
          reason: 'stripe_fraudulent',
          status: DisputeStatus.UNDER_REVIEW,
        }),
      );
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.DISPUTED,
          splitData: expect.objectContaining({
            stripeDispute: expect.objectContaining({
              stripeDisputeId: 'dp_123',
              status: 'needs_response',
            }),
          }),
        }),
      );
    });

    it('ao perder disputa Stripe, registra resolução e recuperação do repasse do personal', async () => {
      const activeDispute = {
        id: 'internal-dispute-1',
        paymentId: stripePayment.id,
        status: DisputeStatus.UNDER_REVIEW,
      };
      const setMock = jest.fn().mockReturnThis();
      mockDb.query.payments.findFirst.mockResolvedValue(stripePayment);
      mockDb.query.paymentDisputes.findFirst.mockResolvedValue(activeDispute);
      mockDb.update.mockReturnValue({
        set: setMock,
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      });
      jest.spyOn(service, 'getUserWallet').mockResolvedValue({
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: 0,
        pendingBalance: 0,
        totalEarned: 90,
        totalWithdrawn: 90,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(service, 'updateWallet').mockResolvedValue({} as any);
      const createTransactionSpy = jest
        .spyOn(service as any, 'createTransaction')
        .mockResolvedValue({} as any);

      await service.handleStripeDisputeClosedEvent({
        id: 'dp_123',
        charge: 'ch_123',
        amount: 10000,
        currency: 'brl',
        reason: 'fraudulent',
        status: 'lost',
        evidence_details: {},
      } as any);

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DisputeStatus.RESOLVED_PRO_STUDENT,
          resolution: DisputeStatus.RESOLVED_PRO_STUDENT,
        }),
      );
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.DISPUTE_RESOLVED,
          splitData: expect.objectContaining({
            stripeDispute: expect.objectContaining({
              stripeDisputeId: 'dp_123',
              resolution: DisputeStatus.RESOLVED_PRO_STUDENT,
              personalReversal: expect.objectContaining({
                recoveryRequiredAmount: '90.00',
              }),
            }),
          }),
        }),
      );
      expect(createTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeDisputeId: 'dp_123',
          metadata: expect.objectContaining({
            recoveryRequiredAmount: '90.00',
          }),
        }),
      );
    });
  });

  describe('getPaymentStats', () => {
    it('deve retornar estatísticas de pagamentos', async () => {
      // Arrange
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 10 }]),
        }),
      });

      // Mock para getStatusBreakdown
      jest.spyOn(service as any, 'getStatusBreakdown').mockResolvedValue({
        pending: 2,
        authorized: 3,
        captured: 4,
        refunded: 1,
        cancelled: 0,
        disputed: 0,
      });

      // Mock para getPeriodStats
      jest.spyOn(service as any, 'getPeriodStats').mockResolvedValue({
        today: { count: 1, amount: 100 },
        thisWeek: { count: 5, amount: 500 },
        thisMonth: { count: 10, amount: 1000 },
      });

      // Act
      const result = await service.getPaymentStats('user-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.totalPayments).toBe(10);
      expect(result.statusBreakdown).toBeDefined();
      expect(result.periodStats).toBeDefined();
    });
  });
});
