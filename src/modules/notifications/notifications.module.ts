import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './services/email.service';
import { InAppNotificationService } from './services/in-app-notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    InAppNotificationService,
    PushNotificationService,
  ],
  exports: [
    NotificationsService,
    EmailService,
    InAppNotificationService,
    PushNotificationService,
  ],
})
export class NotificationsModule {}
