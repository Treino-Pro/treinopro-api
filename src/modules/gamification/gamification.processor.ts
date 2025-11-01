import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('gamification-events')
export class GamificationProcessor {
  @Process('profile_update')
  async handleProfileUpdate(job: Job) {
    // Placeholder para side-effects assíncronos (notificações, analytics, etc.)
    // job.data contém o payload emitido
  }
}
