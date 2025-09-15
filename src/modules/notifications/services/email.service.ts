import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.setupTransporter();
  }

  private setupTransporter(): void {
    // Configurar transporter baseado nas variáveis de ambiente
    if (process.env.NODE_ENV === 'production') {
      // Produção - usar provedor real (ex: SendGrid, AWS SES, etc.)
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
    } else {
      // Desenvolvimento - usar Ethereal Email para testes
      this.setupEtherealTransporter();
    }
  }

  private async setupEtherealTransporter(): Promise<void> {
    try {
      // Criar conta de teste no Ethereal Email
      const testAccount = await nodemailer.createTestAccount();

      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      this.logger.log('📧 Ethereal Email configurado para desenvolvimento');
      this.logger.log(`👤 Usuário: ${testAccount.user}`);
      this.logger.log(`🔑 Senha: ${testAccount.pass}`);

    } catch (error) {
      this.logger.error('❌ Erro ao configurar Ethereal Email:', error);
      
      // Fallback para transporter fake
      this.transporter = {
        sendMail: async (options) => {
          this.logger.log(`📧 [FAKE] Email enviado para ${options.to}: ${options.subject}`);
          return { messageId: 'fake-message-id' };
        }
      } as any;
    }
  }

  async sendTemplateEmail(to: string, template: string, data: Record<string, any>): Promise<void> {
    try {
      const emailContent = this.getEmailTemplate(template, data);
      
      const mailOptions = {
        from: `"TreinoPro" <${process.env.EMAIL_FROM || 'noreply@treinopro.com'}>`,
        to: to,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Log da URL de preview para desenvolvimento
      if (process.env.NODE_ENV !== 'production' && result.messageId) {
        const previewUrl = nodemailer.getTestMessageUrl(result);
        if (previewUrl) {
          this.logger.log(`📧 Preview do email: ${previewUrl}`);
        }
      }

      this.logger.log(`✅ Email enviado com sucesso para ${to} (${template})`);

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar email para ${to}:`, error);
      throw error;
    }
  }

  private getEmailTemplate(template: string, data: Record<string, any>): { subject: string; html: string; text: string } {
    switch (template) {
      case 'proposal-match':
        return {
          subject: '🎯 Nova Proposta Disponível!',
          html: this.getProposalMatchHTML(data),
          text: this.getProposalMatchText(data),
        };

      case 'payment-confirmation':
        return {
          subject: '✅ Pagamento Confirmado',
          html: this.getPaymentConfirmationHTML(data),
          text: this.getPaymentConfirmationText(data),
        };

      case 'payment-reminder-first':
        return {
          subject: '⏰ Finalize seu Pagamento',
          html: this.getPaymentReminderHTML(data, 'first'),
          text: this.getPaymentReminderText(data, 'first'),
        };

      case 'payment-reminder-final':
        return {
          subject: '🚨 Último Aviso - Pagamento Expira em Breve!',
          html: this.getPaymentReminderHTML(data, 'final'),
          text: this.getPaymentReminderText(data, 'final'),
        };

      case 'class-reminder':
        return {
          subject: '🏋️ Lembrete: Sua Aula é Hoje!',
          html: this.getClassReminderHTML(data),
          text: this.getClassReminderText(data),
        };

      case 'class-cancellation':
        return {
          subject: '❌ Aula Cancelada',
          html: this.getClassCancellationHTML(data),
          text: this.getClassCancellationText(data),
        };

      case 'refund-processed':
        return {
          subject: '💰 Reembolso Processado',
          html: this.getRefundProcessedHTML(data),
          text: this.getRefundProcessedText(data),
        };

      case 'profile-reminder':
        return {
          subject: '👤 Complete seu Perfil',
          html: this.getProfileReminderHTML(data),
          text: this.getProfileReminderText(data),
        };

      case 'weekly-summary':
        return {
          subject: '📊 Seu Resumo Semanal',
          html: this.getWeeklySummaryHTML(data),
          text: this.getWeeklySummaryText(data),
        };

      default:
        return {
          subject: 'TreinoPro - Notificação',
          html: `<p>Template não encontrado: ${template}</p>`,
          text: `Template não encontrado: ${template}`,
        };
    }
  }

  // ===== TEMPLATES HTML =====

  private getProposalMatchHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">🎯 Nova Proposta Disponível!</h2>
        <p>Olá ${data.firstName},</p>
        <p>Uma nova proposta de treino está disponível para você:</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Detalhes da Proposta</h3>
          <p><strong>Aluno:</strong> ${data.studentName}</p>
          <p><strong>Local:</strong> ${data.location}</p>
          <p><strong>Data:</strong> ${data.date}</p>
          <p><strong>Horário:</strong> ${data.time}</p>
          <p><strong>Modalidade:</strong> ${data.modality}</p>
          <p><strong>Valor:</strong> R$ ${data.price}</p>
        </div>
        
        <p>
          <a href="${process.env.FRONTEND_URL}/proposals/${data.proposalId}" 
             style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Ver Proposta
          </a>
        </p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  private getPaymentConfirmationHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">✅ Pagamento Confirmado!</h2>
        <p>Olá ${data.firstName},</p>
        <p>Seu pagamento foi processado com sucesso:</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>ID do Pagamento:</strong> ${data.paymentId}</p>
          <p><strong>Valor:</strong> R$ ${data.amount}</p>
          <p><strong>Método:</strong> ${data.method}</p>
          <p><strong>Data da Aula:</strong> ${data.classDate}</p>
          <p><strong>Local:</strong> ${data.location}</p>
        </div>
        
        <p>Sua aula foi confirmada! Prepare-se para treinar! 💪</p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  private getPaymentReminderHTML(data: any, type: 'first' | 'final'): string {
    const urgency = type === 'final' ? '🚨 URGENTE' : '⏰';
    const timeLeft = type === 'final' ? '5 minutos' : '20 minutos';
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${type === 'final' ? '#f44336' : '#ff9800'};">${urgency} Finalize seu Pagamento</h2>
        <p>Olá ${data.firstName},</p>
        <p>Sua proposta expira em <strong>${timeLeft}</strong>!</p>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <p><strong>Local:</strong> ${data.location}</p>
          <p><strong>Valor:</strong> R$ ${data.price}</p>
          <p><strong>Expira em:</strong> ${timeLeft}</p>
        </div>
        
        <p>
          <a href="${data.paymentUrl}" 
             style="background: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Finalizar Pagamento Agora
          </a>
        </p>
        
        <p>Não perca essa oportunidade!</p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  private getClassReminderHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2196F3;">🏋️ Sua Aula é Hoje!</h2>
        <p>Olá ${data.firstName},</p>
        <p>Lembrete: você tem uma aula agendada para hoje:</p>
        
        <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Data:</strong> ${data.date}</p>
          <p><strong>Horário:</strong> ${data.time}</p>
          <p><strong>Local:</strong> ${data.location}</p>
          <p><strong>Com:</strong> ${data.partnerName}</p>
        </div>
        
        <p>Prepare-se e boa aula! 💪</p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  private getClassCancellationHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f44336;">❌ Aula Cancelada</h2>
        <p>Olá ${data.firstName},</p>
        <p>Infelizmente, sua aula foi cancelada:</p>
        
        <div style="background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Data:</strong> ${data.date}</p>
          <p><strong>Horário:</strong> ${data.time}</p>
          <p><strong>Local:</strong> ${data.location}</p>
          <p><strong>Motivo:</strong> ${data.reason}</p>
        </div>
        
        ${data.refundInfo ? `
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>💰 Reembolso:</strong> ${data.refundInfo}</p>
          </div>
        ` : ''}
        
        <p>Pedimos desculpas pelo inconveniente.</p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  private getRefundProcessedHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">💰 Reembolso Processado</h2>
        <p>Olá ${data.firstName},</p>
        <p>Seu reembolso foi processado com sucesso:</p>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Valor:</strong> R$ ${data.amount}</p>
          <p><strong>Motivo:</strong> ${data.reason}</p>
          <p><strong>Prazo:</strong> ${data.estimatedDays} dias úteis</p>
        </div>
        
        <p>O valor será creditado na sua conta em até ${data.estimatedDays} dias úteis.</p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  private getProfileReminderHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff9800;">👤 Complete seu Perfil</h2>
        <p>Olá ${data.firstName},</p>
        <p>Notamos que seu perfil ainda não está completo.</p>
        
        <p>Complete seu perfil para:</p>
        <ul>
          <li>Receber mais propostas</li>
          <li>Aumentar sua credibilidade</li>
          <li>Melhorar seus resultados</li>
        </ul>
        
        <p>
          <a href="${data.profileUrl}" 
             style="background: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Completar Perfil
          </a>
        </p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  private getWeeklySummaryHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #673AB7;">📊 Seu Resumo Semanal</h2>
        <p>Olá ${data.firstName},</p>
        <p>Aqui está o resumo da sua semana (${data.weekPeriod.start} - ${data.weekPeriod.end}):</p>
        
        <div style="background: #f3e5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Atividades</h3>
          <p><strong>Propostas criadas:</strong> ${data.proposalsCreated}</p>
          <p><strong>Aulas realizadas:</strong> ${data.classesParticipated}</p>
          <p><strong>Mensagens enviadas:</strong> ${data.messagesSent}</p>
        </div>
        
        <p>Continue assim! 🚀</p>
        
        <p>Atenciosamente,<br>Equipe TreinoPro</p>
      </div>
    `;
  }

  // ===== TEMPLATES TEXT =====

  private getProposalMatchText(data: any): string {
    return `Nova Proposta Disponível!\n\nOlá ${data.firstName},\n\nUma nova proposta de treino está disponível:\n\nAluno: ${data.studentName}\nLocal: ${data.location}\nData: ${data.date}\nHorário: ${data.time}\nModalidade: ${data.modality}\nValor: R$ ${data.price}\n\nAcesse: ${process.env.FRONTEND_URL}/proposals/${data.proposalId}\n\nAtenciosamente,\nEquipe TreinoPro`;
  }

  private getPaymentConfirmationText(data: any): string {
    return `Pagamento Confirmado!\n\nOlá ${data.firstName},\n\nSeu pagamento foi processado:\n\nID: ${data.paymentId}\nValor: R$ ${data.amount}\nMétodo: ${data.method}\nData da Aula: ${data.classDate}\nLocal: ${data.location}\n\nSua aula foi confirmada!\n\nAtenciosamente,\nEquipe TreinoPro`;
  }

  private getPaymentReminderText(data: any, type: 'first' | 'final'): string {
    const timeLeft = type === 'final' ? '5 minutos' : '20 minutos';
    return `Finalize seu Pagamento!\n\nOlá ${data.firstName},\n\nSua proposta expira em ${timeLeft}!\n\nLocal: ${data.location}\nValor: R$ ${data.price}\n\nFinalize em: ${data.paymentUrl}\n\nAtenciosamente,\nEquipe TreinoPro`;
  }

  private getClassReminderText(data: any): string {
    return `Sua Aula é Hoje!\n\nOlá ${data.firstName},\n\nLembrete de aula:\n\nData: ${data.date}\nHorário: ${data.time}\nLocal: ${data.location}\nCom: ${data.partnerName}\n\nBoa aula!\n\nAtenciosamente,\nEquipe TreinoPro`;
  }

  private getClassCancellationText(data: any): string {
    return `Aula Cancelada\n\nOlá ${data.firstName},\n\nSua aula foi cancelada:\n\nData: ${data.date}\nHorário: ${data.time}\nLocal: ${data.location}\nMotivo: ${data.reason}\n\n${data.refundInfo ? `Reembolso: ${data.refundInfo}\n\n` : ''}Pedimos desculpas.\n\nAtenciosamente,\nEquipe TreinoPro`;
  }

  private getRefundProcessedText(data: any): string {
    return `Reembolso Processado\n\nOlá ${data.firstName},\n\nSeu reembolso foi processado:\n\nValor: R$ ${data.amount}\nMotivo: ${data.reason}\nPrazo: ${data.estimatedDays} dias úteis\n\nAtenciosamente,\nEquipe TreinoPro`;
  }

  private getProfileReminderText(data: any): string {
    return `Complete seu Perfil\n\nOlá ${data.firstName},\n\nSeu perfil ainda não está completo.\n\nComplete em: ${data.profileUrl}\n\nAtenciosamente,\nEquipe TreinoPro`;
  }

  private getWeeklySummaryText(data: any): string {
    return `Resumo Semanal\n\nOlá ${data.firstName},\n\nResumo da semana (${data.weekPeriod.start} - ${data.weekPeriod.end}):\n\nPropostas criadas: ${data.proposalsCreated}\nAulas realizadas: ${data.classesParticipated}\nMensagens enviadas: ${data.messagesSent}\n\nContinue assim!\n\nAtenciosamente,\nEquipe TreinoPro`;
  }
}
