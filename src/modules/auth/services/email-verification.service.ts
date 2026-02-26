import { Injectable, BadRequestException } from '@nestjs/common';
import { EmailService } from '../../notifications/services/email.service';

@Injectable()
export class EmailVerificationService {
  // Em produção, isso deveria usar Redis ou banco de dados
  private verificationCodes = new Map<
    string,
    {
      code: string;
      expiresAt: Date;
      attempts: number;
      verified: boolean;
    }
  >();

  private verifiedEmails = new Set<string>();

  constructor(private emailService: EmailService) {}

  /**
   * Normaliza email para garantir consistência (trim + lowercase)
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async sendVerificationCode(
    email: string,
    firstName: string,
  ): Promise<{ message: string; expiresAt: Date }> {
    // Normalizar email
    const normalizedEmail = this.normalizeEmail(email);

    // Validar formato do email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new BadRequestException('Formato de email inválido');
    }

    // Gerar código de 6 dígitos
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Armazenar código com email normalizado
    this.verificationCodes.set(normalizedEmail, {
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0,
      verified: false,
    });

    // Enviar email com código
    try {
      await this.emailService.sendTemplateEmail(normalizedEmail, 'email-verification', {
        firstName: firstName,
        code: verificationCode,
        expiresAt: expiresAt.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    } catch (error) {
      console.error(
        `❌ [EMAIL_VERIFICATION] Erro ao enviar email para ${normalizedEmail}:`,
        error,
      );
      // Continuar mesmo se o email falhar (para desenvolvimento)
    }

    return {
      message: 'Código de verificação enviado com sucesso',
      expiresAt: expiresAt,
    };
  }

  async sendPasswordResetCode(
    email: string,
    firstName: string,
  ): Promise<{ message: string; expiresAt: Date }> {
    // Normalizar email
    const normalizedEmail = this.normalizeEmail(email);

    // Validar formato do email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new BadRequestException('Formato de email inválido');
    }

    // Gerar código de 6 dígitos
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Armazenar código com email normalizado
    this.verificationCodes.set(normalizedEmail, {
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0,
      verified: false,
    });

    // Enviar email com template específico de recuperação de senha
    try {
      await this.emailService.sendTemplateEmail(normalizedEmail, 'password-reset', {
        firstName: firstName,
        code: verificationCode,
        expiresAt: expiresAt.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    } catch (error) {
      console.error(
        `❌ [EMAIL_VERIFICATION] Erro ao enviar email de recuperação para ${normalizedEmail}:`,
        error,
      );
      // Continuar mesmo se o email falhar (para desenvolvimento)
    }

    return {
      message: 'Código de recuperação enviado com sucesso',
      expiresAt: expiresAt,
    };
  }

  async verifyCode(
    email: string,
    code: string,
  ): Promise<{ message: string; verified: boolean }> {
    // Normalizar email
    const normalizedEmail = this.normalizeEmail(email);
    const storedData = this.verificationCodes.get(normalizedEmail);
    if (!storedData) {
      throw new BadRequestException(
        'Nenhum código foi enviado para este email',
      );
    }

    // Verificar se o código expirou
    if (new Date() > storedData.expiresAt) {
      this.verificationCodes.delete(normalizedEmail);
      throw new BadRequestException('Código expirado. Solicite um novo código');
    }

    // Verificar número de tentativas (máximo 3)
    if (storedData.attempts >= 3) {
      this.verificationCodes.delete(normalizedEmail);
      throw new BadRequestException(
        'Muitas tentativas inválidas. Solicite um novo código',
      );
    }

    // Verificar se o código está correto
    if (storedData.code !== code) {
      storedData.attempts++;
      this.verificationCodes.set(normalizedEmail, storedData);
      throw new BadRequestException(
        `Código inválido. Tentativas restantes: ${3 - storedData.attempts}`,
      );
    }

    // Código correto - marcar como verificado
    storedData.verified = true;
    this.verificationCodes.set(normalizedEmail, storedData);
    this.verifiedEmails.add(normalizedEmail);

    return {
      message: 'Código verificado com sucesso',
      verified: true,
    };
  }

  async isEmailVerified(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);
    return this.verifiedEmails.has(normalizedEmail);
  }

  async isCodeVerified(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);
    const storedData = this.verificationCodes.get(normalizedEmail);
    return storedData ? storedData.verified : false;
  }

  // Método para limpar dados expirados (chamado periodicamente)
  cleanExpiredCodes(): void {
    const now = new Date();
    for (const [email, data] of this.verificationCodes.entries()) {
      if (now > data.expiresAt) {
        this.verificationCodes.delete(email);
      }
    }
  }
}
