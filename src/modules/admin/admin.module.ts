import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminMigrationController } from './admin-migration.controller';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [DatabaseModule, AuthModule, PaymentsModule, GamificationModule],
  controllers: [AdminController, AdminMigrationController],
  providers: [AdminService],
})
export class AdminModule {}
