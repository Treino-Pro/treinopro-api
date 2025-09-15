import { Injectable, Logger } from '@nestjs/common';
import { Twilio } from 'twilio';

@Injectable()
export class SMSService {
  private readonly logger = new Logger(SMSService.name);
  private twilioClient: Twilio | null = null;
  private isConfigured = false;

  constructor() {
    this.initializeTwilio();
  }

  private initializeTwilio(): void {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (accountSid && authToken) {
        this.twilioClient = new Twilio(accountSid, authToken);
        this.isConfigured = true;
        this.logger.log('📱 Twilio SMS configurado com sucesso');
      } else {
        this.logger.warn('⚠️ Credenciais do Twilio não encontradas - SMS desabilitado');
      }
    } catch (error) {
      this.logger.error('❌ Erro ao inicializar Twilio:', error);
    }
  }

  async sendTemplateSMS(to: string, template: string, data: Record<string, any>): Promise<void> {
    if (!this.isConfigured || !this.twilioClient) {
      this.logger.warn(`📱 [MOCK] SMS enviado para ${to} (${template}) - Twilio não configurado`);
      return;
    }

    try {
      const message = this.getSMSTemplate(template, data);
      
      // Garantir que o número tenha o formato correto (+55...)
      const formattedPhone = this.formatPhoneNumber(to);
      
      const response = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
        to: formattedPhone,
      });

      this.logger.log(`📱 SMS enviado com sucesso para ${to}: ${response.sid}`);

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar SMS para ${to}:`, error);
      throw error;
    }
  }

  async sendBulkSMS(recipients: string[], template: string, data: Record<string, any>): Promise<void> {
    const promises = recipients.map(phone => 
      this.sendTemplateSMS(phone, template, data)
    );

    await Promise.allSettled(promises);
    this.logger.log(`📱 ${recipients.length} SMS enviados em lote`);
  }

  private getSMSTemplate(template: string, data: Record<string, any>): string {
    switch (template) {
      case 'payment-reminder-first':
        return `TreinoPro: Olá ${data.firstName}! Sua proposta expira em 20 min. Finalize: ${data.paymentUrl}`;

      case 'payment-reminder-final':
        return `TreinoPro: URGENTE! ${data.firstName}, sua proposta expira em 5 min! Pague: ${data.paymentUrl}`;

      case 'payment-confirmation':
        return `TreinoPro: Pagamento confirmado! Sua aula em ${data.location} está garantida. ID: ${data.paymentId}`;

      case 'class-reminder':
        return `TreinoPro: Lembrete! Sua aula é hoje às ${data.time} em ${data.location} com ${data.partnerName}`;

      case 'class-started':
        return `TreinoPro: ${data.partnerName} iniciou a aula. Confirme sua presença no app!`;

      case 'class-cancellation':
        return `TreinoPro: Sua aula de ${data.date} foi cancelada. ${data.refundInfo ? 'Reembolso processado.' : 'Motivo: ' + data.reason}`;

      case 'refund-processed':
        return `TreinoPro: Reembolso de R$ ${data.amount} processado. Valor será creditado em ${data.estimatedDays} dias úteis`;

      case 'verification-code':
        return `TreinoPro: Seu código de verificação é: ${data.code}. Válido por 10 minutos.`;

      case 'password-reset':
        return `TreinoPro: Código para redefinir senha: ${data.code}. Não compartilhe este código.`;

      case 'new-proposal':
        return `TreinoPro: Nova proposta! ${data.studentName} quer treinar em ${data.location} por R$ ${data.price}. Veja no app!`;

      case 'proposal-accepted':
        return `TreinoPro: Sua proposta foi aceita por ${data.personalName}! Aula confirmada para ${data.date} às ${data.time}`;

      case 'dispute-resolved':
        return `TreinoPro: Sua disputa foi resolvida. Status: ${data.resolution}. Verifique os detalhes no app.`;

      default:
        return `TreinoPro: ${data.message || 'Você tem uma nova notificação. Verifique o app!'}`;
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Remove todos os caracteres não numéricos
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Se começar com 0, remove
    if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    
    // Se não começar com código do país, adiciona +55 (Brasil)
    if (!cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // Adiciona o + no início
    return '+' + cleanPhone;
  }

  // ===== VALIDAÇÃO DE NÚMEROS =====

  async validatePhoneNumber(phone: string): Promise<boolean> {
    if (!this.isConfigured || !this.twilioClient) {
      this.logger.warn('📱 [MOCK] Número validado (Twilio não configurado)');
      return true;
    }

    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      
      const lookup = await this.twilioClient.lookups.v1
        .phoneNumbers(formattedPhone)
        .fetch();

      return lookup.phoneNumber !== null;
    } catch (error) {
      this.logger.warn(`⚠️ Número inválido: ${phone} - ${error.message}`);
      return false;
    }
  }

  // ===== TEMPLATES ESPECÍFICOS =====

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    await this.sendTemplateSMS(phone, 'verification-code', { code });
  }

  async sendPasswordResetCode(phone: string, code: string): Promise<void> {
    await this.sendTemplateSMS(phone, 'password-reset', { code });
  }

  async sendPaymentReminder(phone: string, reminderData: any): Promise<void> {
    const template = reminderData.reminderType === 'final' 
      ? 'payment-reminder-final' 
      : 'payment-reminder-first';
    
    await this.sendTemplateSMS(phone, template, reminderData);
  }

  async sendClassReminder(phone: string, classData: any): Promise<void> {
    await this.sendTemplateSMS(phone, 'class-reminder', classData);
  }

  async sendProposalNotification(phone: string, proposalData: any): Promise<void> {
    await this.sendTemplateSMS(phone, 'new-proposal', proposalData);
  }

  async sendProposalAcceptedNotification(phone: string, acceptanceData: any): Promise<void> {
    await this.sendTemplateSMS(phone, 'proposal-accepted', acceptanceData);
  }

  // ===== UTILITÁRIOS =====

  async getDeliveryStatus(messageSid: string): Promise<string> {
    if (!this.isConfigured || !this.twilioClient) {
      return 'unknown';
    }

    try {
      const message = await this.twilioClient.messages(messageSid).fetch();
      return message.status;
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar status da mensagem ${messageSid}:`, error);
      return 'unknown';
    }
  }

  async getSMSStats(): Promise<any> {
    // TODO: Implementar estatísticas de SMS
    return {
      sent: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
    };
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }
}
