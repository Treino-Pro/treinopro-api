import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
// DATABASE_CONNECTION injetado via DatabaseModule
import { financialProfiles } from '../../database/schema/payments';
import { users } from '../../database/schema/users';

export interface OAuthStartResult {
  authUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  mpUserId: string;
  mpEmail: string;
}

export interface OAuthStatusResult {
  connected: boolean;
  mpEmail: string | null;
  mpUserId: string | null;
  connectedAt: Date | null;
  isVerified: boolean;
}

@Injectable()
export class MercadoPagoOAuthService {
  private readonly logger = new Logger(MercadoPagoOAuthService.name);

  private get clientId(): string {
    return process.env.MP_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.MP_CLIENT_SECRET || '';
  }

  private get redirectUri(): string {
    return process.env.MP_OAUTH_REDIRECT_URI || '';
  }

  constructor(@Inject('DATABASE_CONNECTION') private readonly db: any) {}

  /**
   * Inicia fluxo OAuth — gera URL de autorização com state anti-CSRF.
   */
  async startOAuth(userId: string): Promise<OAuthStartResult> {
    // Verificar se é personal
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user || user.userType !== 'personal') {
      throw new ForbiddenException(
        'Apenas personal trainers podem conectar conta Mercado Pago',
      );
    }

    if (!this.clientId || !this.redirectUri) {
      throw new BadRequestException(
        'Configuração OAuth do Mercado Pago não encontrada. Contate o suporte.',
      );
    }

    // Gerar state anti-CSRF
    const state = crypto.randomBytes(32).toString('hex');

    // Salvar state no perfil financeiro para validação no callback
    const profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.userId, userId),
    });

    if (profile) {
      await this.db
        .update(financialProfiles)
        .set({ mpOauthState: state, updatedAt: new Date() })
        .where(eq(financialProfiles.userId, userId));
    } else {
      await this.db.insert(financialProfiles).values({
        userId,
        preferredMethod: 'mercado_pago',
        mpOauthState: state,
      });
    }

    const authUrl =
      `https://auth.mercadopago.com.br/authorization?` +
      `client_id=${this.clientId}` +
      `&response_type=code` +
      `&platform_id=mp` +
      `&state=${state}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}`;

    this.logger.log(`[OAUTH] Fluxo iniciado para user ${userId}`);

    return { authUrl, state };
  }

  /**
   * Processa callback OAuth — troca code por access token.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult> {
    if (!code || !state) {
      throw new BadRequestException('Parâmetros code e state são obrigatórios');
    }

    // Buscar perfil pelo state (anti-CSRF)
    const profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.mpOauthState, state),
    });

    if (!profile) {
      throw new BadRequestException(
        'State inválido ou expirado. Inicie o fluxo novamente.',
      );
    }

    // Trocar code por access token
    const tokenResponse = await fetch(
      'https://api.mercadopago.com/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      this.logger.error(
        `[OAUTH] Erro ao trocar code: ${tokenResponse.status} ${errorBody}`,
      );

      if (tokenResponse.status === 400) {
        throw new BadRequestException(
          'Código de autorização expirado ou inválido. Tente novamente.',
        );
      }
      throw new BadRequestException(
        'Erro ao conectar conta Mercado Pago. Tente novamente.',
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user_id: number;
      public_key: string;
    };

    // Buscar dados do usuário MP para confirmar email
    let mpEmail = '';
    try {
      const userResponse = await fetch(
        'https://api.mercadopago.com/users/me',
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        },
      );
      if (userResponse.ok) {
        const userData = (await userResponse.json()) as { email: string };
        mpEmail = userData.email || '';
      }
    } catch (err) {
      this.logger.warn('[OAUTH] Não foi possível buscar email do usuário MP');
    }

    const tokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000,
    );

    // Salvar tokens no perfil financeiro
    await this.db
      .update(financialProfiles)
      .set({
        mpAccessToken: tokenData.access_token,
        mpRefreshToken: tokenData.refresh_token,
        mpUserId: String(tokenData.user_id),
        mpEmail: mpEmail,
        mpTokenExpiresAt: tokenExpiresAt,
        mpConnectedAt: new Date(),
        mpIsVerified: true,
        mpOauthState: null, // Limpar state após uso
        isComplete: true,
        canReceivePayments: true,
        updatedAt: new Date(),
      })
      .where(eq(financialProfiles.id, profile.id));

    this.logger.log(
      `[OAUTH] Conta conectada com sucesso: user_id=${tokenData.user_id}`,
    );

    return {
      success: true,
      mpUserId: String(tokenData.user_id),
      mpEmail,
    };
  }

  /**
   * Retorna status da conexão OAuth.
   */
  async getOAuthStatus(userId: string): Promise<OAuthStatusResult> {
    const profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.userId, userId),
    });

    if (!profile || !profile.mpAccessToken) {
      return {
        connected: false,
        mpEmail: null,
        mpUserId: null,
        connectedAt: null,
        isVerified: false,
      };
    }

    return {
      connected: true,
      mpEmail: profile.mpEmail,
      mpUserId: profile.mpUserId,
      connectedAt: profile.mpConnectedAt,
      isVerified: profile.mpIsVerified ?? false,
    };
  }

  /**
   * Desconecta conta MP — limpa tokens e metadados.
   */
  async disconnect(userId: string): Promise<void> {
    const profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.userId, userId),
    });

    if (!profile) {
      throw new BadRequestException('Perfil financeiro não encontrado');
    }

    await this.db
      .update(financialProfiles)
      .set({
        mpAccessToken: null,
        mpRefreshToken: null,
        mpUserId: null,
        mpEmail: null,
        mpTokenExpiresAt: null,
        mpConnectedAt: null,
        mpIsVerified: false,
        mpOauthState: null,
        canReceivePayments: false,
        updatedAt: new Date(),
      })
      .where(eq(financialProfiles.userId, userId));

    this.logger.log(`[OAUTH] Conta desconectada para user ${userId}`);
  }

  /**
   * Renova access token usando refresh token (chamado internamente quando necessário).
   */
  async refreshAccessToken(userId: string): Promise<string> {
    const profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.userId, userId),
    });

    if (!profile?.mpRefreshToken) {
      throw new BadRequestException(
        'Refresh token não disponível. Reconecte a conta Mercado Pago.',
      );
    }

    const tokenResponse = await fetch(
      'https://api.mercadopago.com/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: profile.mpRefreshToken,
        }),
      },
    );

    if (!tokenResponse.ok) {
      this.logger.error(
        `[OAUTH] Erro ao renovar token para user ${userId}`,
      );
      throw new BadRequestException(
        'Erro ao renovar token. Reconecte a conta Mercado Pago.',
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const tokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000,
    );

    await this.db
      .update(financialProfiles)
      .set({
        mpAccessToken: tokenData.access_token,
        mpRefreshToken: tokenData.refresh_token,
        mpTokenExpiresAt: tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(financialProfiles.userId, userId));

    return tokenData.access_token;
  }
}
