import { Module } from '@nestjs/common';
import { HealthQuestionnaireController } from './health-questionnaire.controller';
import { HealthQuestionnaireService } from './health-questionnaire.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [HealthQuestionnaireController],
  providers: [HealthQuestionnaireService],
  exports: [HealthQuestionnaireService],
})
export class HealthQuestionnaireModule {}
