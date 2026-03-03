import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './services/email.service';
import { InAppNotificationService } from './services/in-app-notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { FirebaseNotificationService } from './services/firebase-notification.service';
import { LiveActivityNotificationService } from './services/live-activity-notification.service';
import { NonceService } from './services/nonce.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule), ConfigModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    InAppNotificationService,
    PushNotificationService,
    FirebaseNotificationService,
    LiveActivityNotificationService,
    NonceService,
  ],
  exports: [
    NotificationsService,
    EmailService,
    InAppNotificationService,
    PushNotificationService,
    FirebaseNotificationService,
    LiveActivityNotificationService,
    NonceService,
  ],
})
export class NotificationsModule {}
