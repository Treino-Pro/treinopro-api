import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
