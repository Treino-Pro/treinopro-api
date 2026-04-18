import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { StudentPaymentMethodsService } from './student-payment-methods.service';
import { RefundsService } from './refunds.service';
import { MercadoPagoService } from './mercadopago.service';
import { MercadoPagoOAuthService } from './mercadopago-oauth.service';
import { PaymentsService } from './payments.service';
import { FinancialProfileService } from './financial-profile.service';
import { WithdrawalRequestDto } from './dto/financial-profile.dto';
import { PaymentStatus } from './dto/payments.dto';
import { db } from '../../database/connection';
import { users } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { CardType } from './dto/student-payment-methods.dto';

export interface RemoveCardDto {
  cardId: string;
}

export interface UpdateCardDto {
  nickname?: string;
  cardholderName?: string;
}

export interface CreateRefundDto {
  paymentId: string;
  amount?: number;
  reason?: string;
  description?: string;
}

@Controller(['payments', 'api/payments'])
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly studentPaymentMethodsService: StudentPaymentMethodsService,
    private readonly refundsService: RefundsService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly mercadoPagoOAuthService: MercadoPagoOAuthService,
    private readonly paymentsService: PaymentsService,
    private readonly financialProfileService: FinancialProfileService,
  ) {}

  // ===== STUDENT PAYMENT METHODS =====

  @Get('test/public')
  async publicTest() {
    // Endpoint restrito a ambientes não-produção
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Endpoint indisponivel em producao');
    }

    try {
      if (!db) {
        return { error: 'Conexão com banco não disponível' };
      }

      const userCount = await db.select().from(users).limit(1);

      return {
        success: true,
        message: 'Endpoint de diagnóstico (apenas desenvolvimento)',
        databaseConnected: true,
        userCount: userCount.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('student/methods/simple-service')
  async simpleServiceTest(@Request() req) {
    console.log('🧪 [SIMPLE SERVICE] Request user:', req.user);

    const userId = req.user?.id ?? req.user?.sub;
    console.log('🧪 [SIMPLE SERVICE] User ID:', userId);

    if (!userId) {
      return {
        success: false,
        error: 'User ID não encontrado',
        user: req.user,
      };
    }

    return await this.studentPaymentMethodsService.getStudentPaymentMethodsSimple(
      userId,
    );
  }

  @Get('student/methods/simple')
  async simpleTest(@Request() req) {
    console.log('🧪 [SIMPLE TEST] Request user:', req.user);
    console.log('🧪 [SIMPLE TEST] Request headers:', req.headers);

    const userId = req.user?.id ?? req.user?.sub;
    console.log('🧪 [SIMPLE TEST] User ID:', userId);

    if (!userId) {
      return {
        success: false,
        error: 'User ID não encontrado',
        user: req.user,
      };
    }

    return {
      success: true,
      userId,
      message: 'Endpoint funcionando',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('student/methods/test')
  async testStudentPaymentMethods(@Request() req) {
    console.log('🧪 [TEST ENDPOINT] Request user:', req.user);
    console.log('🧪 [TEST ENDPOINT] Request headers:', req.headers);

    const userId = req.user?.id ?? req.user?.sub;
    console.log('🧪 [TEST ENDPOINT] Testando endpoint com userId:', userId);

    if (!userId) {
      return {
        success: false,
        error: 'User ID não encontrado na requisição',
        user: req.user,
        headers: req.headers,
      };
    }

    try {
      // Teste simples de conexão
      if (!db) {
        return { error: 'Conexão com banco não disponível' };
      }

      // Teste de query simples
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      return {
        success: true,
        userId,
        userFound: !!user,
        userType: user?.userType,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ [TEST ENDPOINT] Erro:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get('student/methods')
  async getStudentPaymentMethods(@Request() req) {
    console.log('🔍 [CONTROLLER] Request user:', req.user);
    console.log('🔍 [CONTROLLER] Request headers:', req.headers);
    console.log(
      '🔍 [CONTROLLER] Authorization header:',
      req.headers.authorization,
    );

    const userId = req.user?.id ?? req.user?.sub;
    console.log('🔍 [CONTROLLER] User ID extraído:', userId);
    console.log('🔍 [CONTROLLER] req.user.id:', req.user?.id);
    console.log('🔍 [CONTROLLER] req.user.sub:', req.user?.sub);

    if (!userId) {
      console.error('❌ [CONTROLLER] User ID não encontrado na requisição');
      console.error(
        '❌ [CONTROLLER] req.user completo:',
        JSON.stringify(req.user, null, 2),
      );
      throw new Error('Usuário não autenticado');
    }

    console.log('✅ [CONTROLLER] User ID encontrado:', userId);
    console.log('✅ [CONTROLLER] Chamando service com userId:', userId);

    const result =
      await this.studentPaymentMethodsService.getStudentPaymentMethods(userId);
    console.log('✅ [CONTROLLER] Service retornou resultado');

    return result;
  }

  @Put('student/methods')
  async updateStudentPaymentMethods(
    @Request() req,
    @Body()
    updateData: {
      preferredMethod?: string;
      enableAutoPayment?: boolean;
      defaultCardId?: string;
      mercadoPagoAccount?: {
        email: string;
        allowSaveCard: boolean;
      };
    },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return await this.studentPaymentMethodsService.updateStudentPaymentMethods(
      userId,
      updateData,
    );
  }

  // ===== CARD MANAGEMENT =====

  @Get('cards')
  async getCustomerCards(@Request() req) {
    const userId = req.user.id;
    return await this.studentPaymentMethodsService.getCustomerCards(userId);
  }

  @Put('cards/:cardId')
  async updateCard(
    @Request() req,
    @Param('cardId') cardId: string,
    @Body() updateData: UpdateCardDto,
  ) {
    const userId = req.user.id;
    return await this.studentPaymentMethodsService.updateCard(
      userId,
      cardId,
      updateData,
    );
  }

  @Delete('cards/:cardId')
  async removeCard(@Request() req, @Param('cardId') cardId: string) {
    const userId = req.user.id;
    return await this.studentPaymentMethodsService.removeCard(userId, {
      cardId,
    });
  }

  @Post('student/cards/save')
  async saveStudentCard(
    @Request() req,
    @Body()
    saveCardDto: {
      cardNumber: string;
      cardHolderName: string;
      expirationDate: string;
      cvv: string;
      cardType: string;
    },
  ) {
    console.log('💳 [SAVE STUDENT CARD] Iniciando salvamento...');
    console.log('🔍 [SAVE STUDENT CARD] Card data:', {
      cardNumber: saveCardDto.cardNumber?.substring(0, 4) + '****',
      cardHolderName: saveCardDto.cardHolderName,
      expirationDate: saveCardDto.expirationDate,
      cardType: saveCardDto.cardType,
    });
    console.log('🔍 [SAVE STUDENT CARD] User:', req.user);

    const userId = req.user?.id ?? req.user?.sub;

    if (!userId) {
      console.error('❌ [SAVE STUDENT CARD] User ID não encontrado');
      throw new Error('Usuário não autenticado');
    }

    console.log('✅ [SAVE STUDENT CARD] User ID encontrado:', userId);

    // Converter cardType string para enum
    const cardTypeEnum =
      saveCardDto.cardType === 'credit' ? CardType.CREDIT : CardType.DEBIT;

    const result = await this.studentPaymentMethodsService.saveCard(userId, {
      ...saveCardDto,
      cardType: cardTypeEnum,
    });
    console.log('✅ [SAVE STUDENT CARD] Cartão salvo com sucesso');

    return result;
  }

  @Post('student/cards/validate')
  async validateStudentCard(
    @Request() req,
    @Body()
    validateCardDto: {
      cardNumber: string;
      cardHolderName: string;
      expiryMonth: string;
      expiryYear: string;
      cvv: string;
    },
  ) {
    console.log('✅ [VALIDATE STUDENT CARD] Iniciando validação...');
    console.log('🔍 [VALIDATE STUDENT CARD] Card data:', {
      cardNumber: validateCardDto.cardNumber?.substring(0, 4) + '****',
      cardHolderName: validateCardDto.cardHolderName,
      expiryMonth: validateCardDto.expiryMonth,
      expiryYear: validateCardDto.expiryYear,
    });
    console.log('🔍 [VALIDATE STUDENT CARD] User:', req.user);

    const userId = req.user?.id ?? req.user?.sub;

    if (!userId) {
      console.error('❌ [VALIDATE STUDENT CARD] User ID não encontrado');
      throw new Error('Usuário não autenticado');
    }

    console.log('✅ [VALIDATE STUDENT CARD] User ID encontrado:', userId);

    // Converter dados para o formato esperado pelo service
    const expirationDate = `${validateCardDto.expiryMonth.padStart(2, '0')}/${validateCardDto.expiryYear}`;

    const result = await this.studentPaymentMethodsService.validateCard({
      cardNumber: validateCardDto.cardNumber,
      cardHolderName: validateCardDto.cardHolderName,
      expirationDate: expirationDate,
      cvv: validateCardDto.cvv,
    });

    console.log('✅ [VALIDATE STUDENT CARD] Cartão validado:', result);

    return { isValid: result.isValid };
  }

  @Delete('student/cards/:cardId')
  async removeStudentCard(@Request() req, @Param('cardId') cardId: string) {
    console.log('🗑️ [REMOVE STUDENT CARD] Iniciando remoção...');
    console.log('🔍 [REMOVE STUDENT CARD] Card ID:', cardId);
    console.log('🔍 [REMOVE STUDENT CARD] User:', req.user);

    const userId = req.user?.id ?? req.user?.sub;

    if (!userId) {
      console.error('❌ [REMOVE STUDENT CARD] User ID não encontrado');
      throw new Error('Usuário não autenticado');
    }

    console.log('✅ [REMOVE STUDENT CARD] User ID encontrado:', userId);

    const result = await this.studentPaymentMethodsService.removeCard(userId, {
      cardId,
    });
    console.log('✅ [REMOVE STUDENT CARD] Cartão removido com sucesso');

    return result;
  }

  // ===== REFUNDS =====

  @Post('refunds')
  async createRefund(@Request() req, @Body() refundDto: CreateRefundDto) {
    const userId = req.user.id;
    return await this.refundsService.createRefund(userId, refundDto);
  }

  @Get('refunds')
  async getUserRefunds(
    @Request() req,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const userId = req.user.id;
    return await this.refundsService.getUserRefunds(
      userId,
      limit || 50,
      offset || 0,
    );
  }

  @Get('payments/:paymentId/refunds')
  async getPaymentRefunds(
    @Request() req,
    @Param('paymentId') paymentId: string,
  ) {
    const userId = req.user.id;
    return await this.refundsService.getPaymentRefunds(userId, paymentId);
  }

  @Get('payments/:paymentId/refunds/:refundId')
  async getRefund(
    @Request() req,
    @Param('paymentId') paymentId: string,
    @Param('refundId') refundId: string,
  ) {
    const userId = req.user.id;
    return await this.refundsService.getRefund(userId, paymentId, refundId);
  }

  // ===== ROTAS PARA PERSONAL CONSULTAR CARTEIRA =====

  @Get('personal/wallet/balance')
  @UseGuards(JwtAuthGuard)
  async getPersonalWalletBalance(@Request() req) {
    const userId = req.user.sub;
    console.log(
      `💰 [PERSONAL_BALANCE] Consultando saldo da carteira para personal ${userId}`,
    );

    try {
      const wallet = await this.paymentsService.getUserWallet(userId);
      console.log(`💰 [PERSONAL_BALANCE] Saldo encontrado:`, wallet);

      return {
        success: true,
        data: wallet,
      };
    } catch (error) {
      console.error(`❌ [PERSONAL_BALANCE] Erro ao buscar saldo:`, error);
      throw new BadRequestException('Erro ao buscar saldo da carteira');
    }
  }

  @Get('personal/wallet/transactions')
  @UseGuards(JwtAuthGuard)
  async getPersonalTransactions(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = req.user.sub;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    console.log(
      `📊 [PERSONAL_TRANSACTIONS] Consultando transações para personal ${userId}`,
    );

    try {
      const transactions = await this.paymentsService.getPersonalTransactions(
        userId,
        limitNum,
        offsetNum,
      );
      console.log(
        `📊 [PERSONAL_TRANSACTIONS] Encontradas ${transactions.length} transações`,
      );

      return {
        success: true,
        data: transactions,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          count: transactions.length,
        },
      };
    } catch (error) {
      console.error(
        `❌ [PERSONAL_TRANSACTIONS] Erro ao buscar transações:`,
        error,
      );
      throw new BadRequestException('Erro ao buscar transações da carteira');
    }
  }

  @Post('personal/wallet/withdraw')
  @UseGuards(JwtAuthGuard)
  async requestPersonalWithdrawal(
    @Request() req,
    @Body() withdrawalDto: WithdrawalRequestDto,
  ) {
    const userId = req.user.sub;

    console.log(
      `💸 [PERSONAL_WITHDRAWAL] Solicitando saque para personal ${userId}`,
    );

    try {
      const withdrawal = await this.financialProfileService.requestWithdrawal(
        userId,
        withdrawalDto,
      );

      return {
        success: true,
        data: withdrawal,
      };
    } catch (error) {
      console.error(`❌ [PERSONAL_WITHDRAWAL] Erro ao solicitar saque:`, error);
      throw new BadRequestException(
        error?.message || 'Erro ao solicitar saque',
      );
    }
  }

  @Get('personal/financial/stats')
  @UseGuards(JwtAuthGuard)
  async getPersonalFinancialStats(@Request() req) {
    const userId = req.user.sub;

    try {
      const stats =
        await this.paymentsService.getPersonalFinancialStats(userId);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      console.error(`❌ [PERSONAL_STATS] Erro ao buscar estatísticas:`, error);
      throw new BadRequestException('Erro ao buscar estatísticas financeiras');
    }
  }

  @Get('personal/payments')
  @UseGuards(JwtAuthGuard)
  async getPersonalPayments(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    const userId = req.user.sub;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    console.log(
      `💳 [PERSONAL_PAYMENTS] Consultando pagamentos para personal ${userId}`,
    );

    try {
      const filters: any = {
        limit: limitNum,
        offset: offsetNum,
      };

      // Só adicionar status se for válido
      if (
        status &&
        Object.values(PaymentStatus).includes(status as PaymentStatus)
      ) {
        filters.status = status as PaymentStatus;
      }

      const payments = await this.paymentsService.getPayments(filters, userId);
      console.log(
        `💳 [PERSONAL_PAYMENTS] Encontrados ${payments.length} pagamentos`,
      );

      return {
        success: true,
        data: payments,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          count: payments.length,
        },
      };
    } catch (error) {
      console.error(`❌ [PERSONAL_PAYMENTS] Erro ao buscar pagamentos:`, error);
      throw new BadRequestException('Erro ao buscar pagamentos');
    }
  }

  @Post('personal/test-capture/:classId')
  @UseGuards(JwtAuthGuard)
  async testCapturePaymentAfterClass(
    @Request() req,
    @Param('classId') classId: string,
  ) {
    console.log(
      `🧪 [TEST_CAPTURE] Testando captura manual para aula ${classId}`,
    );

    try {
      await this.paymentsService.capturePaymentAfterClass(
        classId,
        'Teste manual de captura',
      );

      return {
        success: true,
        message: 'Pagamento capturado com sucesso',
        classId,
      };
    } catch (error) {
      console.error(`❌ [TEST_CAPTURE] Erro ao capturar pagamento:`, error);
      throw new BadRequestException(
        `Erro ao capturar pagamento: ${error.message}`,
      );
    }
  }

  // ===== SEARCH & UTILITIES =====

  @Get('search')
  async searchPayments(
    @Request() req,
    @Query('externalReference') externalReference?: string,
    @Query('status') status?: string,
    @Query('dateCreatedFrom') dateCreatedFrom?: string,
    @Query('dateCreatedTo') dateCreatedTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return await this.mercadoPagoService.searchPayments({
      externalReference,
      status,
      dateCreatedFrom,
      dateCreatedTo,
      limit,
      offset,
    });
  }

  @Get('identification-types')
  async getIdentificationTypes() {
    return await this.mercadoPagoService.getIdentificationTypes();
  }

  @Get('customers/search')
  async searchCustomers(
    @Query('email') email?: string,
    @Query('firstName') firstName?: string,
    @Query('lastName') lastName?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return await this.mercadoPagoService.searchCustomers({
      email,
      firstName,
      lastName,
      limit,
      offset,
    });
  }

  // ===== MERCADO PAGO OAUTH =====

  @Get('mercadopago/oauth/start')
  @UseGuards(JwtAuthGuard)
  async startMercadoPagoOAuth(@Request() req) {
    const userId = req.user.sub;
    console.log(`🔗 [MP_OAUTH] Iniciando fluxo OAuth para user ${userId}`);

    try {
      const result = await this.mercadoPagoOAuthService.startOAuth(userId);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error(`❌ [MP_OAUTH] Erro ao iniciar OAuth:`, error);
      throw error;
    }
  }

  @Get('mercadopago/oauth/callback')
  @Public()
  async handleMercadoPagoOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    console.log(
      `🔗 [MP_OAUTH] Callback recebido com state=${state?.substring(0, 8)}...`,
    );

    try {
      const result = await this.mercadoPagoOAuthService.handleCallback(
        code,
        state,
      );

      // Redirecionar para deep link do app após sucesso
      const deepLink = `treinopro://mercadopago/callback?success=true&email=${encodeURIComponent(result.mpEmail)}`;
      return res.redirect(deepLink);
    } catch (error) {
      console.error(`❌ [MP_OAUTH] Erro no callback:`, error);
      const deepLink = `treinopro://mercadopago/callback?success=false&error=${encodeURIComponent(error.message || 'Erro desconhecido')}`;
      return res.redirect(deepLink);
    }
  }

  @Get('mercadopago/oauth/status')
  @UseGuards(JwtAuthGuard)
  async getMercadoPagoOAuthStatus(@Request() req) {
    const userId = req.user.sub;

    try {
      const status = await this.mercadoPagoOAuthService.getOAuthStatus(userId);
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      console.error(`❌ [MP_OAUTH] Erro ao buscar status:`, error);
      throw new BadRequestException(
        'Erro ao buscar status da conta Mercado Pago',
      );
    }
  }

  @Post('mercadopago/oauth/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectMercadoPago(@Request() req) {
    const userId = req.user.sub;
    console.log(`🔗 [MP_OAUTH] Desconectando MP para user ${userId}`);

    try {
      await this.mercadoPagoOAuthService.disconnect(userId);
      return {
        success: true,
        message: 'Conta Mercado Pago desconectada com sucesso',
      };
    } catch (error) {
      console.error(`❌ [MP_OAUTH] Erro ao desconectar:`, error);
      throw error;
    }
  }

  // ===== FINANCIAL PROFILE ROUTES =====

  @Get('profile/financial')
  @UseGuards(JwtAuthGuard)
  async getFinancialProfile(@Request() req) {
    const userId = req.user.sub;
    console.log(
      `📋 [FINANCIAL_PROFILE] Consultando perfil financeiro para personal ${userId}`,
    );

    try {
      const profile =
        await this.financialProfileService.getFinancialProfile(userId);
      console.log(`📋 [FINANCIAL_PROFILE] Perfil encontrado:`, profile);

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      console.error(`❌ [FINANCIAL_PROFILE] Erro ao buscar perfil:`, error);
      throw new BadRequestException('Erro ao buscar perfil financeiro');
    }
  }

  @Put('profile/financial')
  @UseGuards(JwtAuthGuard)
  async updateFinancialProfile(@Request() req, @Body() updateDto: any) {
    const userId = req.user.sub;
    console.log(
      `📋 [FINANCIAL_PROFILE] Atualizando perfil financeiro para personal ${userId}`,
    );

    try {
      const profile = await this.financialProfileService.updateFinancialProfile(
        userId,
        updateDto,
      );
      console.log(`📋 [FINANCIAL_PROFILE] Perfil atualizado:`, profile);

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      console.error(`❌ [FINANCIAL_PROFILE] Erro ao atualizar perfil:`, error);
      throw new BadRequestException('Erro ao atualizar perfil financeiro');
    }
  }
}
