import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CrefService } from './cref.service';
import {
  CrefValidationJobData,
  CrefValidationJobResult,
} from './cref-queue.service';

@Processor('cref-validation')
export class CrefProcessor {
  private readonly logger = new Logger(CrefProcessor.name);

  constructor(private readonly crefService: CrefService) {}

  @Process('validate-cref')
  async handleCrefValidation(
    job: Job<CrefValidationJobData>,
  ): Promise<CrefValidationJobResult> {
    const { crefNumber, userType, retryCount = 0 } = job.data;

    this.logger.log(
      `🔄 [PROCESSOR] Processando validação CREF: ${crefNumber} (tentativa ${retryCount + 1})`,
    );

    try {
      // Chama o serviço real de validação CREF
      const result = await this.crefService.validateCref(crefNumber);

      this.logger.log(`✅ [PROCESSOR] Validação CREF concluída: ${crefNumber}`);

      return {
        success: true,
        result,
        retryCount,
      };
    } catch (error) {
      this.logger.error(
        `❌ [PROCESSOR] Erro na validação CREF ${crefNumber}:`,
        error.message,
      );

      // Se for um erro de formato, não tenta novamente
      if (error.message.includes('Formato de CREF inválido')) {
        this.logger.warn(
          `⚠️ [PROCESSOR] CREF ${crefNumber} tem formato inválido, não será reprocessado`,
        );
        throw error; // Não tenta novamente
      }

      // Se for um erro de graduação, não tenta novamente
      if (error.message.includes('deve ser BACHAREL')) {
        this.logger.warn(
          `⚠️ [PROCESSOR] CREF ${crefNumber} tem graduação inválida, não será reprocessado`,
        );
        throw error; // Não tenta novamente
      }

      // Para outros erros, permite retry
      return {
        success: false,
        error: error.message,
        retryCount,
      };
    }
  }
}
