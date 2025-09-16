import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { JobsService } from './jobs.service';
import { ProposalJobsProcessor } from './processors/proposal-jobs.processor';
import { PaymentJobsProcessor } from './processors/payment-jobs.processor';
import { NotificationJobsProcessor } from './processors/notification-jobs.processor';
import { DatabaseModule } from '../../database/database.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    DatabaseModule,
    PaymentsModule,
    NotificationsModule,
    BullModule.registerQueue(
      {
        name: 'proposal-jobs',
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          removeOnComplete: 100, // Manter últimos 100 jobs completos
          removeOnFail: 50, // Manter últimos 50 jobs falhados
          attempts: 3, // Tentar 3 vezes em caso de falha
          backoff: {
            type: 'exponential',
            delay: 2000, // Delay exponencial começando em 2s
          },
        },
      },
      {
        name: 'payment-jobs',
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 5, // Pagamentos são críticos, 5 tentativas
          backoff: {
            type: 'exponential',
            delay: 5000, // Delay maior para pagamentos
          },
        },
      },
      {
        name: 'notification-jobs',
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 2, // Notificações podem falhar, não são críticas
          backoff: {
            type: 'fixed',
            delay: 1000,
          },
        },
      }
    ),
  ],
  providers: [
    JobsService,
    ProposalJobsProcessor,
    PaymentJobsProcessor,
    NotificationJobsProcessor,
  ],
  exports: [JobsService],
})
export class JobsModule {}
