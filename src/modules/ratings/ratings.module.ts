import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
