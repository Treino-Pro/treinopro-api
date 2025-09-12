import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrefService } from './cref.service';
import { CrefController } from './cref.controller';

@Module({
  imports: [ConfigModule],
  providers: [CrefService],
  controllers: [CrefController],
  exports: [CrefService], // Exportar para usar em outros módulos
})
export class CrefModule {}
