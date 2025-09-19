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
  ParseUUIDPipe,
  ValidationPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { FinancialProfileService } from './financial-profile.service';
import { StudentPaymentMethodsService } from './student-payment-methods.service';
import { 
  CreatePaymentPreferenceDto,
  CreateDisputeDto,
  SubmitEvidenceDto,
  ResolveDisputeDto,
  UpdateWalletDto,
  WithdrawRequestDto,
  PaymentResponseDto,
  DisputeResponseDto,
  WalletResponseDto,
  TransactionResponseDto,
  PaymentStatsDto,
  PaymentFiltersDto,
  DisputeFiltersDto,
  MercadoPagoWebhookDto,
  PaymentStatus
} from './dto/payments.dto';
import { SaveCardDto } from './dto/student-payment-methods.dto';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly financialProfileService: FinancialProfileService,
    private readonly studentPaymentMethodsService: StudentPaymentMethodsService,
  ) {}

  // Criar preferência de pagamento
  @Post('preference')
  @ApiOperation({ summary: 'Criar preferência de pagamento' })
  @ApiResponse({ 
    status: 201, 
    description: 'Preferência de pagamento criada com sucesso'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async createPaymentPreference(
    @Body(ValidationPipe) createDto: CreatePaymentPreferenceDto,
    @Request() req: any,
  ): Promise<any> {
    return this.paymentsService.createPaymentPreference(createDto, req.user.sub);
  }

  // Processar webhook do Mercado Pago
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Processar webhook do Mercado Pago' })
  @ApiBody({
    description: 'Dados do webhook do Mercado Pago',
    type: MercadoPagoWebhookDto,
    examples: {
      payment_approved: {
        summary: 'Pagamento aprovado',
        value: {
          id: '1234567890',
          live_mode: true,
          type: 'payment',
          date_created: '2024-01-15T10:00:00.000Z',
          action: 'payment.updated',
          data: {
            id: '1234567890'
          }
        }
      },
      payment_rejected: {
        summary: 'Pagamento rejeitado',
        value: {
          id: '1234567891',
          live_mode: true,
          type: 'payment',
          date_created: '2024-01-15T10:00:00.000Z',
          action: 'payment.updated',
          data: {
            id: '1234567891'
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook processado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Webhook processado com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados do webhook inválidos' 
  })
  async processWebhook(
    @Body(ValidationPipe) webhookDto: MercadoPagoWebhookDto,
  ): Promise<{ message: string }> {
    await this.paymentsService.processWebhook(webhookDto);
    return { message: 'Webhook processado com sucesso' };
  }

  // Obter pagamento por ID
  @Get(':id')
  @ApiOperation({ summary: 'Obter pagamento por ID' })
  @ApiParam({ name: 'id', description: 'ID do pagamento', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Pagamento encontrado com sucesso',
    type: PaymentResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Pagamento não encontrado' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getPaymentById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.getPaymentById(id, req.user.sub);
  }

  // Listar pagamentos com filtros
  @Get()
  @ApiOperation({ summary: 'Listar pagamentos com filtros' })
  @ApiQuery({ name: 'status', required: false, description: 'Status do pagamento', example: 'authorized' })
  @ApiQuery({ name: 'type', required: false, description: 'Tipo do pagamento', example: 'class_payment' })
  @ApiQuery({ name: 'classId', required: false, description: 'ID da aula', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiQuery({ name: 'userId', required: false, description: 'ID do usuário', example: '123e4567-e89b-12d3-a456-426614174001' })
  @ApiQuery({ name: 'minAmount', required: false, description: 'Valor mínimo', example: 50.00 })
  @ApiQuery({ name: 'maxAmount', required: false, description: 'Valor máximo', example: 200.00 })
  @ApiQuery({ name: 'startDate', required: false, description: 'Data inicial', example: '2024-01-01T00:00:00.000Z' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Data final', example: '2024-12-31T23:59:59.999Z' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos retornada com sucesso',
    type: [PaymentResponseDto]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getPayments(
    @Query(ValidationPipe) filters: PaymentFiltersDto,
    @Request() req: any,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments(filters, req.user.sub);
  }

  // Obter estatísticas de pagamentos
  @Get('stats/my')
  @ApiOperation({ summary: 'Obter estatísticas pessoais de pagamentos' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas pessoais retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalPayments: { type: 'number', example: 25, description: 'Total de pagamentos' },
        totalAmount: { type: 'number', example: 2000.00, description: 'Valor total em reais' },
        averageAmount: { type: 'number', example: 80.00, description: 'Valor médio por pagamento' },
        pendingPayments: { type: 'number', example: 2, description: 'Pagamentos pendentes' },
        authorizedPayments: { type: 'number', example: 15, description: 'Pagamentos autorizados' },
        capturedPayments: { type: 'number', example: 12, description: 'Pagamentos capturados' },
        refundedPayments: { type: 'number', example: 1, description: 'Pagamentos reembolsados' },
        disputedPayments: { type: 'number', example: 0, description: 'Pagamentos em disputa' },
        monthlyRevenue: { type: 'number', example: 800.00, description: 'Receita mensal' },
        platformFees: { type: 'number', example: 80.00, description: 'Taxas da plataforma' },
        personalEarnings: { type: 'number', example: 720.00, description: 'Ganhos pessoais' }
      },
      example: {
        totalPayments: 25,
        totalAmount: 2000.00,
        averageAmount: 80.00,
        pendingPayments: 2,
        authorizedPayments: 15,
        capturedPayments: 12,
        refundedPayments: 1,
        disputedPayments: 0,
        monthlyRevenue: 800.00,
        platformFees: 80.00,
        personalEarnings: 720.00
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getMyPaymentStats(@Request() req: any): Promise<PaymentStatsDto> {
    return this.paymentsService.getPaymentStats(req.user.sub);
  }

  // Obter estatísticas gerais (admin)
  @Get('stats/all')
  @ApiOperation({ summary: 'Obter estatísticas gerais de pagamentos (Admin)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas gerais retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalPayments: { type: 'number', example: 1250, description: 'Total de pagamentos na plataforma' },
        totalAmount: { type: 'number', example: 100000.00, description: 'Valor total processado em reais' },
        averageAmount: { type: 'number', example: 80.00, description: 'Valor médio por pagamento' },
        pendingPayments: { type: 'number', example: 15, description: 'Pagamentos pendentes' },
        authorizedPayments: { type: 'number', example: 800, description: 'Pagamentos autorizados' },
        capturedPayments: { type: 'number', example: 750, description: 'Pagamentos capturados' },
        refundedPayments: { type: 'number', example: 25, description: 'Pagamentos reembolsados' },
        disputedPayments: { type: 'number', example: 5, description: 'Pagamentos em disputa' },
        monthlyRevenue: { type: 'number', example: 8000.00, description: 'Receita mensal da plataforma' },
        platformFees: { type: 'number', example: 800.00, description: 'Taxas da plataforma' },
        personalEarnings: { type: 'number', example: 7200.00, description: 'Ganhos dos personal trainers' },
        activeUsers: { type: 'number', example: 150, description: 'Usuários ativos' },
        conversionRate: { type: 'number', example: 0.85, description: 'Taxa de conversão' }
      },
      example: {
        totalPayments: 1250,
        totalAmount: 100000.00,
        averageAmount: 80.00,
        pendingPayments: 15,
        authorizedPayments: 800,
        capturedPayments: 750,
        refundedPayments: 25,
        disputedPayments: 5,
        monthlyRevenue: 8000.00,
        platformFees: 800.00,
        personalEarnings: 7200.00,
        activeUsers: 150,
        conversionRate: 0.85
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Acesso negado - Apenas administradores' 
  })
  async getAllPaymentStats(): Promise<PaymentStatsDto> {
    return this.paymentsService.getPaymentStats();
  }

  // Endpoints de disputas
  @Post('disputes')
  @ApiOperation({ summary: 'Criar nova disputa de pagamento' })
  @ApiResponse({ 
    status: 201, 
    description: 'Disputa criada com sucesso',
    type: DisputeResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async createDispute(
    @Body(ValidationPipe) createDto: CreateDisputeDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    return this.paymentsService.createDispute(createDto, req.user.sub);
  }

  @Put('disputes/:id/evidence')
  @ApiOperation({ summary: 'Enviar evidências para disputa' })
  @ApiParam({ name: 'id', description: 'ID da disputa', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Evidências enviadas com sucesso',
    type: DisputeResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Disputa não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async submitEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) evidenceDto: SubmitEvidenceDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    return this.paymentsService.submitEvidence(id, evidenceDto, req.user.sub);
  }

  @Put('disputes/:id/resolve')
  @ApiOperation({ summary: 'Resolver disputa de pagamento' })
  @ApiParam({ name: 'id', description: 'ID da disputa', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Disputa resolvida com sucesso',
    type: DisputeResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Disputa não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async resolveDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) resolveDto: ResolveDisputeDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    return this.paymentsService.resolveDispute(id, resolveDto, req.user.sub);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Listar disputas com filtros' })
  @ApiQuery({ name: 'status', required: false, description: 'Status da disputa', example: 'pending' })
  @ApiQuery({ name: 'paymentId', required: false, description: 'ID do pagamento', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiQuery({ name: 'userId', required: false, description: 'ID do usuário', example: '123e4567-e89b-12d3-a456-426614174001' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Data inicial', example: '2024-01-01T00:00:00.000Z' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Data final', example: '2024-12-31T23:59:59.999Z' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de disputas retornada com sucesso',
    type: [DisputeResponseDto]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getDisputes(
    @Query(ValidationPipe) filters: DisputeFiltersDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto[]> {
    // Implementar listagem de disputas
    return [];
  }

  @Get('disputes/:id')
  @ApiOperation({ summary: 'Obter disputa por ID' })
  @ApiParam({ name: 'id', description: 'ID da disputa', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Disputa encontrada com sucesso',
    type: DisputeResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Disputa não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getDisputeById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    // Implementar busca de disputa por ID
    throw new Error('Not implemented');
  }

  // Endpoints de carteira
  @Get('wallet/balance')
  @ApiOperation({ summary: 'Obter saldo da carteira' })
  @ApiResponse({ 
    status: 200, 
    description: 'Saldo da carteira retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
        availableBalance: { type: 'number', example: 150.00, description: 'Saldo disponível para saque' },
        pendingBalance: { type: 'number', example: 50.00, description: 'Saldo pendente de confirmação' },
        totalEarned: { type: 'number', example: 500.00, description: 'Total ganho pelo usuário' },
        totalWithdrawn: { type: 'number', example: 350.00, description: 'Total sacado pelo usuário' },
        currency: { type: 'string', example: 'BRL', description: 'Moeda da carteira' },
        bankAccount: { 
          type: 'object', 
          example: { bank: '001', agency: '1234', account: '56789-0' },
          description: 'Dados da conta bancária'
        },
        pixKey: { type: 'string', example: 'user@email.com', description: 'Chave PIX' },
        createdAt: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        updatedAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' }
      },
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        availableBalance: 150.00,
        pendingBalance: 50.00,
        totalEarned: 500.00,
        totalWithdrawn: 350.00,
        currency: 'BRL',
        bankAccount: { bank: '001', agency: '1234', account: '56789-0' },
        pixKey: 'user@email.com',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getWalletBalance(@Request() req: any): Promise<WalletResponseDto> {
    return this.paymentsService.getUserWallet(req.user.sub);
  }

  @Put('wallet')
  @ApiOperation({ summary: 'Atualizar configurações da carteira' })
  @ApiBody({
    description: 'Dados para atualização da carteira',
    schema: {
      type: 'object',
      properties: {
        bankAccount: {
          type: 'object',
          properties: {
            bank: { type: 'string', example: '001', description: 'Código do banco' },
            agency: { type: 'string', example: '1234', description: 'Agência' },
            account: { type: 'string', example: '56789-0', description: 'Conta' },
            accountType: { type: 'string', example: 'checking', description: 'Tipo da conta' }
          }
        },
        pixKey: { type: 'string', example: 'user@email.com', description: 'Chave PIX' }
      },
      example: {
        bankAccount: {
          bank: '001',
          agency: '1234',
          account: '56789-0',
          accountType: 'checking'
        },
        pixKey: 'user@email.com'
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Carteira atualizada com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
        availableBalance: { type: 'number', example: 150.00, description: 'Saldo disponível para saque' },
        pendingBalance: { type: 'number', example: 50.00, description: 'Saldo pendente de confirmação' },
        totalEarned: { type: 'number', example: 500.00, description: 'Total ganho pelo usuário' },
        totalWithdrawn: { type: 'number', example: 350.00, description: 'Total sacado pelo usuário' },
        currency: { type: 'string', example: 'BRL', description: 'Moeda da carteira' },
        bankAccount: { 
          type: 'object', 
          example: { bank: '001', agency: '1234', account: '56789-0' },
          description: 'Dados da conta bancária'
        },
        pixKey: { type: 'string', example: 'user@email.com', description: 'Chave PIX' },
        createdAt: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        updatedAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' }
      },
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        availableBalance: 150.00,
        pendingBalance: 50.00,
        totalEarned: 500.00,
        totalWithdrawn: 350.00,
        currency: 'BRL',
        bankAccount: { bank: '001', agency: '1234', account: '56789-0' },
        pixKey: 'user@email.com',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async updateWallet(
    @Body(ValidationPipe) updateDto: UpdateWalletDto,
    @Request() req: any,
  ): Promise<WalletResponseDto> {
    return this.paymentsService.updateWallet(req.user.sub, updateDto);
  }

  @Post('wallet/withdraw')
  @ApiOperation({ summary: 'Solicitar saque da carteira' })
  @ApiResponse({ 
    status: 201, 
    description: 'Solicitação de saque criada com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
        amount: { type: 'number', example: 100.00, description: 'Valor do saque' },
        type: { type: 'string', example: 'withdrawal', description: 'Tipo da transação' },
        status: { type: 'string', example: 'pending', description: 'Status da transação' },
        description: { type: 'string', example: 'Saque mensal', description: 'Descrição do saque' },
        bankAccount: { type: 'string', example: '12345-6', description: 'Conta bancária' },
        createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
        processedAt: { type: 'string', example: null, description: 'Data de processamento' }
      },
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        amount: 100.00,
        type: 'withdrawal',
        status: 'pending',
        description: 'Saque mensal',
        bankAccount: '12345-6',
        createdAt: '2024-01-15T10:00:00.000Z',
        processedAt: null
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou saldo insuficiente' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async requestWithdrawal(
    @Body(ValidationPipe) withdrawDto: WithdrawRequestDto,
    @Request() req: any,
  ): Promise<TransactionResponseDto> {
    return this.paymentsService.requestWithdrawal(req.user.sub, withdrawDto);
  }

  @Get('wallet/transactions')
  @ApiOperation({ summary: 'Listar transações da carteira' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limite de itens por página', example: 10 })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset para paginação', example: 0 })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de transações retornada com sucesso',
    type: [TransactionResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
          amount: { type: 'number', example: 80.00, description: 'Valor da transação' },
          type: { type: 'string', example: 'payment', description: 'Tipo da transação' },
          status: { type: 'string', example: 'completed', description: 'Status da transação' },
          description: { type: 'string', example: 'Pagamento de aula', description: 'Descrição da transação' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          processedAt: { type: 'string', example: '2024-01-15T10:05:00.000Z' }
        }
      }
    },
    example: [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        amount: 80.00,
        type: 'payment',
        status: 'completed',
        description: 'Pagamento de aula',
        createdAt: '2024-01-15T10:00:00.000Z',
        processedAt: '2024-01-15T10:05:00.000Z'
      },
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        amount: 100.00,
        type: 'withdrawal',
        status: 'pending',
        description: 'Saque mensal',
        createdAt: '2024-01-14T15:30:00.000Z',
        processedAt: null
      }
    ]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getWalletTransactions(
    @Request() req: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<TransactionResponseDto[]> {
    // Implementar listagem de transações da carteira
    return [];
  }

  // Endpoints específicos para diferentes tipos de pagamento
  @Get('pending')
  @ApiOperation({ summary: 'Listar pagamentos pendentes' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos pendentes retornada com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'pending', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getPendingPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: PaymentStatus.PENDING }, req.user.sub);
  }

  @Get('authorized')
  @ApiOperation({ summary: 'Listar pagamentos autorizados' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos autorizados retornada com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'authorized', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          authorizedAt: { type: 'string', example: '2024-01-15T10:05:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getAuthorizedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: PaymentStatus.AUTHORIZED }, req.user.sub);
  }

  @Get('captured')
  @ApiOperation({ summary: 'Listar pagamentos capturados' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos capturados retornada com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'captured', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          authorizedAt: { type: 'string', example: '2024-01-15T10:05:00.000Z' },
          capturedAt: { type: 'string', example: '2024-01-15T15:00:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getCapturedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: PaymentStatus.CAPTURED }, req.user.sub);
  }

  @Get('refunded')
  @ApiOperation({ summary: 'Listar pagamentos reembolsados' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos reembolsados retornada com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'refunded', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          refundedAt: { type: 'string', example: '2024-01-15T16:00:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getRefundedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: PaymentStatus.REFUNDED }, req.user.sub);
  }

  @Get('disputed')
  @ApiOperation({ summary: 'Listar pagamentos em disputa' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos em disputa retornada com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'disputed', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          disputedAt: { type: 'string', example: '2024-01-15T17:00:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getDisputedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: PaymentStatus.DISPUTED }, req.user.sub);
  }

  // Endpoints para classes específicas
  @Get('class/:classId')
  @ApiOperation({ summary: 'Obter pagamentos de uma aula específica' })
  @ApiParam({ name: 'classId', description: 'ID da aula', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos da aula retornada com sucesso',
    type: [PaymentResponseDto]
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Aula não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getPaymentsByClass(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Request() req: any,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ classId }, req.user.sub);
  }

  // Endpoints para relatórios
  @Get('reports/daily')
  @ApiOperation({ summary: 'Obter relatório diário de pagamentos' })
  @ApiResponse({ 
    status: 200, 
    description: 'Relatório diário retornado com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'captured', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
          summary: {
            type: 'object',
            properties: {
              totalPayments: { type: 'number', example: 5, description: 'Total de pagamentos no dia' },
              totalAmount: { type: 'number', example: 400.00, description: 'Valor total do dia' },
              platformFees: { type: 'number', example: 40.00, description: 'Taxas da plataforma' },
              personalEarnings: { type: 'number', example: 360.00, description: 'Ganhos dos personal trainers' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getDailyReport(@Request() req: any): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.paymentsService.getPayments({
      startDate: today,
      endDate: new Date(),
    }, req.user.sub);
  }

  @Get('reports/weekly')
  @ApiOperation({ summary: 'Obter relatório semanal de pagamentos' })
  @ApiResponse({ 
    status: 200, 
    description: 'Relatório semanal retornado com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'captured', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
          summary: {
            type: 'object',
            properties: {
              totalPayments: { type: 'number', example: 25, description: 'Total de pagamentos na semana' },
              totalAmount: { type: 'number', example: 2000.00, description: 'Valor total da semana' },
              platformFees: { type: 'number', example: 200.00, description: 'Taxas da plataforma' },
              personalEarnings: { type: 'number', example: 1800.00, description: 'Ganhos dos personal trainers' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getWeeklyReport(@Request() req: any): Promise<any> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    return this.paymentsService.getPayments({
      startDate: weekAgo,
      endDate: new Date(),
    }, req.user.sub);
  }

  @Get('reports/monthly')
  @ApiOperation({ summary: 'Obter relatório mensal de pagamentos' })
  @ApiResponse({ 
    status: 200, 
    description: 'Relatório mensal retornado com sucesso',
    type: [PaymentResponseDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          status: { type: 'string', example: 'captured', description: 'Status do pagamento' },
          totalAmount: { type: 'number', example: 80.00, description: 'Valor total' },
          platformFee: { type: 'number', example: 8.00, description: 'Taxa da plataforma' },
          personalAmount: { type: 'number', example: 72.00, description: 'Valor do personal trainer' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
          summary: {
            type: 'object',
            properties: {
              totalPayments: { type: 'number', example: 100, description: 'Total de pagamentos no mês' },
              totalAmount: { type: 'number', example: 8000.00, description: 'Valor total do mês' },
              platformFees: { type: 'number', example: 800.00, description: 'Taxas da plataforma' },
              personalEarnings: { type: 'number', example: 7200.00, description: 'Ganhos dos personal trainers' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getMonthlyReport(@Request() req: any): Promise<any> {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    return this.paymentsService.getPayments({
      startDate: monthAgo,
      endDate: new Date(),
    }, req.user.sub);
  }

  // Endpoints para notificações de disputa
  @Get('disputes/notifications')
  @ApiOperation({ summary: 'Obter notificações de disputa' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de notificações retornada com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          disputeId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
          message: { type: 'string', example: 'Nova evidência enviada para disputa' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          read: { type: 'boolean', example: false }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getDisputeNotifications(@Request() req: any): Promise<any[]> {
    // Implementar notificações de disputa
    return [];
  }

  @Post('disputes/:id/notify')
  @ApiOperation({ summary: 'Enviar notificação de disputa' })
  @ApiParam({ name: 'id', description: 'ID da disputa', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Notificação enviada com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Notificação enviada com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Disputa não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async sendDisputeNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    // Implementar envio de notificação de disputa
    return { message: 'Notificação enviada com sucesso' };
  }

  // Endpoints para administração
  @Get('admin/dashboard')
  @ApiOperation({ summary: 'Obter dashboard administrativo de pagamentos' })
  @ApiResponse({ 
    status: 200, 
    description: 'Dashboard administrativo retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalPayments: { type: 'number', example: 1250, description: 'Total de pagamentos na plataforma' },
        totalAmount: { type: 'number', example: 125000.00, description: 'Valor total processado' },
        pendingDisputes: { type: 'number', example: 5, description: 'Disputas pendentes' },
        activeUsers: { type: 'number', example: 150, description: 'Usuários ativos' },
        monthlyRevenue: { type: 'number', example: 8000.00, description: 'Receita mensal' },
        platformFees: { type: 'number', example: 800.00, description: 'Taxas da plataforma' },
        conversionRate: { type: 'number', example: 0.85, description: 'Taxa de conversão' },
        recentTransactions: { 
          type: 'array', 
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
              amount: { type: 'number', example: 80.00 },
              status: { type: 'string', example: 'captured' },
              createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Acesso negado - Apenas administradores' 
  })
  async getAdminDashboard(): Promise<any> {
    // Implementar dashboard administrativo
    return {
      totalPayments: 0,
      totalAmount: 0,
      pendingDisputes: 0,
      recentTransactions: [],
    };
  }

  @Get('admin/disputes/pending')
  @ApiOperation({ summary: 'Listar disputas pendentes (Admin)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de disputas pendentes retornada com sucesso',
    type: [DisputeResponseDto]
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Acesso negado - Apenas administradores' 
  })
  async getPendingDisputes(): Promise<DisputeResponseDto[]> {
    // Implementar listagem de disputas pendentes para admin
    return [];
  }

  @Get('admin/users/:userId/payments')
  @ApiOperation({ summary: 'Obter pagamentos de um usuário específico (Admin)' })
  @ApiParam({ name: 'userId', description: 'ID do usuário', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pagamentos do usuário retornada com sucesso',
    type: [PaymentResponseDto]
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Acesso negado - Apenas administradores' 
  })
  async getUserPayments(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ userId }, userId);
  }

  @Get('admin/users/:userId/wallet')
  @ApiOperation({ summary: 'Obter carteira de um usuário específico (Admin)' })
  @ApiParam({ name: 'userId', description: 'ID do usuário', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Carteira do usuário retornada com sucesso',
    type: WalletResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Acesso negado - Apenas administradores' 
  })
  async getUserWallet(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<WalletResponseDto> {
    return this.paymentsService.getUserWallet(userId);
  }

  // Endpoints para integração com aulas
  @Post('classes/:classId/capture')
  @ApiOperation({ summary: 'Capturar pagamento após conclusão da aula' })
  @ApiParam({ name: 'classId', description: 'ID da aula', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiBody({
    description: 'Dados para captura do pagamento',
    schema: {
      type: 'object',
      properties: {
        reason: { 
          type: 'string', 
          description: 'Motivo da captura',
          example: 'Aula concluída com sucesso'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Pagamento capturado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Pagamento capturado e split aplicado com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Aula ou pagamento não encontrado' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async captureClassPayment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.paymentsService.capturePaymentAfterClass(classId, body.reason);
    return { message: 'Pagamento capturado e split aplicado com sucesso' };
  }

  @Post('classes/:classId/cancel')
  @ApiOperation({ summary: 'Cancelar pagamento antes da aula' })
  @ApiParam({ name: 'classId', description: 'ID da aula', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiBody({
    description: 'Dados para cancelamento do pagamento',
    schema: {
      type: 'object',
      properties: {
        reason: { 
          type: 'string', 
          description: 'Motivo do cancelamento',
          example: 'Aula cancelada pelo personal trainer'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Pagamento cancelado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Pagamento cancelado e reembolso processado com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Aula ou pagamento não encontrado' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async cancelClassPayment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.paymentsService.cancelPaymentBeforeClass(classId, body.reason);
    return { message: 'Pagamento cancelado e reembolso processado com sucesso' };
  }

  @Post('classes/:classId/refund')
  @ApiOperation({ summary: 'Reembolsar pagamento de uma aula' })
  @ApiParam({ name: 'classId', description: 'ID da aula', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiBody({
    description: 'Dados para reembolso do pagamento',
    schema: {
      type: 'object',
      properties: {
        reason: { 
          type: 'string', 
          description: 'Motivo do reembolso',
          example: 'Aula não foi realizada conforme combinado'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Reembolso processado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Reembolso processado com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Aula ou pagamento não encontrado' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async refundClassPayment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ): Promise<{ message: string }> {
    // Buscar pagamento da aula
    const payments = await this.paymentsService.getPayments({ classId }, req.user.sub);
    if (payments.length === 0) {
      throw new Error('Pagamento não encontrado para esta aula');
    }
    
    await this.paymentsService.refundPayment(payments[0].id, body.reason);
    return { message: 'Reembolso processado com sucesso' };
  }

  // Endpoint para processar disputas de no-show
  @Post('disputes/:disputeId/resolve')
  @ApiOperation({ summary: 'Resolver disputa de no-show (Admin)' })
  @ApiParam({ name: 'disputeId', description: 'ID da disputa', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiBody({
    description: 'Dados para resolução da disputa de no-show',
    schema: {
      type: 'object',
      properties: {
        resolution: { 
          type: 'string', 
          description: 'Resolução da disputa',
          enum: ['pro_student', 'pro_personal'],
          example: 'pro_student'
        },
        adminNotes: { 
          type: 'string', 
          description: 'Notas do administrador sobre a resolução',
          example: 'Aluno apresentou evidências de presença na aula'
        }
      },
      required: ['resolution']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Disputa de no-show resolvida com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { 
          type: 'string', 
          example: 'Disputa resolvida: Pagamento capturado (no-show confirmado)' 
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Disputa não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Acesso negado - Apenas administradores' 
  })
  async resolveNoShowDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() body: { 
      resolution: 'pro_student' | 'pro_personal';
      adminNotes?: string;
    },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.paymentsService.processNoShowDispute(disputeId, body.resolution, body.adminNotes);
    
    const message = body.resolution === 'pro_personal' 
      ? 'Disputa resolvida: Pagamento capturado (no-show confirmado)'
      : 'Disputa resolvida: Pagamento reembolsado (aluno estava presente)';
      
    return { message };
  }

  // Endpoint para obter status do pagamento de uma aula
  @Get('classes/:classId/status')
  @ApiOperation({ summary: 'Obter status do pagamento de uma aula' })
  @ApiParam({ name: 'classId', description: 'ID da aula', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ 
    status: 200, 
    description: 'Status do pagamento retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        hasPayment: { type: 'boolean', example: true },
        paymentId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
        status: { type: 'string', example: 'authorized' },
        totalAmount: { type: 'number', example: 80.00 },
        platformFee: { type: 'number', example: 8.00 },
        personalAmount: { type: 'number', example: 72.00 },
        createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
        authorizedAt: { type: 'string', example: '2024-01-15T10:05:00.000Z' },
        capturedAt: { type: 'string', example: '2024-01-15T15:00:00.000Z' },
        refundedAt: { type: 'string', example: null },
        canCapture: { type: 'boolean', example: true },
        canRefund: { type: 'boolean', example: true },
        canCancel: { type: 'boolean', example: false }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Aula não encontrada' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getClassPaymentStatus(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Request() req: any,
  ): Promise<any> {
    const payments = await this.paymentsService.getPayments({ classId }, req.user.sub);
    
    if (payments.length === 0) {
      return { hasPayment: false, status: null };
    }

    const payment = payments[0];
    return {
      hasPayment: true,
      paymentId: payment.id,
      status: payment.status,
      totalAmount: payment.totalAmount,
      platformFee: payment.platformFee,
      personalAmount: payment.personalAmount,
      createdAt: payment.createdAt,
      authorizedAt: payment.authorizedAt,
      capturedAt: payment.capturedAt,
      refundedAt: payment.refundedAt,
      canCapture: payment.status === PaymentStatus.AUTHORIZED,
      canRefund: [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED].includes(payment.status),
      canCancel: payment.status === PaymentStatus.PENDING,
    };
  }

  // ===== ENDPOINTS DE PERFIL FINANCEIRO =====
  
  @Get('profile/financial')
  @ApiOperation({ summary: 'Obter perfil financeiro do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Perfil financeiro retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
        bankAccount: {
          type: 'object',
          properties: {
            bank: { type: 'string', example: '001', description: 'Código do banco' },
            agency: { type: 'string', example: '1234', description: 'Agência' },
            account: { type: 'string', example: '56789-0', description: 'Conta' },
            accountType: { type: 'string', example: 'checking', description: 'Tipo da conta' }
          }
        },
        mercadoPagoAccount: {
          type: 'object',
          properties: {
            accountId: { type: 'string', example: '1234567890', description: 'ID da conta MP' },
            email: { type: 'string', example: 'user@email.com', description: 'Email da conta MP' },
            status: { type: 'string', example: 'active', description: 'Status da conta' }
          }
        },
        pixKey: { type: 'string', example: 'user@email.com', description: 'Chave PIX' },
        isVerified: { type: 'boolean', example: true, description: 'Perfil verificado' },
        createdAt: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        updatedAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getFinancialProfile(@Request() req: any) {
    return this.financialProfileService.getFinancialProfile(req.user.sub);
  }

  @Put('profile/financial')
  @ApiOperation({ summary: 'Atualizar perfil financeiro do usuário' })
  @ApiBody({
    description: 'Dados para atualização do perfil financeiro',
    schema: {
      type: 'object',
      properties: {
        bankAccount: {
          type: 'object',
          properties: {
            bank: { type: 'string', example: '001' },
            agency: { type: 'string', example: '1234' },
            account: { type: 'string', example: '56789-0' },
            accountType: { type: 'string', example: 'checking' }
          }
        },
        pixKey: { type: 'string', example: 'user@email.com' }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Perfil financeiro atualizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        message: { type: 'string', example: 'Perfil financeiro atualizado com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async updateFinancialProfile(
    @Body() updateDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.financialProfileService.updateFinancialProfile(req.user.sub, updateDto);
  }

  @Post('profile/financial/validate-bank')
  @ApiOperation({ summary: 'Validar conta bancária' })
  @ApiBody({
    description: 'Dados da conta bancária para validação',
    schema: {
      type: 'object',
      properties: {
        bank: { type: 'string', example: '001', description: 'Código do banco' },
        agency: { type: 'string', example: '1234', description: 'Agência' },
        account: { type: 'string', example: '56789-0', description: 'Conta' },
        accountType: { type: 'string', example: 'checking', description: 'Tipo da conta' }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Conta bancária validada com sucesso',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean', example: true, description: 'Conta válida' },
        message: { type: 'string', example: 'Conta bancária validada com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou conta não encontrada' 
  })
  async validateBankAccount(@Body() validateDto: any) {
    return this.financialProfileService.validateBankAccount(validateDto);
  }

  @Post('profile/financial/validate-mp')
  @ApiOperation({ summary: 'Validar conta do Mercado Pago' })
  @ApiBody({
    description: 'Dados da conta Mercado Pago para validação',
    schema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', example: '1234567890', description: 'ID da conta MP' },
        email: { type: 'string', example: 'user@email.com', description: 'Email da conta MP' }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Conta Mercado Pago validada com sucesso',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean', example: true, description: 'Conta válida' },
        message: { type: 'string', example: 'Conta Mercado Pago validada com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou conta não encontrada' 
  })
  async validateMercadoPago(@Body() validateDto: any) {
    return this.financialProfileService.validateMercadoPago(validateDto);
  }

  @Post('withdrawals/request')
  @ApiOperation({ summary: 'Solicitar novo saque' })
  @ApiBody({
    description: 'Dados para solicitação de saque',
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', example: 100.00, description: 'Valor do saque' },
        bankAccount: { type: 'string', example: '12345-6', description: 'Conta bancária' },
        description: { type: 'string', example: 'Saque mensal', description: 'Descrição do saque' }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Solicitação de saque criada com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        message: { type: 'string', example: 'Solicitação de saque criada com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou saldo insuficiente' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async requestNewWithdrawal(
    @Body() withdrawalDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.financialProfileService.requestWithdrawal(req.user.sub, withdrawalDto);
  }

  @Get('withdrawals/history')
  @ApiOperation({ summary: 'Obter histórico de saques' })
  @ApiResponse({ 
    status: 200, 
    description: 'Histórico de saques retornado com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          amount: { type: 'number', example: 100.00, description: 'Valor do saque' },
          status: { type: 'string', example: 'completed', description: 'Status do saque' },
          bankAccount: { type: 'string', example: '12345-6', description: 'Conta bancária' },
          description: { type: 'string', example: 'Saque mensal', description: 'Descrição' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          processedAt: { type: 'string', example: '2024-01-15T15:00:00.000Z' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getWithdrawalHistory(@Request() req: any) {
    return this.financialProfileService.getWithdrawalHistory(req.user.sub);
  }

  @Get('profile/financial/stats')
  @ApiOperation({ summary: 'Obter estatísticas financeiras pessoais' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas financeiras retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalEarned: { type: 'number', example: 5000.00, description: 'Total ganho' },
        totalWithdrawn: { type: 'number', example: 3500.00, description: 'Total sacado' },
        availableBalance: { type: 'number', example: 1500.00, description: 'Saldo disponível' },
        pendingWithdrawals: { type: 'number', example: 200.00, description: 'Saques pendentes' },
        monthlyEarnings: { type: 'number', example: 800.00, description: 'Ganhos mensais' },
        averageWithdrawal: { type: 'number', example: 250.00, description: 'Média de saques' },
        lastWithdrawal: { type: 'string', example: '2024-01-10T10:00:00.000Z', description: 'Último saque' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getPersonalFinancialStats(@Request() req: any) {
    return this.financialProfileService.getPersonalFinancialStats(req.user.sub);
  }

  // ===== ENDPOINTS DE MÉTODOS DE PAGAMENTO PARA ALUNOS =====
  
  @Get('student/methods')
  @ApiOperation({ summary: 'Obter métodos de pagamento do aluno' })
  @ApiResponse({ 
    status: 200, 
    description: 'Métodos de pagamento retornados com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          type: { type: 'string', example: 'credit_card', description: 'Tipo do método' },
          lastFourDigits: { type: 'string', example: '1234', description: 'Últimos 4 dígitos' },
          brand: { type: 'string', example: 'visa', description: 'Bandeira do cartão' },
          isDefault: { type: 'boolean', example: true, description: 'Método padrão' },
          isActive: { type: 'boolean', example: true, description: 'Método ativo' },
          createdAt: { type: 'string', example: '2024-01-01T00:00:00.000Z' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getStudentPaymentMethods(@Request() req: any) {
    return this.studentPaymentMethodsService.getStudentPaymentMethods(req.user.sub);
  }

  @Put('student/methods')
  @ApiOperation({ summary: 'Atualizar métodos de pagamento do aluno' })
  @ApiBody({
    description: 'Dados para atualização dos métodos de pagamento',
    schema: {
      type: 'object',
      properties: {
        defaultMethodId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID do método padrão' },
        activeMethods: { 
          type: 'array', 
          items: { type: 'string' },
          example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
          description: 'IDs dos métodos ativos'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Métodos de pagamento atualizados com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Métodos de pagamento atualizados com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async updateStudentPaymentMethods(
    @Body() updateDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.updatePaymentMethods(req.user.sub, updateDto);
  }

  @Post('student/cards/save')
  @ApiOperation({ summary: 'Salvar cartão de crédito do aluno' })
  @ApiBody({
    description: 'Dados do cartão para salvar',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', example: 'card_token_123456', description: 'Token do cartão do Mercado Pago' },
        isDefault: { type: 'boolean', example: false, description: 'Definir como método padrão' }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Cartão salvo com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        message: { type: 'string', example: 'Cartão salvo com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou cartão inválido' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async saveCard(
    @Body() saveCardDto: SaveCardDto,
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.saveCard(req.user.sub, saveCardDto);
  }

  @Post('student/cards/validate')
  @ApiOperation({ summary: 'Validar cartão de crédito' })
  @ApiBody({
    description: 'Dados do cartão para validação',
    schema: {
      type: 'object',
      properties: {
        cardNumber: { type: 'string', example: '4111111111111111', description: 'Número do cartão' },
        expiryMonth: { type: 'string', example: '12', description: 'Mês de expiração' },
        expiryYear: { type: 'string', example: '2025', description: 'Ano de expiração' },
        cvv: { type: 'string', example: '123', description: 'Código de segurança' }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Cartão validado com sucesso',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean', example: true, description: 'Cartão válido' },
        message: { type: 'string', example: 'Cartão validado com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou cartão inválido' 
  })
  async validateCard(@Body() validateDto: any) {
    return this.studentPaymentMethodsService.validateCard(validateDto);
  }

  @Delete('student/cards/:cardId')
  @ApiOperation({ summary: 'Remover cartão de crédito do aluno' })
  @ApiParam({ name: 'cardId', description: 'ID do cartão', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiBody({
    description: 'Motivo da remoção do cartão',
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Cartão expirado', description: 'Motivo da remoção' }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Cartão removido com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Cartão removido com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Cartão não encontrado' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async removeCard(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.removeCard(req.user.sub, { cardId, reason: body.reason });
  }

  @Post('student/process-payment')
  @ApiOperation({ summary: 'Processar pagamento de aula pelo aluno' })
  @ApiBody({
    description: 'Dados para processamento do pagamento',
    schema: {
      type: 'object',
      properties: {
        classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID da aula' },
        paymentMethodId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001', description: 'ID do método de pagamento' },
        amount: { type: 'number', example: 80.00, description: 'Valor do pagamento' }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Pagamento processado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        status: { type: 'string', example: 'pending', description: 'Status do pagamento' },
        amount: { type: 'number', example: 80.00, description: 'Valor do pagamento' },
        message: { type: 'string', example: 'Pagamento processado com sucesso' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou método de pagamento inválido' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async processClassPayment(
    @Body() processDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.processClassPayment(req.user.sub, processDto);
  }

  @Get('student/history')
  @ApiOperation({ summary: 'Obter histórico de pagamentos do aluno' })
  @ApiResponse({ 
    status: 200, 
    description: 'Histórico de pagamentos retornado com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          classId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
          amount: { type: 'number', example: 80.00, description: 'Valor do pagamento' },
          status: { type: 'string', example: 'captured', description: 'Status do pagamento' },
          paymentMethod: { type: 'string', example: 'credit_card', description: 'Método de pagamento' },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
          classTitle: { type: 'string', example: 'Aula de Musculação', description: 'Título da aula' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getStudentPaymentHistory(@Request() req: any) {
    // TODO: Implementar no service
    return { message: 'Histórico de pagamentos do aluno' };
  }

  @Get('student/stats')
  @ApiOperation({ summary: 'Obter estatísticas de pagamento do aluno' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas de pagamento retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalPayments: { type: 'number', example: 15, description: 'Total de pagamentos' },
        totalAmount: { type: 'number', example: 1200.00, description: 'Valor total pago' },
        averageAmount: { type: 'number', example: 80.00, description: 'Valor médio por pagamento' },
        successfulPayments: { type: 'number', example: 14, description: 'Pagamentos bem-sucedidos' },
        failedPayments: { type: 'number', example: 1, description: 'Pagamentos falhados' },
        monthlySpending: { type: 'number', example: 320.00, description: 'Gastos mensais' },
        favoritePaymentMethod: { type: 'string', example: 'credit_card', description: 'Método de pagamento preferido' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Token JWT inválido' 
  })
  async getStudentPaymentStats(@Request() req: any) {
    // TODO: Implementar no service
    return { message: 'Estatísticas de pagamento do aluno' };
  }
}
