import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.setupTransporter();
    this.verifyConnection();
  }

  private setupTransporter(): void {
    // Configurar transporter baseado nas variáveis de ambiente
    if (process.env.NODE_ENV === 'production' || process.env.EMAIL_HOST) {
      // Produção ou quando EMAIL_HOST está configurado - usar servidor SMTP próprio
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_PORT === '465', // true para 465, false para outras portas
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          // Configurações TLS para melhor compatibilidade
          rejectUnauthorized: false,
          ciphers: 'SSLv3'
        },
        // Configurações adicionais para Hostinger
        connectionTimeout: 60000, // 60 segundos
        greetingTimeout: 30000,   // 30 segundos
        socketTimeout: 60000,     // 60 segundos
        debug: process.env.NODE_ENV === 'development', // Habilitar debug em desenvolvimento
        logger: process.env.NODE_ENV === 'development' // Logs detalhados em desenvolvimento
      });
      this.logger.log('📧 Servidor SMTP próprio configurado');
      this.logger.log(`🔧 Host: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
      this.logger.log(`👤 User: ${process.env.EMAIL_USER}`);
    } else {
      // Desenvolvimento - usar Ethereal Email para testes
      this.setupEtherealTransporter();
    }
  }

  private async setupAlternativeSMTP(): Promise<boolean> {
    // Tentar configuração alternativa para Hostinger (porta 587)
    if (process.env.EMAIL_HOST === 'smtp.hostinger.com' && process.env.EMAIL_PORT === '465') {
      this.logger.warn('🔄 Tentando configuração alternativa (porta 587)...');
      
      try {
        this.transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: 587,
          secure: false, // TLS na porta 587
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
          tls: {
            rejectUnauthorized: false,
            ciphers: 'SSLv3'
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
        });
        
        await this.transporter.verify();
        this.logger.log('✅ Configuração alternativa funcionou!');
        return true;
      } catch (error) {
        this.logger.error('❌ Configuração alternativa também falhou:', error.message);
        return false;
      }
    }
    
    return false;
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

  private async verifyConnection(): Promise<void> {
    if (!this.transporter) return;
    
    try {
      await this.transporter.verify();
      this.logger.log('✅ Conexão SMTP verificada com sucesso');
    } catch (error) {
      this.logger.error('❌ Falha na verificação da conexão SMTP:', error);
      
      // Tentar configuração alternativa primeiro
      const alternativeWorked = await this.setupAlternativeSMTP();
      
      if (!alternativeWorked && process.env.NODE_ENV === 'development') {
        this.logger.warn('🔄 Tentando usar Ethereal Email como fallback...');
        await this.setupEtherealTransporter();
      }
    }
  }

  async sendTemplateEmail(to: string, template: string, data: Record<string, any>): Promise<void> {
    const emailContent = this.getEmailTemplate(template, data);
    
    const mailOptions = {
      from: `"TreinoPro" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    };

    try {
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
      
      // Se for erro de autenticação, tentar configuração alternativa primeiro
      if (error.code === 'EAUTH') {
        this.logger.warn('🔄 Erro de autenticação detectado, tentando configuração alternativa...');
        
        // Tentar configuração alternativa
        const alternativeWorked = await this.setupAlternativeSMTP();
        
        if (alternativeWorked) {
          try {
            const result = await this.transporter.sendMail(mailOptions);
            this.logger.log(`✅ Email enviado via configuração alternativa para ${to} (${template})`);
            return;
          } catch (altError) {
            this.logger.error('❌ Configuração alternativa falhou:', altError.message);
          }
        }
        
        // Se ainda estiver em desenvolvimento, tentar Ethereal
        if (process.env.NODE_ENV === 'development') {
          this.logger.warn('🔄 Tentando Ethereal Email como último recurso...');
          try {
            await this.setupEtherealTransporter();
            const result = await this.transporter.sendMail(mailOptions);
            this.logger.log(`✅ Email enviado via Ethereal para ${to} (${template})`);
            return;
          } catch (fallbackError) {
            this.logger.error('❌ Fallback Ethereal também falhou:', fallbackError);
          }
        }
      }
      
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

      case 'verification-code':
        return {
          subject: '🔐 Seu código de verificação - TreinoPro',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
              <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #2c3e50; margin-bottom: 10px;">TreinoPro</h1>
                  <h2 style="color: #34495e; font-weight: normal;">Código de Verificação</h2>
                </div>
                
                <p style="color: #555; font-size: 16px; line-height: 1.5;">
                  Olá, <strong>${data.firstName}</strong>!
                </p>
                
                <p style="color: #555; font-size: 16px; line-height: 1.5;">
                  Use o código abaixo para verificar seu email e concluir seu cadastro:
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <div style="background-color: #f8f9fa; border: 2px dashed #dee2e6; padding: 20px; border-radius: 8px; display: inline-block;">
                    <span style="font-size: 32px; font-weight: bold; color: #2c3e50; letter-spacing: 5px; font-family: monospace;">
                      ${data.code}
                    </span>
                  </div>
                </div>
                
                <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p style="color: #856404; margin: 0; font-size: 14px;">
                    ⏰ <strong>Este código expira em:</strong> ${data.expiresAt}
                  </p>
                </div>
                
                <p style="color: #777; font-size: 14px; line-height: 1.5; margin-top: 30px;">
                  Se você não solicitou este código, pode ignorar este email com segurança.
                </p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                  © 2024 TreinoPro. Todos os direitos reservados.
                </p>
              </div>
            </div>
          `,
          text: `TreinoPro - Código de Verificação\n\nOlá, ${data.firstName}!\n\nUse o código abaixo para verificar seu email:\n\n${data.code}\n\nEste código expira em: ${data.expiresAt}\n\nSe você não solicitou este código, pode ignorar este email.\n\n© 2024 TreinoPro`
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

      case 'email-verification':
        return {
          subject: 'Confirme seu cadastro no TreinoPro',
          html: this.getEmailVerificationHTML(data),
          text: this.getEmailVerificationText(data),
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

  private getEmailVerificationHTML(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">TreinoPro</h1>
          <p style="color: #7f8c8d; margin: 5px 0; font-size: 14px;">Confirmação de Cadastro</p>
        </div>
        
        <div style="padding: 30px 20px; text-align: center;">
          <h2 style="color: #2c3e50; margin-bottom: 20px; font-size: 20px;">Confirme seu cadastro</h2>
          <p style="color: #34495e; margin-bottom: 25px; font-size: 16px; line-height: 1.5;">Olá ${data.firstName},</p>
          <p style="color: #34495e; margin-bottom: 30px; font-size: 16px; line-height: 1.5;">Para finalizar seu cadastro, use o código abaixo:</p>
          
          <div style="background: #ecf0f1; border: 2px solid #bdc3c7; padding: 25px; border-radius: 8px; margin: 30px 0; display: inline-block;">
            <span style="font-size: 28px; font-weight: bold; color: #2c3e50; letter-spacing: 4px; font-family: monospace;">
              ${data.code}
            </span>
          </div>
          
          <p style="color: #7f8c8d; font-size: 14px; margin-top: 20px;">
            Este código é válido por 10 minutos
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3498db;">
          <p style="color: #2c3e50; margin: 0; font-size: 14px; line-height: 1.4;">
            <strong>Dica de segurança:</strong> Nunca compartilhe este código com outras pessoas. Nossa equipe nunca solicitará este código por telefone ou email.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #7f8c8d; font-size: 14px; margin: 0;">
            Equipe TreinoPro<br>
            <span style="font-size: 12px;">Este é um email automático, não responda.</span>
          </p>
        </div>
      </div>
    `;
  }

  private getEmailVerificationText(data: any): string {
    return `TreinoPro - Verificação de Email\n\nOlá ${data.firstName},\n\nUse o código abaixo para verificar seu email:\n\nCódigo: ${data.code}\n\nEste código expira em 10 minutos.\n\nSe você não solicitou este código, ignore este email.\n\nAtenciosamente,\nEquipe TreinoPro`;
  }
}
