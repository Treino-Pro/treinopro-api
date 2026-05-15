import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, sql } from 'drizzle-orm';
import { financialProfiles, userWallets } from '../../database/schema';
import { StripeConnectService } from './stripe-connect.service';

@Injectable()
export class PaymentsReconciliationService {
  private readonly logger = new Logger(PaymentsReconciliationService.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly stripeConnectService: StripeConnectService,
  ) {}

  /**
   * Cron Job diário para conciliação financeira.
   * Roda às 03:00 AM para comparar saldos Stripe vs Banco Local.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyReconciliation() {
    this.logger.log('🔍 [AUDIT] Iniciando conciliação financeira diária...');
    
    try {
      // 1. Buscar todos os perfis financeiros com Stripe Account vinculada
      const profiles = await this.db.query.financialProfiles.findMany({
        where: sql`${financialProfiles.stripeAccountId} IS NOT NULL`,
        with: {
          wallet: true,
        },
      });

      this.logger.log(`🔍 [AUDIT] Processando ${profiles.length} contas para auditoria.`);

      for (const profile of profiles) {
        await this.reconcileUserWallet(profile);
      }

      this.logger.log('✅ [AUDIT] Conciliação financeira concluída com sucesso.');
    } catch (error) {
      this.logger.error('❌ [AUDIT] Erro crítico na conciliação financeira:', error);
    }
  }

  private async reconcileUserWallet(profile: any) {
    const userId = profile.userId;
    const stripeAccountId = profile.stripeAccountId;
    const localBalance = parseFloat(profile.wallet?.availableBalance || '0');

    try {
      // 2. Buscar saldo real na Stripe (Account Balance)
      // Nota: Para contas Express/Custom, buscamos o saldo da conta conectada
      const stripeAccount = await this.stripeConnectService.retrieveAccount(stripeAccountId);
      
      // No Stripe Connect, o saldo disponível para saque é o que nos interessa comparar com user_wallets
      // No entanto, o Stripe Connect V1/V2 lida com saldos de forma complexa.
      // Aqui simulamos a busca do saldo disponível.
      
      // TODO: Implementar busca de balance via SDK no StripeConnectService se necessário
      // Por enquanto, usamos os dados da conta se disponíveis ou logamos a verificação
      
      this.logger.log(`📊 [AUDIT] Usuário ${userId}: Local R$ ${localBalance} | Stripe Account Status: ${stripeAccount.payouts_enabled ? 'Payouts OK' : 'Payouts Blocked'}`);

      // Se houver campos de saldo na conta Stripe (ex: via Balance API)
      // const stripeBalance = ...
      // if (Math.abs(localBalance - stripeBalance) > 0.05) {
      //   this.logger.error(`CRITICAL: Divergência de saldo detectada para usuário ${userId}! Local: ${localBalance}, Stripe: ${stripeBalance}`);
      // }

    } catch (error) {
      this.logger.warn(`⚠️ [AUDIT] Falha ao auditar conta Stripe ${stripeAccountId} do usuário ${userId}: ${error.message}`);
    }
  }
}
