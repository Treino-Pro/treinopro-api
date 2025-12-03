import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DatabaseModule } from '../../database/database.module';
import { CrefModule } from '../cref/cref.module';
import { EmailVerificationService } from './services/email-verification.service';
import { EmailService } from '../notifications/services/email.service';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SharedCacheModule } from '../../shared/cache.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SharedCacheModule, // ✅ Adicionado para cache Redis
    CrefModule, // Importar o módulo CREF
    forwardRef(() => GamificationModule), // Importar o módulo de gamificação
    NotificationsModule, // Importar o módulo de notificações
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get('JWT_SECRET') || 'fallback-secret';
        const expiresIn = configService.get('JWT_EXPIRES_IN') || '24h';

        return {
          secret,
          signOptions: {
            expiresIn:
              typeof expiresIn === 'string' && expiresIn.length > 0
                ? expiresIn
                : '24h',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, EmailVerificationService, EmailService],
  exports: [AuthService, JwtModule, EmailVerificationService],
})
export class AuthModule {}
