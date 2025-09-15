import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { DatabaseModule } from '../../database/database.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [DatabaseModule, PaymentsModule],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
