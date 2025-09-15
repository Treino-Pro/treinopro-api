import { Test, TestingModule } from '@nestjs/testing';
import { ProposalsService } from './proposals.service';

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
