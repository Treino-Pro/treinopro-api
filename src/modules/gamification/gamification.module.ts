import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { GamificationProcessor } from './gamification.processor';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AuthModule),
    ChatModule,
    BullModule.registerQueue({ name: 'gamification-events' }),
  ],
  controllers: [GamificationController],
  providers: [GamificationService, GamificationProcessor],
  exports: [GamificationService],
})
export class GamificationModule {}

