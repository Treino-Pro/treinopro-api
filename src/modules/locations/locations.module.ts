import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
