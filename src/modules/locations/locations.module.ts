import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, ConfigModule, AuthModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
