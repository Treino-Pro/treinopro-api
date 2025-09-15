import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './services/email.service';
import { PushNotificationService } from './services/push-notification.service';
import { SMSService } from './services/sms.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    PushNotificationService,
    SMSService,
  ],
  exports: [
    NotificationsService,
    EmailService,
    PushNotificationService,
    SMSService,
  ],
})
export class NotificationsModule {}
