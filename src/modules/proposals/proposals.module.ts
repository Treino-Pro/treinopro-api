import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [DatabaseModule, AuthModule, PaymentsModule, JobsModule],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
