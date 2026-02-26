import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EnvironmentVariables } from './env.validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', 'config.env'],
      validate: (config) => {
        const validatedConfig = plainToInstance(EnvironmentVariables, config, {
          enableImplicitConversion: true,
        });
        const errors = validateSync(validatedConfig, {
          skipMissingProperties: false,
        });
        if (errors.length > 0) {
          throw new Error(
            `Variáveis de ambiente inválidas ou ausentes:\n${errors
              .map((e) => Object.values(e.constraints ?? {}).join(', '))
              .join('\n')}`,
          );
        }
        return validatedConfig;
      },
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
