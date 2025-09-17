import { Injectable, BadRequestException } from '@nestjs/common';
import { EmailService } from '../../notifications/services/email.service';

@Injectable()
export class EmailVerificationService {
  // Em produção, isso deveria usar Redis ou banco de dados
  private verificationCodes = new Map<string, {
    code: string;
    expiresAt: Date;
    attempts: number;
    verified: boolean;
  }>();

  private verifiedEmails = new Set<string>();

  constructor(private emailService: EmailService) {}

  async sendVerificationCode(email: string, firstName: string): Promise<{ message: string; expiresAt: Date }> {
    // Validar formato do email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Formato de email inválido');
    }

    // Gerar código de 6 dígitos
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Armazenar código
    this.verificationCodes.set(email, {
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0,
      verified: false
    });

    console.log(`📧 [EMAIL_VERIFICATION] Código gerado para ${email}: ${verificationCode}`);
    console.log(`📧 [EMAIL_VERIFICATION] Expira em: ${expiresAt.toISOString()}`);

    // Enviar email com código
    try {
       await this.emailService.sendTemplateEmail(email, 'email-verification', {
        firstName: firstName,
        code: verificationCode,
        expiresAt: expiresAt.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      });
      console.log(`✅ [EMAIL_VERIFICATION] Email enviado com sucesso para ${email}`);
    } catch (error) {
      console.error(`❌ [EMAIL_VERIFICATION] Erro ao enviar email para ${email}:`, error);
      // Continuar mesmo se o email falhar (para desenvolvimento)
    }

    return {
      message: 'Código de verificação enviado com sucesso',
      expiresAt: expiresAt
    };
  }

  async verifyCode(email: string, code: string): Promise<{ message: string; verified: boolean }> {
    const storedData = this.verificationCodes.get(email);
    if (!storedData) {
      throw new BadRequestException('Nenhum código foi enviado para este email');
    }

    // Verificar se o código expirou
    if (new Date() > storedData.expiresAt) {
      this.verificationCodes.delete(email);
      throw new BadRequestException('Código expirado. Solicite um novo código');
    }

    // Verificar número de tentativas (máximo 3)
    if (storedData.attempts >= 3) {
      this.verificationCodes.delete(email);
      throw new BadRequestException('Muitas tentativas inválidas. Solicite um novo código');
    }

    // Verificar se o código está correto
    if (storedData.code !== code) {
      storedData.attempts++;
      this.verificationCodes.set(email, storedData);
      throw new BadRequestException(`Código inválido. Tentativas restantes: ${3 - storedData.attempts}`);
    }

    // Código correto - marcar como verificado
    storedData.verified = true;
    this.verificationCodes.set(email, storedData);
    this.verifiedEmails.add(email);
    
    console.log('✅ [EMAIL_VERIFICATION] Código verificado com sucesso para:', email);

    return {
      message: 'Código verificado com sucesso',
      verified: true
    };
  }

  async isEmailVerified(email: string): Promise<boolean> {
    return this.verifiedEmails.has(email);
  }

  // Método para limpar dados expirados (chamado periodicamente)
  cleanExpiredCodes(): void {
    const now = new Date();
    for (const [email, data] of this.verificationCodes.entries()) {
      if (now > data.expiresAt) {
        this.verificationCodes.delete(email);
        console.log(`🧹 [EMAIL_VERIFICATION] Código expirado removido para: ${email}`);
      }
    }
  }
}