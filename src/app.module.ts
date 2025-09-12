import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CrefModule } from './modules/cref/cref.module';
import { SharedCacheModule } from './shared/cache.module';
import { HealthController } from './common/health/health.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SharedCacheModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0'),
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      }),
    }),
    AuthModule,
    CrefModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
