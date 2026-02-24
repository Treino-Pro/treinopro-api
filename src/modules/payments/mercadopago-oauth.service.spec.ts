import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MercadoPagoOAuthService } from './mercadopago-oauth.service';

// Mock fetch
jest.mock('node-fetch', () => jest.fn());

describe('MercadoPagoOAuthService', () => {
  let service: MercadoPagoOAuthService;

  const mockDb = {
    query: {
      users: { findFirst: jest.fn() },
      financialProfiles: { findFirst: jest.fn() },
    },
    update: jest.fn(),
    insert: jest.fn(),
  };

  const mockUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{}]),
  };

  const mockInsertChain = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{}]),
  };

  beforeAll(() => {
    process.env.MP_CLIENT_ID = 'test-client-id';
    process.env.MP_CLIENT_SECRET = 'test-client-secret';
    process.env.MP_OAUTH_REDIRECT_URI = 'https://test.com/callback';
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.update.mockReturnValue(mockUpdateChain);
    mockDb.insert.mockReturnValue(mockInsertChain);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MercadoPagoOAuthService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
      ],
    }).compile();

    service = module.get<MercadoPagoOAuthService>(MercadoPagoOAuthService);
  });

  describe('startOAuth', () => {
    it('deve gerar URL com state válido para personal', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        userType: 'personal',
      });
      mockDb.query.financialProfiles.findFirst.mockResolvedValue(null);

      const result = await service.startOAuth('user-1');

      expect(result.authUrl).toContain('https://auth.mercadopago.com.br/authorization');
      expect(result.authUrl).toContain('client_id=test-client-id');
      expect(result.authUrl).toContain('state=');
      expect(result.state).toMatch(/^[a-f0-9]{64}$/);
    });

    it('deve bloquear aluno de iniciar OAuth', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        userType: 'student',
      });

      await expect(service.startOAuth('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('handleCallback — segurança', () => {
    it('deve rejeitar callback sem code', async () => {
      await expect(
        service.handleCallback('', 'valid-state'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar callback sem state', async () => {
      await expect(
        service.handleCallback('valid-code', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar state com formato inválido (não hex 64)', async () => {
      await expect(
        service.handleCallback('valid-code', 'short-state'),
      ).rejects.toThrow(/State inválido/);
    });

    it('deve rejeitar state que não existe no banco (replay/inventado)', async () => {
      const fakeState = 'a'.repeat(64);
      mockDb.query.financialProfiles.findFirst.mockResolvedValue(null);

      await expect(
        service.handleCallback('valid-code', fakeState),
      ).rejects.toThrow(/State inválido ou expirado/);
    });

    it('deve rejeitar state expirado (>10 min)', async () => {
      const expiredState = 'b'.repeat(64);
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);

      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        mpOauthState: expiredState,
        mpOauthStateCreatedAt: elevenMinutesAgo,
      });

      await expect(
        service.handleCallback('valid-code', expiredState),
      ).rejects.toThrow(/expirada/);
    });

    it('deve invalidar state antes de trocar code (anti-replay)', async () => {
      const validState = 'c'.repeat(64);
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        mpOauthState: validState,
        mpOauthStateCreatedAt: twoMinutesAgo,
      });

      // Mock fetch para falhar (não importa — queremos verificar que state foi invalidado)
      const fetchMock = require('node-fetch') as jest.Mock;
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid code',
      });

      await expect(
        service.handleCallback('expired-code', validState),
      ).rejects.toThrow();

      // Verificar que state foi setado para null (primeira chamada de update)
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ mpOauthState: null }),
      );
    });
  });

  describe('getOAuthStatus', () => {
    it('retorna connected=false sem perfil', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue(null);

      const result = await service.getOAuthStatus('user-1');
      expect(result.connected).toBe(false);
    });

    it('retorna connected=true com token', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        mpAccessToken: 'token',
        mpEmail: 'test@test.com',
        mpUserId: '123',
        mpConnectedAt: new Date(),
        mpIsVerified: true,
      });

      const result = await service.getOAuthStatus('user-1');
      expect(result.connected).toBe(true);
      expect(result.mpEmail).toBe('test@test.com');
    });
  });
});
