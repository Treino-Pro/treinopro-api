import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';

interface LoginBody {
  email: string;
  password: string;
}

interface IpRecord {
  attempts: number;
  blockedUntil: number; // timestamp ms
}

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos

// Limpa entradas expiradas a cada 1h para não vazar memória indefinidamente
const ipAttempts = new Map<string, IpRecord>();
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, rec] of ipAttempts) {
      if (rec.blockedUntil < now && rec.attempts === 0) ipAttempts.delete(ip);
      // Entradas bloqueadas são removidas quando o block expirar na próxima requisição
    }
  },
  60 * 60 * 1000,
);

/** Comparação em tempo constante para evitar timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Roda a comparação mesmo assim para não vazar o length por timing
    crypto.timingSafeEqual(
      Buffer.alloc(bufB.length),
      Buffer.alloc(bufB.length),
    );
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

@Controller('panel/api')
export class PanelAuthController {
  private readonly logger = new Logger(PanelAuthController.name);

  constructor(private readonly jwtService: JwtService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginBody, @Req() req: Request) {
    const ip = getClientIp(req);
    const now = Date.now();

    // Verifica bloqueio de IP
    const record = ipAttempts.get(ip) ?? { attempts: 0, blockedUntil: 0 };
    if (record.blockedUntil > now) {
      const remainingMin = Math.ceil((record.blockedUntil - now) / 60_000);
      this.logger.warn(`[PanelAuth] IP bloqueado: ${ip}`);
      throw new ForbiddenException(
        `IP bloqueado por excesso de tentativas. Tente novamente em ${remainingMin} minuto(s).`,
      );
    }

    const adminEmail = process.env.ADMIN_PANEL_EMAIL ?? '';
    const adminPassword = process.env.ADMIN_PANEL_PASSWORD ?? '';

    if (!adminEmail || !adminPassword) {
      this.logger.error(
        '[PanelAuth] ADMIN_PANEL_EMAIL ou ADMIN_PANEL_PASSWORD não configurados',
      );
      throw new UnauthorizedException(
        'Painel administrativo não configurado no servidor',
      );
    }

    const emailOk = safeEqual(body.email ?? '', adminEmail);
    const passOk = safeEqual(body.password ?? '', adminPassword);

    if (!emailOk || !passOk) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        record.blockedUntil = now + BLOCK_DURATION_MS;
        this.logger.warn(
          `[PanelAuth] IP ${ip} bloqueado após ${record.attempts} tentativas falhas`,
        );
      } else {
        this.logger.warn(
          `[PanelAuth] Tentativa falha ${record.attempts}/${MAX_ATTEMPTS} — IP: ${ip}`,
        );
      }
      ipAttempts.set(ip, record);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Sucesso — zera contador do IP
    ipAttempts.delete(ip);
    this.logger.log(`[PanelAuth] Login bem-sucedido — IP: ${ip}`);

    const payload = {
      sub: 'panel-admin',
      email: adminEmail,
      userType: 'admin',
      isPanelAdmin: true,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: '8h' });

    return {
      access_token,
      user: { email: adminEmail, userType: 'admin' },
    };
  }
}
