import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { SharedCacheModule } from '../../shared/cache.module';
import { CrefService } from './cref.service';
import { CrefController } from './cref.controller';
import { CrefQueueService } from './cref-queue.service';
import { CrefProcessor } from './cref.processor';
import { CrefCacheService } from './cref-cache.service';

@Module({
  imports: [
    ConfigModule,
    SharedCacheModule,
    BullModule.registerQueue({
      name: 'cref-validation',
    }),
  ],
  providers: [CrefService, CrefQueueService, CrefProcessor, CrefCacheService],
  controllers: [CrefController],
  exports: [CrefService, CrefQueueService], // Exportar para usar em outros módulos
})
export class CrefModule {}
