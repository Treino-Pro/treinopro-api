import { Module } from '@nestjs/common';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './common/health/health.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
