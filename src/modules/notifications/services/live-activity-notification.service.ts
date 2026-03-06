import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http2 from 'http2';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import { eq, and } from 'drizzle-orm';
import { liveActivityTokens } from '../../../database/schema';

interface LiveActivityContentState {
  studentName?: string;
  location?: string;
  modality?: string;
  price?: string;
  trainingTime?: string;
  expiresAt?: string; // ISO date string
  proposalStatus: string;
}

@Injectable()
export class LiveActivityNotificationService {
  private readonly logger = new Logger(LiveActivityNotificationService.name);
  private apnsAuthKey: Buffer | null = null;
  private jwtToken: string | null = null;
  private jwtTokenExpiry = 0;

  private readonly teamId: string;
  private readonly keyId: string;
  private readonly authKeyPath: string;
  private readonly bundleId = 'com.treinopro.oficial';
  private readonly apnsTopic =
    'com.treinopro.oficial.push-type.liveactivity';

  constructor(
    private readonly configService: ConfigService,
    @Inject('DATABASE_CONNECTION') private readonly db: any,
  ) {
    this.teamId = this.configService.get<string>('APPLE_TEAM_ID', '');
    this.keyId = this.configService.get<string>('APPLE_KEY_ID', '');
    this.authKeyPath = this.configService.get<string>(
      'APPLE_AUTH_KEY_PATH',
      '',
    );

    if (this.authKeyPath && fs.existsSync(this.authKeyPath)) {
      this.apnsAuthKey = fs.readFileSync(this.authKeyPath);
      this.logger.log('Apple APNs auth key loaded successfully');
    } else {
      this.logger.warn(
        'Apple APNs auth key not found — Live Activity push disabled',
      );
    }
  }

  isConfigured(): boolean {
    return !!(this.apnsAuthKey && this.teamId && this.keyId);
  }

  /**
   * Get or refresh the APNs JWT token (valid for 1 hour, refresh at 50 min)
   */
  private getJwtToken(): string {
    const now = Math.floor(Date.now() / 1000);

    if (this.jwtToken && now < this.jwtTokenExpiry - 600) {
      return this.jwtToken;
    }

    this.jwtToken = jwt.sign(
      {
        iss: this.teamId,
        iat: now,
      },
      this.apnsAuthKey,
      {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: this.keyId,
        },
      },
    );

    this.jwtTokenExpiry = now + 3600;
    return this.jwtToken;
  }

  /**
   * Send a Live Activity update via APNs HTTP/2.
   * Cada chamada abre uma conexão HTTP/2 dedicada — aceitável para o volume atual.
   */
  async sendLiveActivityUpdate(
    token: string,
    contentState: LiveActivityContentState,
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn('APNs not configured — skipping Live Activity update');
      return false;
    }

    return new Promise((resolve) => {
      const isProduction =
        this.configService.get<string>('NODE_ENV') === 'production';
      const host = isProduction
        ? 'api.push.apple.com'
        : 'api.sandbox.push.apple.com';

      const client = http2.connect(`https://${host}`);
      let resolved = false;

      const finish = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
        // Fechar conexão de forma segura (ignorar erro se já fechada)
        try { client.close(); } catch (_) {}
      };

      client.on('error', (err) => {
        this.logger.error(`APNs connection error: ${err.message}`);
        finish(false);
      });

      const jwtToken = this.getJwtToken();

      const payload = JSON.stringify({
        aps: {
          timestamp: Math.floor(Date.now() / 1000),
          event: 'update',
          'content-state': contentState,
          alert: {
            title: 'Nova Proposta de Treino',
            body:
              contentState.proposalStatus === 'accepted'
                ? 'Proposta aceita!'
                : `${contentState.studentName ?? 'Aluno'} — R$ ${contentState.price ?? ''}`,
          },
        },
      });

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwtToken}`,
        'apns-push-type': 'liveactivity',
        'apns-topic': this.apnsTopic,
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });

      let responseData = '';

      req.on('response', (headers) => {
        const status = headers[':status'];
        if (status === 200) {
          this.logger.log(
            `Live Activity update sent to token: ${token.substring(0, 8)}...`,
          );
          finish(true);
        } else {
          this.logger.warn(`APNs response status: ${status} for token ${token.substring(0, 8)}...`);
          // finish(false) will be called in req.on('end')
        }
      });

      req.on('data', (chunk: Buffer) => {
        responseData += chunk.toString();
      });

      req.on('end', () => {
        if (responseData) {
          this.logger.warn(`APNs response body: ${responseData}`);
        }
        finish(false);
      });

      req.on('error', (err) => {
        this.logger.error(`APNs request error: ${err.message}`);
        finish(false);
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * End a Live Activity via APNs push.
   */
  async endLiveActivity(
    token: string,
    finalState?: LiveActivityContentState,
  ): Promise<boolean> {
    if (!this.isConfigured()) return false;

    return new Promise((resolve) => {
      const isProduction =
        this.configService.get<string>('NODE_ENV') === 'production';
      const host = isProduction
        ? 'api.push.apple.com'
        : 'api.sandbox.push.apple.com';

      const client = http2.connect(`https://${host}`);
      let resolved = false;

      const finish = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
        try { client.close(); } catch (_) {}
      };

      client.on('error', (err) => {
        this.logger.error(`APNs connection error: ${err.message}`);
        finish(false);
      });

      const jwtToken = this.getJwtToken();

      const state = finalState || {
        proposalStatus: 'expired',
        studentName: '',
        location: '',
        modality: '',
        price: '',
        trainingTime: '',
        expiresAt: new Date().toISOString(),
      };

      const payload = JSON.stringify({
        aps: {
          timestamp: Math.floor(Date.now() / 1000),
          event: 'end',
          'dismissal-date': Math.floor(Date.now() / 1000) + 5,
          'content-state': state,
        },
      });

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwtToken}`,
        'apns-push-type': 'liveactivity',
        'apns-topic': this.apnsTopic,
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });

      req.on('response', (headers) => {
        const status = headers[':status'];
        if (status === 200) {
          this.logger.log(
            `Live Activity ended for token: ${token.substring(0, 8)}...`,
          );
          finish(true);
        } else {
          this.logger.warn(`APNs end response status: ${status}`);
          finish(false);
        }
      });

      req.on('data', () => {});

      req.on('end', () => {
        finish(false); // no-op se já resolvido
      });

      req.on('error', (err) => {
        this.logger.error(`APNs end request error: ${err.message}`);
        finish(false);
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Send Live Activity update for a specific proposal to all active tokens
   */
  async updateProposalActivity(
    proposalId: string,
    contentState: LiveActivityContentState,
  ): Promise<void> {
    try {
      const tokens = await this.db
        .select()
        .from(liveActivityTokens)
        .where(
          and(
            eq(liveActivityTokens.proposalId, proposalId),
            eq(liveActivityTokens.isActive, true),
          ),
        );

      if (tokens.length === 0) {
        this.logger.log(
          `No active Live Activity tokens for proposal ${proposalId}`,
        );
        return;
      }

      this.logger.log(
        `Sending Live Activity update to ${tokens.length} tokens for proposal ${proposalId}`,
      );

      for (const tokenRecord of tokens) {
        const success = await this.sendLiveActivityUpdate(
          tokenRecord.token,
          contentState,
        );
        if (!success) {
          // Mark token as inactive if push failed
          await this.db
            .update(liveActivityTokens)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(liveActivityTokens.id, tokenRecord.id));
        }
      }
    } catch (error) {
      this.logger.error(
        `Error updating Live Activity for proposal ${proposalId}:`,
        error,
      );
    }
  }

  /**
   * End all Live Activities for a specific proposal
   */
  async endProposalActivities(proposalId: string): Promise<void> {
    try {
      const tokens = await this.db
        .select()
        .from(liveActivityTokens)
        .where(
          and(
            eq(liveActivityTokens.proposalId, proposalId),
            eq(liveActivityTokens.isActive, true),
          ),
        );

      for (const tokenRecord of tokens) {
        await this.endLiveActivity(tokenRecord.token);
      }

      // Mark all tokens for this proposal as inactive
      await this.db
        .update(liveActivityTokens)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(liveActivityTokens.proposalId, proposalId));
    } catch (error) {
      this.logger.error(
        `Error ending Live Activities for proposal ${proposalId}:`,
        error,
      );
    }
  }
}
