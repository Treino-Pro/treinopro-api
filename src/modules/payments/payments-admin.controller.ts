import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Logger,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaymentsService } from './payments.service';
import { StripeConnectService } from './stripe-connect.service';
import { eq, desc } from 'drizzle-orm';
import { paymentDisputes, payments } from '../../database/schema';
import { Inject } from '@nestjs/common';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PaymentsAdminController {
  private readonly logger = new Logger(PaymentsAdminController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripeConnectService: StripeConnectService,
    @Inject('DATABASE_CONNECTION') private readonly db: any,
  ) {}

  /**
   * Lista todas as disputas registradas no sistema
   */
  @Get('disputes')
  async listDisputes(
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    this.logger.log('👨‍✈️ [ADMIN] Listando disputas financeiras');
    
    const disputes = await this.db.query.paymentDisputes.findMany({
      with: {
        payment: true,
      },
      orderBy: [desc(paymentDisputes.createdAt)],
      limit,
      offset,
    });

    return {
      success: true,
      data: disputes,
    };
  }

  /**
   * Visualiza a conciliação de saldo de um personal em tempo real
   */
  @Get('personal/:userId/audit')
  async auditPersonalBalance(@Param('userId') userId: string) {
    this.logger.log(`👨‍✈️ [ADMIN] Auditoria de saldo para usuário ${userId}`);

    const profile = await this.db.query.financialProfiles.findFirst({
      where: (table) => eq(table.userId, userId),
      with: {
        wallet: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Perfil financeiro não encontrado');
    }

    let stripeAccount = null;
    if (profile.stripeAccountId) {
      try {
        stripeAccount = await this.stripeConnectService.retrieveAccount(profile.stripeAccountId);
      } catch (error) {
        this.logger.warn(`Falha ao buscar conta Stripe: ${error.message}`);
      }
    }

    return {
      success: true,
      data: {
        userId,
        localWallet: profile.wallet,
        stripeAccountStatus: stripeAccount ? {
          id: stripeAccount.id,
          payoutsEnabled: stripeAccount.payouts_enabled,
          chargesEnabled: stripeAccount.charges_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          requirements: stripeAccount.requirements,
        } : null,
        reconciliationStatus: stripeAccount ? 'available' : 'no_stripe_account',
      },
    };
  }

  /**
   * Aciona um reembolso manual (total ou parcial)
   */
  @Post('refund')
  async triggerManualRefund(
    @Body() body: { paymentId: string; amount?: number; reason?: string },
  ) {
    this.logger.log(`👨‍✈️ [ADMIN] Solicitando reembolso manual para pagamento ${body.paymentId}`);
    
    return await this.paymentsService.handleManualRefund(
      body.paymentId,
      body.amount,
      body.reason,
    );
  }
}
