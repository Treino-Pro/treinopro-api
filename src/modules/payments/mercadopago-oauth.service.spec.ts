import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MercadoPagoOAuthService } from './mercadopago-oauth.service';

// Mock fetch — compatível com `import fetch from 'node-fetch'` (default import)
// jest.mock é hoisted, então usamos jest.fn() diretamente no factory
jest.mock('node-fetch', () => {
  const fn = jest.fn();
  return { __esModule: true, default: fn };
});

// Importar o mock após o jest.mock para obter a referência
import fetch from 'node-fetch';
const mockFetch = fetch as unknown as jest.Mock;

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

      expect(result.authUrl).toContain(
        'https://auth.mercadopago.com.br/authorization',
      );
      expect(result.authUrl).toContain('client_id=test-client-id');
      expect(result.authUrl).toContain('state=');
      expect(result.state).toMatch(/^[a-f0-9]{64}$/);
    });

    it('deve bloquear início do OAuth sem client secret configurado', async () => {
      const previousSecret = process.env.MP_CLIENT_SECRET;
      process.env.MP_CLIENT_SECRET = '';

      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        userType: 'personal',
      });

      await expect(service.startOAuth('user-1')).rejects.toThrow(
        /Configuração OAuth do Mercado Pago incompleta/,
      );

      process.env.MP_CLIENT_SECRET = previousSecret;
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
    it('deve rejeitar callback sem client secret configurado', async () => {
      const previousSecret = process.env.MP_CLIENT_SECRET;
      process.env.MP_CLIENT_SECRET = '';

      await expect(
        service.handleCallback('valid-code', 'a'.repeat(64)),
      ).rejects.toThrow(/Configuração OAuth do Mercado Pago incompleta/);

      process.env.MP_CLIENT_SECRET = previousSecret;
    });

    it('deve rejeitar callback sem code', async () => {
      await expect(service.handleCallback('', 'valid-state')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve rejeitar callback sem state', async () => {
      await expect(service.handleCallback('valid-code', '')).rejects.toThrow(
        BadRequestException,
      );
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
      mockFetch.mockResolvedValue({
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

  describe('handleCallback — sucesso', () => {
    it('deve persistir todos os campos OAuth no perfil financeiro', async () => {
      const validState = 'd'.repeat(64);
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        mpOauthState: validState,
        mpOauthStateCreatedAt: twoMinutesAgo,
      });

      // Primeiro fetch: token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'APP_USR-new-token',
          refresh_token: 'TG-new-refresh',
          expires_in: 21600,
          user_id: 12345,
          public_key: 'APP_USR-pk',
        }),
      });
      // Segundo fetch: user/me
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: 'personal@test.com' }),
      });

      const result = await service.handleCallback('valid-code', validState);

      expect(result.success).toBe(true);
      expect(result.mpUserId).toBe('12345');
      expect(result.mpEmail).toBe('personal@test.com');

      // Verificar que o segundo update (persistir tokens) contém todos os campos
      const setCalls = mockUpdateChain.set.mock.calls;
      const tokenUpdate = setCalls.find(
        (call: any[]) => call[0]?.mpAccessToken === 'APP_USR-new-token',
      );
      expect(tokenUpdate).toBeDefined();
      expect(tokenUpdate[0]).toEqual(
        expect.objectContaining({
          mpAccessToken: 'APP_USR-new-token',
          mpRefreshToken: 'TG-new-refresh',
          mpUserId: '12345',
          mpEmail: 'personal@test.com',
          mpIsVerified: true,
          mpOauthState: null,
          mpOauthStateCreatedAt: null,
          isComplete: true,
          canReceivePayments: true,
        }),
      );
      expect(tokenUpdate[0].mpTokenExpiresAt).toBeInstanceOf(Date);
      expect(tokenUpdate[0].mpConnectedAt).toBeInstanceOf(Date);
    });
  });

  describe('refreshAccessToken', () => {
    it('deve rejeitar refresh sem client secret configurado', async () => {
      const previousSecret = process.env.MP_CLIENT_SECRET;
      process.env.MP_CLIENT_SECRET = '';

      await expect(service.refreshAccessToken('user-1')).rejects.toThrow(
        /Configuração OAuth do Mercado Pago incompleta/,
      );

      process.env.MP_CLIENT_SECRET = previousSecret;
    });

    it('deve renovar token e salvar novo refresh token (rotation)', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        mpRefreshToken: 'TG-old-refresh',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'APP_USR-refreshed',
          refresh_token: 'TG-rotated-refresh',
          expires_in: 21600,
        }),
      });

      const newToken = await service.refreshAccessToken('user-1');

      expect(newToken).toBe('APP_USR-refreshed');
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          mpAccessToken: 'APP_USR-refreshed',
          mpRefreshToken: 'TG-rotated-refresh',
        }),
      );
    });

    it('deve limpar TODOS os campos MP quando refresh é revogado (400)', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        mpRefreshToken: 'TG-revoked',
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      });

      await expect(service.refreshAccessToken('user-1')).rejects.toThrow();

      // Verificar limpeza completa de metadados
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          mpAccessToken: null,
          mpRefreshToken: null,
          mpUserId: null,
          mpEmail: null,
          mpConnectedAt: null,
          mpIsVerified: false,
          canReceivePayments: false,
          isComplete: false,
        }),
      );
    });

    it('deve rejeitar sem limpar dados se não tiver refresh token', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        mpRefreshToken: null,
      });

      await expect(service.refreshAccessToken('user-1')).rejects.toThrow(
        /Reconecte a conta/,
      );
      // Não deve ter chamado update (sem limpeza)
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('deve limpar todos os campos OAuth', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        mpUserId: '123',
      });

      await service.disconnect('user-1');

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          mpAccessToken: null,
          mpRefreshToken: null,
          mpUserId: null,
          mpEmail: null,
          mpTokenExpiresAt: null,
          mpConnectedAt: null,
          mpOauthState: null,
          mpOauthStateCreatedAt: null,
          mpIsVerified: false,
          canReceivePayments: false,
        }),
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
