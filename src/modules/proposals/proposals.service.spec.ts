import { Test, TestingModule } from '@nestjs/testing';
import { ProposalsService } from './proposals.service';
import { DatabaseModule } from '../../database/database.module';

describe('ProposalsService', () => {
  let service: ProposalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [ProposalsService],
    }).compile();

    service = module.get<ProposalsService>(ProposalsService);
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
