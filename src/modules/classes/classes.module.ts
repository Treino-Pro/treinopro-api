import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { ClassesCleanupService } from './classes-cleanup.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ChatModule } from '../chat/chat.module';
import { PaymentsModule } from '../payments/payments.module';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [DatabaseModule, AuthModule, GamificationModule, ChatModule, PaymentsModule, RatingsModule],
  controllers: [ClassesController],
  providers: [ClassesService, ClassesCleanupService],
  exports: [ClassesService, ClassesCleanupService],
})
export class ClassesModule {}
