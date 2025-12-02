import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalCleanupService } from './proposal-cleanup.service';
import { ProposalBackgroundService } from './proposal-background.service';
import { ProposalsGateway } from './proposals.gateway';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { JobsModule } from '../jobs/jobs.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocationsModule } from '../locations/locations.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    PaymentsModule,
    JobsModule,
    ChatModule,
    NotificationsModule,
    LocationsModule,
  ],
  controllers: [ProposalsController],
  providers: [
    ProposalsService,
    ProposalCleanupService,
    ProposalBackgroundService,
    ProposalsGateway,
  ],
  exports: [
    ProposalsService,
    ProposalCleanupService,
    ProposalBackgroundService,
    ProposalsGateway,
  ],
})
export class ProposalsModule {}
