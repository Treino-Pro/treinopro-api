import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminMigrationController } from './admin-migration.controller';
import { PanelAuthController } from './panel-auth.controller';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    PaymentsModule,
    GamificationModule,
    NotificationsModule,
  ],
  controllers: [AdminController, AdminMigrationController, PanelAuthController],
  providers: [AdminService],
})
export class AdminModule {}
