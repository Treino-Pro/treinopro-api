import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './services/email.service';
import { InAppNotificationService } from './services/in-app-notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
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
