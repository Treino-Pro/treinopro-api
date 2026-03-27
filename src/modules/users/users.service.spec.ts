import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UsersService } from './users.service';
import { users, userPushTokens } from '../../database/schema';

const mockDeleteWhere = jest.fn();
const mockUpdateWhere = jest.fn();
const mockUpdateSet = jest.fn(() => ({
  where: mockUpdateWhere,
}));

const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(),
    },
  },
  delete: jest.fn(() => ({
    where: mockDeleteWhere,
  })),
  update: jest.fn(() => ({
    set: mockUpdateSet,
  })),
};

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    mockDeleteWhere.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve remover o token da tabela e limpar o campo legacy no logout', async () => {
    const result = await service.removeFcmToken('user-1', 'token-1');

    expect(mockDb.delete).toHaveBeenCalledWith(userPushTokens);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledWith(users);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        fcmToken: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      message: 'Token FCM removido com sucesso',
    });
  });
});
