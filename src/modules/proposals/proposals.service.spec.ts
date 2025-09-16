import { Test, TestingModule } from '@nestjs/testing';
import { ProposalsService } from './proposals.service';
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
import { PaymentsService } from '../payments/payments.service';
import { JobsService } from '../jobs/jobs.service';

// Mock do banco de dados
const mockDb = {
  query: {
    proposals: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
  insert: jest.fn(),
  update: jest.fn(),
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
});
