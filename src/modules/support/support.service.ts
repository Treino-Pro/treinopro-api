import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../notifications/services/email.service';
import { ReportProblemDto } from './dto/support.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly emailService: EmailService) {}

  async reportProblem(
    userId: string,
    userEmail: string,
    userName: string,
    userType: 'personal' | 'student',
    reportData: ReportProblemDto,
    userDocument?: string,
    userCref?: string,
  ): Promise<{ message: string }> {
    try {
      this.logger.log(
        `📧 [SUPPORT] Processando reporte de problema de ${userType}: ${userName}`,
      );

      // Preparar dados do usuário para o email
      const userInfo = this.formatUserInfo(
        userName,
        userEmail,
        userType,
        userDocument,
        userCref,
      );

      // Dados do email
      const emailData = {
        userName,
        userEmail,
        userType,
        userInfo,
        title: reportData.title,
        description: reportData.description,
        reportDate: new Date().toLocaleString('pt-BR'),
      };

      // Log detalhado do corpo da mensagem
      this.logger.log('📧 [SUPPORT] ===== DADOS DO EMAIL =====');
      this.logger.log(
        `📧 [SUPPORT] Para: ${process.env.SUPPORT_EMAIL || 'contato@treinopro.com'}`,
      );
      this.logger.log(`📧 [SUPPORT] Template: problem-report`);
      this.logger.log(`📧 [SUPPORT] Dados do usuário:`);
      this.logger.log(`📧 [SUPPORT] - Nome: ${userName}`);
      this.logger.log(`📧 [SUPPORT] - Email: ${userEmail}`);
      this.logger.log(`📧 [SUPPORT] - Tipo: ${userType}`);
      this.logger.log(
        `📧 [SUPPORT] - Documento: ${userDocument || 'Não informado'}`,
      );
      this.logger.log(`📧 [SUPPORT] - CREF: ${userCref || 'Não informado'}`);
      this.logger.log(`📧 [SUPPORT] Dados do problema:`);
      this.logger.log(`📧 [SUPPORT] - Título: ${reportData.title}`);
      this.logger.log(`📧 [SUPPORT] - Descrição: ${reportData.description}`);
      this.logger.log(`📧 [SUPPORT] - Data: ${emailData.reportDate}`);
      this.logger.log(`📧 [SUPPORT] ================================`);

      // Enviar email para o suporte
      await this.emailService.sendTemplateEmail(
        process.env.SUPPORT_EMAIL || 'contato@treinopro.com',
        'problem-report',
        emailData,
      );

      this.logger.log(
        `✅ [SUPPORT] Email enviado com sucesso para ${process.env.SUPPORT_EMAIL || 'contato@treinopro.com'}`,
      );
      this.logger.log(
        `✅ [SUPPORT] Reporte processado de ${userName} (${userEmail})`,
      );

      return {
        message:
          'Problema reportado com sucesso! Nossa equipe entrará em contato em breve.',
      };
    } catch (error) {
      this.logger.error(
        `❌ [SUPPORT] Erro ao processar reporte de ${userName}:`,
        error,
      );
      this.logger.error(`❌ [SUPPORT] Detalhes do erro:`, error.message);
      throw new Error('Erro ao reportar problema. Tente novamente mais tarde.');
    }
  }

  private formatUserInfo(
    userName: string,
    userEmail: string,
    userType: 'personal' | 'student',
    userDocument?: string,
    userCref?: string,
  ): string {
    let info = `Nome: ${userName}\n`;
    info += `Email: ${userEmail}\n`;
    info += `Tipo: ${userType === 'personal' ? 'Personal Trainer' : 'Aluno'}\n`;

    if (userDocument) {
      info += `Documento: ${userDocument}\n`;
    }

    if (userCref) {
      info += `CREF: ${userCref}\n`;
    }

    return info;
  }
}
