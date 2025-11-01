import { Test, TestingModule } from '@nestjs/testing';
import { ProposalsService } from './proposals.service';
import { BadRequestException } from '@nestjs/common';
import { proposals, classes } from '../../database/schema';
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
import { PaymentsService } from '../payments/payments.service';
import { JobsService } from '../jobs/jobs.service';

// Mock do banco de dados
const mockDb: any = {
  query: {
    proposals: {
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

describe('ProposalsService', () => {
  let service: ProposalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalsService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
        {
          provide: StudentPaymentMethodsService,
          useValue: mockStudentPaymentService,
        },
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
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
    it('deve lançar BadRequestException quando houver conflito de horário com aulas existentes', async () => {
      // Arrange: proposta pendente às 10:00 por 60min
      const proposalId = 'proposal-1';
      const personalId = 'personal-1';
      const trainingDate = new Date('2025-09-17T00:00:00Z');

      const pendingProposal = {
        id: proposalId,
        studentId: 'student-1',
        trainingDate, // data do dia
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

      // Aula existente do personal das 09:30 às 10:30 (sobrepõe)
      const existingClass = {
        id: 'class-1',
        personalId,
        studentId: 'student-x',
        date: new Date(trainingDate),
        time: '09:30',
        duration: 60,
        status: 'scheduled',
      };

      // Mock do encadeamento select().from().where().limit() para proposals/classes
      mockDb.select.mockImplementation(() => ({
        from: (table: any) => ({
          where: () => {
            if (table === proposals) {
              // caminho com .limit(1)
              return {
                limit: () => Promise.resolve([pendingProposal]),
              };
            }
            if (table === classes) {
              // caminho sem .limit (await direto)
              return Promise.resolve([existingClass]);
            }
            return Promise.resolve([]);
          },
        }),
      }));

      // Act + Assert
      await expect(
        service.acceptProposal(proposalId, personalId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deve aceitar proposta quando não houver conflito de horário', async () => {
      const proposalId = 'proposal-2';
      const personalId = 'personal-2';
      const trainingDate = new Date('2025-09-17T00:00:00Z');

      const pendingProposal = {
        id: proposalId,
        studentId: 'student-1',
        trainingDate,
        trainingTime: '12:00', // 12:00-13:00
        durationMinutes: 60,
        locationName: 'Academia X',
        locationAddress: 'Rua Y',
        modalityName: 'Musculação',
        price: '100.00',
        additionalNotes: null,
        status: 'pending',
        paymentStatus: 'approved',
      };

      // Aulas existentes não sobrepõem (ex.: 10:00-11:00)
      const existingClassNonOverlapping = {
        id: 'class-2',
        personalId,
        studentId: 'student-x',
        date: new Date(trainingDate),
        time: '10:00',
        duration: 60,
        status: 'scheduled',
      };

      // Mocks diferentes para cada chamada select().from(table)
      mockDb.select.mockImplementation(() => ({
        from: (table: any) => ({
          where: () => {
            if (table === proposals) {
              return {
                limit: () => Promise.resolve([pendingProposal]),
              };
            }
            if (table === classes) {
              return Promise.resolve([existingClassNonOverlapping]);
            }
            return Promise.resolve([]);
          },
        }),
      }));

      // Mock update() para alterar status para matched
      mockDb.update.mockImplementation(() => ({
        set: (data: any) => ({
          where: () => ({
            returning: () =>
              Promise.resolve([{ ...pendingProposal, status: 'matched' }]),
          }),
        }),
      }));

      // Mock insert() para criação automática de aula após aceitar
      mockDb.insert.mockImplementation(() => ({
        values: () => ({
          returning: () => Promise.resolve([{ id: 'class-new' }]),
        }),
      }));

      const result = await service.acceptProposal(proposalId, personalId);
      expect(result.status).toBe('matched');
    });
  });
});
