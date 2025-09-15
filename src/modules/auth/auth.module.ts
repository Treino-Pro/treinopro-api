import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DatabaseModule } from '../../database/database.module';
import { CrefModule } from '../cref/cref.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CrefModule, // Importar o módulo CREF
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get('JWT_SECRET') || 'fallback-secret';
        const expiresIn = configService.get('JWT_EXPIRES_IN') || '24h';
        
        console.log('🔧 [AUTH JWT] Configuração:', { 
          secret: secret ? 'definido' : 'undefined', 
          expiresIn: expiresIn || '24h (fallback)'
        });
        
        return {
          secret,
          signOptions: {
            expiresIn: typeof expiresIn === 'string' && expiresIn.length > 0 ? expiresIn : '24h',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
