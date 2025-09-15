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
  MercadoPagoWebhookDto
} from './dto/payments.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly financialProfileService: FinancialProfileService,
    private readonly studentPaymentMethodsService: StudentPaymentMethodsService,
  ) {}

  // Criar preferência de pagamento
  @Post('preference')
  async createPaymentPreference(
    @Body(ValidationPipe) createDto: CreatePaymentPreferenceDto,
    @Request() req: any,
  ): Promise<any> {
    return this.paymentsService.createPaymentPreference(createDto, req.user.sub);
  }

  // Processar webhook do Mercado Pago
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async processWebhook(
    @Body(ValidationPipe) webhookDto: MercadoPagoWebhookDto,
  ): Promise<{ message: string }> {
    await this.paymentsService.processWebhook(webhookDto);
    return { message: 'Webhook processado com sucesso' };
  }

  // Obter pagamento por ID
  @Get(':id')
  async getPaymentById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.getPaymentById(id, req.user.sub);
  }

  // Listar pagamentos com filtros
  @Get()
  async getPayments(
    @Query(ValidationPipe) filters: PaymentFiltersDto,
    @Request() req: any,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments(filters, req.user.sub);
  }

  // Obter estatísticas de pagamentos
  @Get('stats/my')
  async getMyPaymentStats(@Request() req: any): Promise<PaymentStatsDto> {
    return this.paymentsService.getPaymentStats(req.user.sub);
  }

  // Obter estatísticas gerais (admin)
  @Get('stats/all')
  async getAllPaymentStats(): Promise<PaymentStatsDto> {
    return this.paymentsService.getPaymentStats();
  }

  // Endpoints de disputas
  @Post('disputes')
  async createDispute(
    @Body(ValidationPipe) createDto: CreateDisputeDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    return this.paymentsService.createDispute(createDto, req.user.sub);
  }

  @Put('disputes/:id/evidence')
  async submitEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) evidenceDto: SubmitEvidenceDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    return this.paymentsService.submitEvidence(id, evidenceDto, req.user.sub);
  }

  @Put('disputes/:id/resolve')
  async resolveDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) resolveDto: ResolveDisputeDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    return this.paymentsService.resolveDispute(id, resolveDto, req.user.sub);
  }

  @Get('disputes')
  async getDisputes(
    @Query(ValidationPipe) filters: DisputeFiltersDto,
    @Request() req: any,
  ): Promise<DisputeResponseDto[]> {
    // Implementar listagem de disputas
    return [];
  }

  @Get('disputes/:id')
  async getDisputeById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<DisputeResponseDto> {
    // Implementar busca de disputa por ID
    throw new Error('Not implemented');
  }

  // Endpoints de carteira
  @Get('wallet/balance')
  async getWalletBalance(@Request() req: any): Promise<WalletResponseDto> {
    return this.paymentsService.getUserWallet(req.user.sub);
  }

  @Put('wallet')
  async updateWallet(
    @Body(ValidationPipe) updateDto: UpdateWalletDto,
    @Request() req: any,
  ): Promise<WalletResponseDto> {
    return this.paymentsService.updateWallet(req.user.sub, updateDto);
  }

  @Post('wallet/withdraw')
  async requestWithdrawal(
    @Body(ValidationPipe) withdrawDto: WithdrawRequestDto,
    @Request() req: any,
  ): Promise<TransactionResponseDto> {
    return this.paymentsService.requestWithdrawal(req.user.sub, withdrawDto);
  }

  @Get('wallet/transactions')
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
  async getPendingPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: 'pending' }, req.user.sub);
  }

  @Get('authorized')
  async getAuthorizedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: 'authorized' }, req.user.sub);
  }

  @Get('captured')
  async getCapturedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: 'captured' }, req.user.sub);
  }

  @Get('refunded')
  async getRefundedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: 'refunded' }, req.user.sub);
  }

  @Get('disputed')
  async getDisputedPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ status: 'disputed' }, req.user.sub);
  }

  // Endpoints para classes específicas
  @Get('class/:classId')
  async getPaymentsByClass(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Request() req: any,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ classId }, req.user.sub);
  }

  // Endpoints para relatórios
  @Get('reports/daily')
  async getDailyReport(@Request() req: any): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.paymentsService.getPayments({
      startDate: today,
      endDate: new Date(),
    }, req.user.sub);
  }

  @Get('reports/weekly')
  async getWeeklyReport(@Request() req: any): Promise<any> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    return this.paymentsService.getPayments({
      startDate: weekAgo,
      endDate: new Date(),
    }, req.user.sub);
  }

  @Get('reports/monthly')
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
  async getDisputeNotifications(@Request() req: any): Promise<any[]> {
    // Implementar notificações de disputa
    return [];
  }

  @Post('disputes/:id/notify')
  async sendDisputeNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    // Implementar envio de notificação de disputa
    return { message: 'Notificação enviada com sucesso' };
  }

  // Endpoints para administração
  @Get('admin/dashboard')
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
  async getPendingDisputes(): Promise<DisputeResponseDto[]> {
    // Implementar listagem de disputas pendentes para admin
    return [];
  }

  @Get('admin/users/:userId/payments')
  async getUserPayments(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPayments({ userId }, userId);
  }

  @Get('admin/users/:userId/wallet')
  async getUserWallet(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<WalletResponseDto> {
    return this.paymentsService.getUserWallet(userId);
  }

  // Endpoints para integração com aulas
  @Post('classes/:classId/capture')
  async captureClassPayment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.paymentsService.capturePaymentAfterClass(classId, body.reason);
    return { message: 'Pagamento capturado e split aplicado com sucesso' };
  }

  @Post('classes/:classId/cancel')
  async cancelClassPayment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.paymentsService.cancelPaymentBeforeClass(classId, body.reason);
    return { message: 'Pagamento cancelado e reembolso processado com sucesso' };
  }

  @Post('classes/:classId/refund')
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
      canCapture: payment.status === 'authorized',
      canRefund: ['authorized', 'captured'].includes(payment.status),
      canCancel: payment.status === 'pending',
    };
  }

  // ===== ENDPOINTS DE PERFIL FINANCEIRO =====
  
  @Get('profile/financial')
  async getFinancialProfile(@Request() req: any) {
    return this.financialProfileService.getFinancialProfile(req.user.sub);
  }

  @Put('profile/financial')
  async updateFinancialProfile(
    @Body() updateDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.financialProfileService.updateFinancialProfile(req.user.sub, updateDto);
  }

  @Post('profile/financial/validate-bank')
  async validateBankAccount(@Body() validateDto: any) {
    return this.financialProfileService.validateBankAccount(validateDto);
  }

  @Post('profile/financial/validate-mp')
  async validateMercadoPago(@Body() validateDto: any) {
    return this.financialProfileService.validateMercadoPago(validateDto);
  }

  @Post('withdrawals/request')
  async requestNewWithdrawal(
    @Body() withdrawalDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.financialProfileService.requestWithdrawal(req.user.sub, withdrawalDto);
  }

  @Get('withdrawals/history')
  async getWithdrawalHistory(@Request() req: any) {
    return this.financialProfileService.getWithdrawalHistory(req.user.sub);
  }

  @Get('profile/financial/stats')
  async getPersonalFinancialStats(@Request() req: any) {
    return this.financialProfileService.getPersonalFinancialStats(req.user.sub);
  }

  // ===== ENDPOINTS DE MÉTODOS DE PAGAMENTO PARA ALUNOS =====
  
  @Get('student/methods')
  async getStudentPaymentMethods(@Request() req: any) {
    return this.studentPaymentMethodsService.getStudentPaymentMethods(req.user.sub);
  }

  @Put('student/methods')
  async updateStudentPaymentMethods(
    @Body() updateDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.updatePaymentMethods(req.user.sub, updateDto);
  }

  @Post('student/cards/save')
  async saveCard(
    @Body() saveCardDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.saveCard(req.user.sub, saveCardDto);
  }

  @Post('student/cards/validate')
  async validateCard(@Body() validateDto: any) {
    return this.studentPaymentMethodsService.validateCard(validateDto);
  }

  @Delete('student/cards/:cardId')
  async removeCard(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.removeCard(req.user.sub, { cardId, reason: body.reason });
  }

  @Post('student/process-payment')
  async processClassPayment(
    @Body() processDto: any, // TODO: Importar DTO correto
    @Request() req: any,
  ) {
    return this.studentPaymentMethodsService.processClassPayment(req.user.sub, processDto);
  }

  @Get('student/history')
  async getStudentPaymentHistory(@Request() req: any) {
    // TODO: Implementar no service
    return { message: 'Histórico de pagamentos do aluno' };
  }

  @Get('student/stats')
  async getStudentPaymentStats(@Request() req: any) {
    // TODO: Implementar no service
    return { message: 'Estatísticas de pagamento do aluno' };
  }
}
