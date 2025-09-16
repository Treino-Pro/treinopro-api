import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { financialProfiles, withdrawalRequests, userWallets, users } from '../../database/schema';
// Removido import incorreto - usando DATABASE_CONNECTION via @Inject
import {
  UpdateFinancialProfileDto,
  FinancialProfileResponseDto,
  ValidateBankAccountDto,
  ValidateMercadoPagoDto,
  WithdrawalRequestDto,
  WithdrawalHistoryDto,
  PersonalFinancialStatsDto,
  PaymentMethod,
  AccountType,
} from './dto/financial-profile.dto';

@Injectable()
export class FinancialProfileService {
  constructor(@Inject('DATABASE_CONNECTION') private db: any) {}

  // Buscar perfil financeiro do usuário
  async getFinancialProfile(userId: string): Promise<FinancialProfileResponseDto> {
    const profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.userId, userId),
      with: {
        user: true,
      },
    });

    if (!profile) {
      // Criar perfil padrão se não existir
      return this.createDefaultProfile(userId);
    }

    return this.formatProfileResponse(profile);
  }

  // Criar perfil padrão
  private async createDefaultProfile(userId: string): Promise<FinancialProfileResponseDto> {
    const [newProfile] = await this.db
      .insert(financialProfiles)
      .values({
        userId,
        preferredMethod: PaymentMethod.BANK_TRANSFER,
        isComplete: false,
        canReceivePayments: false,
      })
      .returning();

    return this.formatProfileResponse(newProfile);
  }

  // Atualizar perfil financeiro
  async updateFinancialProfile(
    userId: string,
    updateDto: UpdateFinancialProfileDto,
  ): Promise<FinancialProfileResponseDto> {
    // Verificar se o usuário é personal trainer
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || user.role !== 'personal') {
      throw new ForbiddenException('Apenas personal trainers podem configurar perfil financeiro');
    }

    // Validar dados baseado no método escolhido
    await this.validateProfileData(updateDto);

    // Buscar perfil existente ou criar
    let profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.userId, userId),
    });

    const updateData: any = {
      preferredMethod: updateDto.preferredMethod,
      lastUpdatedAt: new Date(),
      updatedAt: new Date(),
      notes: updateDto.notes,
    };

    // Dados bancários
    if (updateDto.bankAccount) {
      updateData.bankCode = updateDto.bankAccount.bankCode;
      updateData.bankName = updateDto.bankAccount.bankName;
      updateData.accountType = updateDto.bankAccount.accountType;
      updateData.accountNumber = updateDto.bankAccount.accountNumber;
      updateData.agency = updateDto.bankAccount.agency;
      updateData.accountHolderName = updateDto.bankAccount.accountHolderName;
      updateData.document = updateDto.bankAccount.document;
    }

    // Dados do Mercado Pago
    if (updateDto.mercadoPagoAccount) {
      updateData.mpEmail = updateDto.mercadoPagoAccount.email;
      updateData.mpUserId = updateDto.mercadoPagoAccount.userId;
      updateData.mpAccessToken = updateDto.mercadoPagoAccount.accessToken;
      updateData.mpIsVerified = false; // Requer verificação
    }

    // Verificar se o perfil está completo
    updateData.isComplete = this.checkProfileCompleteness(updateDto);
    updateData.canReceivePayments = updateData.isComplete;

    if (profile) {
      // Atualizar perfil existente
      const [updatedProfile] = await this.db
        .update(financialProfiles)
        .set(updateData)
        .where(eq(financialProfiles.userId, userId))
        .returning();

      return this.formatProfileResponse(updatedProfile);
    } else {
      // Criar novo perfil
      const [newProfile] = await this.db
        .insert(financialProfiles)
        .values({
          userId,
          ...updateData,
        })
        .returning();

      return this.formatProfileResponse(newProfile);
    }
  }

  // Validar dados do perfil
  private async validateProfileData(updateDto: UpdateFinancialProfileDto): Promise<void> {
    if (updateDto.preferredMethod === PaymentMethod.BANK_TRANSFER) {
      if (!updateDto.bankAccount) {
        throw new BadRequestException('Dados bancários são obrigatórios para transferência bancária');
      }
      
      // Validar dados bancários
      await this.validateBankAccount({
        bankCode: updateDto.bankAccount.bankCode,
        agency: updateDto.bankAccount.agency,
        accountNumber: updateDto.bankAccount.accountNumber,
        document: updateDto.bankAccount.document,
      });
    }

    if (updateDto.preferredMethod === PaymentMethod.MERCADO_PAGO) {
      if (!updateDto.mercadoPagoAccount) {
        throw new BadRequestException('Dados do Mercado Pago são obrigatórios');
      }
      
      // Validar email do MP
      await this.validateMercadoPago({
        email: updateDto.mercadoPagoAccount.email,
        accessToken: updateDto.mercadoPagoAccount.accessToken,
      });
    }
  }

  // Verificar se perfil está completo
  private checkProfileCompleteness(updateDto: UpdateFinancialProfileDto): boolean {
    if (updateDto.preferredMethod === PaymentMethod.BANK_TRANSFER) {
      const bank = updateDto.bankAccount;
      return !!(bank?.bankCode && bank?.accountNumber && bank?.agency && bank?.document && bank?.accountHolderName);
    }

    if (updateDto.preferredMethod === PaymentMethod.MERCADO_PAGO) {
      const mp = updateDto.mercadoPagoAccount;
      return !!(mp?.email);
    }

    return false;
  }

  // Validar conta bancária
  async validateBankAccount(validateDto: ValidateBankAccountDto): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validar código do banco (3 dígitos)
    if (!/^\d{3}$/.test(validateDto.bankCode)) {
      errors.push('Código do banco deve ter 3 dígitos');
    }

    // Validar agência
    if (!/^\d{4}-?\d?$/.test(validateDto.agency)) {
      errors.push('Agência deve ter formato 1234 ou 1234-5');
    }

    // Validar conta
    if (!/^\d{1,10}-?\d?$/.test(validateDto.accountNumber)) {
      errors.push('Número da conta inválido');
    }

    // Validar CPF/CNPJ
    if (!/^\d{11}$|^\d{14}$/.test(validateDto.document)) {
      errors.push('CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos');
    }

    // Aqui você pode adicionar validações mais avançadas:
    // - Consulta à API do banco central
    // - Validação de CPF/CNPJ com dígitos verificadores
    // - Verificação se a conta existe

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Validar Mercado Pago
  async validateMercadoPago(validateDto: ValidateMercadoPagoDto): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(validateDto.email)) {
      errors.push('Email inválido');
    }

    // Aqui você pode adicionar validações com a API do MP:
    // - Verificar se a conta existe
    // - Validar access token se fornecido
    // - Verificar status da conta

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Solicitar saque
  async requestWithdrawal(userId: string, withdrawalDto: WithdrawalRequestDto): Promise<WithdrawalHistoryDto> {
    // Verificar perfil financeiro
    const profile = await this.getFinancialProfile(userId);
    if (!profile.canReceivePayments) {
      throw new BadRequestException('Perfil financeiro incompleto. Configure seus dados primeiro.');
    }

    // Verificar saldo disponível
    const wallet = await this.db.query.userWallets.findFirst({
      where: eq(userWallets.userId, userId),
    });

    if (!wallet) {
      throw new NotFoundException('Carteira não encontrada');
    }

    const requestedAmount = parseFloat(withdrawalDto.amount);
    const availableBalance = parseFloat(wallet.availableBalance);

    if (requestedAmount > availableBalance) {
      throw new BadRequestException(`Saldo insuficiente. Disponível: R$ ${availableBalance.toFixed(2)}`);
    }

    // Calcular taxa
    const fee = this.calculateWithdrawalFee(requestedAmount, withdrawalDto.method, withdrawalDto.urgency);
    const netAmount = requestedAmount - fee;

    // Criar solicitação de saque
    const [withdrawalRequest] = await this.db
      .insert(withdrawalRequests)
      .values({
        userId,
        walletId: wallet.id,
        amount: withdrawalDto.amount,
        fee: fee.toString(),
        netAmount: netAmount.toString(),
        method: withdrawalDto.method,
        urgency: withdrawalDto.urgency || 'normal',
        description: withdrawalDto.description,
        status: 'pending',
        transferData: {
          profile: profile,
          requestedAt: new Date(),
        },
      })
      .returning();

    // Atualizar saldo da carteira (reservar o valor)
    await this.db
      .update(userWallets)
      .set({
        availableBalance: (availableBalance - requestedAmount).toString(),
        pendingBalance: (parseFloat(wallet.pendingBalance) + requestedAmount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, userId));

    return this.formatWithdrawalResponse(withdrawalRequest);
  }

  // Calcular taxa de saque
  private calculateWithdrawalFee(amount: number, method: PaymentMethod, urgency?: string): number {
    let fee = 0;

    if (method === PaymentMethod.BANK_TRANSFER) {
      fee = urgency === 'urgent' ? 5.00 : 2.00; // Taxa fixa
    } else if (method === PaymentMethod.MERCADO_PAGO) {
      fee = amount * 0.01; // 1% do valor
    }

    return fee;
  }

  // Listar histórico de saques
  async getWithdrawalHistory(userId: string): Promise<WithdrawalHistoryDto[]> {
    const withdrawals = await this.db.query.withdrawalRequests.findMany({
      where: eq(withdrawalRequests.userId, userId),
      orderBy: desc(withdrawalRequests.createdAt),
      limit: 50,
    });

    return withdrawals.map(w => this.formatWithdrawalResponse(w));
  }

  // Obter estatísticas financeiras
  async getPersonalFinancialStats(userId: string): Promise<PersonalFinancialStatsDto> {
    // Buscar carteira
    const wallet = await this.db.query.userWallets.findFirst({
      where: eq(userWallets.userId, userId),
    });

    if (!wallet) {
      throw new NotFoundException('Carteira não encontrada');
    }

    // Buscar perfil
    const profile = await this.getFinancialProfile(userId);

    // Buscar saques recentes
    const recentWithdrawals = await this.getWithdrawalHistory(userId);

    // Calcular estatísticas do mês (implementar lógica mais complexa se necessário)
    const thisMonth = {
      earned: wallet.totalEarned,
      withdrawn: wallet.totalWithdrawn,
      classesCompleted: 0, // Implementar consulta às aulas
      averagePerClass: '0.00',
    };

    return {
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      thisMonth,
      recentWithdrawals: recentWithdrawals.slice(0, 5),
      upcomingPayments: [], // Implementar se necessário
      profileStatus: {
        isComplete: profile.isComplete,
        canReceivePayments: profile.canReceivePayments,
        missingFields: this.getMissingFields(profile),
        verificationStatus: 'pending',
      },
    };
  }

  // Obter campos faltantes
  private getMissingFields(profile: FinancialProfileResponseDto): string[] {
    const missing: string[] = [];

    if (profile.preferredMethod === PaymentMethod.BANK_TRANSFER) {
      if (!profile.bankAccount?.bankCode) missing.push('Código do banco');
      if (!profile.bankAccount?.accountNumber) missing.push('Número da conta');
      if (!profile.bankAccount?.agency) missing.push('Agência');
      if (!profile.bankAccount?.accountHolderName) missing.push('Nome do titular');
      if (!profile.bankAccount?.document) missing.push('CPF/CNPJ');
    }

    if (profile.preferredMethod === PaymentMethod.MERCADO_PAGO) {
      if (!profile.mercadoPagoAccount?.email) missing.push('Email do Mercado Pago');
    }

    return missing;
  }

  // Formatar resposta do perfil
  private formatProfileResponse(profile: any): FinancialProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      preferredMethod: profile.preferredMethod,
      isComplete: profile.isComplete,
      bankAccount: profile.bankCode ? {
        bankCode: profile.bankCode,
        bankName: profile.bankName,
        accountType: profile.accountType,
        accountNumber: this.maskAccountNumber(profile.accountNumber),
        agency: this.maskAgency(profile.agency),
        accountHolderName: profile.accountHolderName,
        document: this.maskDocument(profile.document),
      } : undefined,
      mercadoPagoAccount: profile.mpEmail ? {
        email: this.maskEmail(profile.mpEmail),
        userId: profile.mpUserId,
        isVerified: profile.mpIsVerified,
      } : undefined,
      canReceivePayments: profile.canReceivePayments,
      lastUpdatedAt: profile.lastUpdatedAt,
      verifiedAt: profile.verifiedAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  // Formatar resposta do saque
  private formatWithdrawalResponse(withdrawal: any): WithdrawalHistoryDto {
    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      method: withdrawal.method,
      status: withdrawal.status,
      description: withdrawal.description,
      urgency: withdrawal.urgency,
      transactionId: withdrawal.transactionId,
      processedAt: withdrawal.processedAt,
      completedAt: withdrawal.completedAt,
      failureReason: withdrawal.failureReason,
      fee: withdrawal.fee,
      netAmount: withdrawal.netAmount,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }

  // Métodos de mascaramento para segurança
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }

  private maskAccountNumber(account: string): string {
    if (!account) return '';
    return account.replace(/\d(?=\d{2})/g, '*');
  }

  private maskAgency(agency: string): string {
    if (!agency) return '';
    return agency.replace(/\d(?=\d{1})/g, '*');
  }

  private maskDocument(document: string): string {
    if (!document) return '';
    if (document.length === 11) {
      // CPF: 123.456.789-12 -> ***.456.789-**
      return `***.${document.substring(3, 6)}.${document.substring(6, 9)}-**`;
    } else if (document.length === 14) {
      // CNPJ: 12.345.678/0001-90 -> **.345.678/0001-**
      return `**.${document.substring(2, 5)}.${document.substring(5, 8)}/${document.substring(8, 12)}-**`;
    }
    return document;
  }
}
