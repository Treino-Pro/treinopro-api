import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalCleanupService } from './proposal-cleanup.service';
import { ProposalBackgroundService } from './proposal-background.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { JobsModule } from '../jobs/jobs.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [DatabaseModule, AuthModule, PaymentsModule, JobsModule, ChatModule],
  controllers: [ProposalsController],
  providers: [ProposalsService, ProposalCleanupService, ProposalBackgroundService],
  exports: [ProposalsService, ProposalCleanupService, ProposalBackgroundService],
})
export class ProposalsModule {}
