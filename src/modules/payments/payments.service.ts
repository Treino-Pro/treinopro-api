import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, and, or, desc, count, sum, sql, inArray } from 'drizzle-orm';
import {
  payments,
  paymentDisputes,
  paymentTransactions,
  userWallets,
  users,
  classes,
} from '../../database/schema';
import {
  withdrawalRequests,
  withdrawalHistory,
} from '../../database/schema/payments';
import {
  MercadoPagoService,
  CreatePreferenceData,
  MPPreferenceResponse,
} from './mercadopago.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  PaymentStatus,
  PaymentType,
  DisputeStatus,
  MercadoPagoWebhookDto,
  MercadoPagoSplitDto,
  TransferRequestDto,
  ApproveWithdrawalDto,
  RejectWithdrawalDto,
  WithdrawalResponseDto,
} from './dto/payments.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Delegador público para createPixPayment (evita acesso por string de index)
  async createPixPayment(pixData: {
    amount: number;
    description: string;
    externalReference: string;
    payerEmail: string;
    payerFirstName?: string;
    payerLastName?: string;
    payerCpf?: string;
    notificationUrl?: string;
  }): Promise<{
    paymentId: string;
    status: string;
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl?: string;
    expiresAt?: string;
  }> {
    return this.mercadoPagoService.createPixPayment(pixData);
  }

  // Delegador para reembolso direto pelo ID numérico do MP (PIX de propostas)
  async createRefundByMpId(
    mpPaymentId: string,
    reason?: string,
  ): Promise<any> {
    return this.mercadoPagoService.createRefund(mpPaymentId, { reason });
  }

  async cancelMpPayment(mpPaymentId: string): Promise<any> {
    return this.mercadoPagoService.cancelPayment(mpPaymentId);
  }

  async searchMpPayments(params: {
    externalReference?: string;
    status?: string;
    dateCreatedFrom?: string;
    dateCreatedTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    return this.mercadoPagoService.searchPayments(params);
  }

  // Repasse de split PIX para a conta MP do personal (chamado após conclusão de aula)
  async transferPixSplitToPersonal(data: {
    personalId: string;
    amount: number;
    classId: string;
    proposalId: string;
  }): Promise<void> {
    try {
      const financialProfile =
        await this.db.query.financialProfiles.findFirst({
          where: (fp: any, { eq }: any) => eq(fp.userId, data.personalId),
        });

      if (!financialProfile?.canReceivePayments || !financialProfile.mpUserId) {
        console.warn(
          `⚠️ [SPLIT PIX] Personal ${data.personalId} não tem conta MP vinculada — repasse externo pulado (carteira interna mantida)`,
        );
        return;
      }

      const idempotencyKey = `split_${data.classId}_${data.proposalId}`;
      const result = await this.mercadoPagoService.sendMpTransfer({
        destinationMpUserId: financialProfile.mpUserId,
        amount: data.amount,
        idempotencyKey,
      });

      if (result.success) {
        console.log(
          `✅ [SPLIT PIX] Repasse de R$${data.amount.toFixed(2)} enviado para personal ${data.personalId} (transferId=${result.transferId})`,
        );
      } else {
        console.error(
          `❌ [SPLIT PIX] Falha no repasse para personal ${data.personalId}: ${result.error}`,
        );
      }
    } catch (error) {
      console.error(
        `❌ [SPLIT PIX] Erro inesperado ao transferir repasse:`,
        error,
      );
      // Não propagar erro — não deve bloquear a conclusão da aula
    }
  }

  // Delegadores públicos tipados para MercadoPagoService (evitam acesso por string de índice)
  async getMpPayment(mpPaymentId: string): Promise<any> {
    return this.mercadoPagoService.getPayment(mpPaymentId);
  }

  mapMpPaymentStatus(mpStatus: string): string {
    return this.mercadoPagoService.mapPaymentStatus(mpStatus);
  }

  async createMpPreference(
    data: CreatePreferenceData,
  ): Promise<MPPreferenceResponse> {
    return this.mercadoPagoService.createPreference(data);
  }

  // Criar preferência de pagamento no Mercado Pago
  async createPaymentPreference(
    createDto: CreatePaymentPreferenceDto,
    userId: string,
  ): Promise<any> {
    // Verificar configuração do Mercado Pago
    if (!this.mercadoPagoService.isConfigured()) {
      throw new BadRequestException(
        'Mercado Pago não está configurado corretamente',
      );
    }

    // Verificar se a aula existe e o usuário é o aluno
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, createDto.classId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    if (classData.studentId !== userId) {
      throw new ForbiddenException(
        'Apenas o aluno pode criar pagamento para esta aula',
      );
    }

    // Verificar se já existe pagamento para esta aula
    const existingPayment = await this.db.query.payments.findFirst({
      where: and(
        eq(payments.classId, createDto.classId),
        eq(payments.studentId, userId),
      ),
    });

    if (existingPayment) {
      throw new BadRequestException('Já existe um pagamento para esta aula');
    }

    // Calcular valores usando variável de ambiente
    const platformFeePercentage =
      parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10') / 100;
    const platformFee = createDto.totalAmount * platformFeePercentage;
    const personalAmount = createDto.totalAmount - platformFee;

    // Criar registro de pagamento no banco
    const [newPayment] = await this.db
      .insert(payments)
      .values({
        classId: createDto.classId,
        studentId: userId,
        personalId: classData.personalId,
        totalAmount: createDto.totalAmount.toString(),
        platformFee: platformFee.toString(),
        personalAmount: personalAmount.toString(),
        status: PaymentStatus.PENDING,
        type: PaymentType.CLASS_PAYMENT,
      })
      .returning();

    // Preparar dados para o Mercado Pago
    const preferenceData: CreatePreferenceData = {
      classId: createDto.classId,
      title: `${classData.location} - ${classData.date.toLocaleDateString()}`,
      totalAmount: createDto.totalAmount,
      platformFee,
      personalAmount,
      studentEmail: classData.student.email,
      personalEmail: classData.personal.email,
      externalReference: newPayment.id,
    };

    // Criar preferência no Mercado Pago
    const mpPreference =
      await this.mercadoPagoService.createPreference(preferenceData);

    // Atualizar registro com ID da preferência
    await this.db
      .update(payments)
      .set({
        mpPreferenceId: mpPreference.id,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, newPayment.id));

    return {
      preferenceId: mpPreference.id,
      initPoint: mpPreference.initPoint,
      sandboxInitPoint: mpPreference.sandboxInitPoint,
      paymentId: newPayment.id,
      totalAmount: createDto.totalAmount,
      platformFee,
      personalAmount,
    };
  }

  // Processar webhook do Mercado Pago
  async processWebhook(
    webhookDto: MercadoPagoWebhookDto,
    headers?: any,
  ): Promise<void> {
    const { id, type } = webhookDto;

    // Validar webhook
    if (
      headers &&
      !this.mercadoPagoService.validateWebhook(webhookDto, headers)
    ) {
      throw new BadRequestException('Webhook inválido');
    }

    if (type === 'payment') {
      // Buscar informações do pagamento no Mercado Pago
      const mpPaymentData = await this.mercadoPagoService.getPayment(id);

      if (!mpPaymentData || !mpPaymentData.external_reference) {
        throw new NotFoundException('Pagamento não encontrado no Mercado Pago');
      }

      // Buscar pagamento no banco usando external_reference (nosso ID)
      const payment = await this.db.query.payments.findFirst({
        where: eq(payments.id, mpPaymentData.external_reference),
        with: {
          class: true,
          student: true,
          personal: true,
        },
      });

      if (!payment) {
        throw new NotFoundException(
          'Pagamento não encontrado no banco de dados',
        );
      }

      // Mapear status do MP para nosso sistema
      const newStatus = this.mercadoPagoService.mapPaymentStatus(
        mpPaymentData.status,
      );

      // Atualizar status do pagamento
      await this.updatePaymentStatus(
        payment.id,
        newStatus as PaymentStatus,
        id,
        mpPaymentData,
      );

      // Log para auditoria
      console.log(`Webhook processado: Payment ${id} -> Status ${newStatus}`);
    }
  }

  // Atualizar status do pagamento
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    mpPaymentId?: string,
    mpData?: any,
  ): Promise<void> {
    const currentPayment = await this.db.query.payments.findFirst({
      where: eq(payments.id, paymentId),
    });

    if (!currentPayment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (mpPaymentId) {
      updateData.mpPaymentId = mpPaymentId;
    }

    // Salvar dados completos do MP para auditoria
    if (mpData) {
      updateData.splitData = {
        mpPaymentData: mpData,
        processedAt: new Date(),
      };
    }

    if (status === PaymentStatus.AUTHORIZED) {
      updateData.authorizedAt = new Date();
      console.log(`💰 Pagamento ${paymentId} AUTORIZADO (em custódia)`);
    } else if (status === PaymentStatus.CAPTURED) {
      updateData.capturedAt = new Date();
      console.log(`✅ Pagamento ${paymentId} CAPTURADO`);
    } else if (status === PaymentStatus.REFUNDED) {
      updateData.refundedAt = new Date();
      console.log(`🔄 Pagamento ${paymentId} REEMBOLSADO`);
    } else if (status === PaymentStatus.CANCELLED) {
      console.log(`❌ Pagamento ${paymentId} CANCELADO`);
    }

    // Aplicar split apenas na transição real para CAPTURED
    if (
      status === PaymentStatus.CAPTURED &&
      currentPayment.status !== PaymentStatus.CAPTURED
    ) {
      console.log(`💳 Pagamento ${paymentId} - aplicando split e repasse`);
      await this.capturePayment(paymentId);
    }

    await this.db
      .update(payments)
      .set(updateData)
      .where(eq(payments.id, paymentId));
  }

  // Capturar pagamento e aplicar split
  async capturePayment(paymentId: string): Promise<void> {
    const payment = await this.db.query.payments.findFirst({
      where: eq(payments.id, paymentId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    // Aplicar split do Mercado Pago
    const splitData: MercadoPagoSplitDto = {
      marketplace: process.env.MP_MARKETPLACE_ID || 'marketplace_id',
      marketplace_fee: payment.platformFee,
      application_fee: '0',
      amount: payment.personalAmount,
    };

    // Atualizar split data
    await this.db
      .update(payments)
      .set({
        splitData,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    // Atualizar carteiras
    await this.updateWallets(payment);
  }

  // Atualizar carteiras dos usuários
  async updateWallets(payment: any): Promise<void> {
    console.log(
      '💰 [UPDATE_WALLETS] ===== INÍCIO DO REPASSE PARA O PERSONAL =====',
    );
    console.log('💰 [UPDATE_WALLETS] Payment ID:', payment.id);
    console.log('💰 [UPDATE_WALLETS] Class ID:', payment.classId);
    console.log('💰 [UPDATE_WALLETS] Personal ID:', payment.personalId);
    console.log('💰 [UPDATE_WALLETS] Student ID:', payment.studentId);
    console.log('💰 [UPDATE_WALLETS] Valores:', {
      totalAmount: payment.totalAmount,
      platformFee: payment.platformFee,
      personalAmount: payment.personalAmount,
      status: payment.status,
    });

    // Buscar carteira atual do personal
    const personalWallet = await this.getUserWallet(payment.personalId);
    console.log('💰 [UPDATE_WALLETS] Carteira atual do personal:', {
      personalId: payment.personalId,
      availableBalance: personalWallet.availableBalance,
      totalEarned: personalWallet.totalEarned,
    });

    // Calcular novos valores
    const newAvailableBalance =
      personalWallet.availableBalance + parseFloat(payment.personalAmount);
    const newTotalEarned =
      personalWallet.totalEarned + parseFloat(payment.personalAmount);

    console.log('💰 [UPDATE_WALLETS] Novos valores calculados:', {
      valorAdicionado: payment.personalAmount,
      novoSaldoDisponivel: newAvailableBalance,
      novoTotalGanho: newTotalEarned,
    });

    // Atualizar carteira do personal (somar ganhos)
    await this.updateWallet(payment.personalId, {
      availableBalance: newAvailableBalance,
      totalEarned: newTotalEarned,
    });

    console.log(
      '✅ [UPDATE_WALLETS] Carteira do personal atualizada com sucesso',
    );
    console.log(
      `💳 [UPDATE_WALLETS] Personal ${payment.personalId} recebeu: +R$ ${payment.personalAmount}`,
    );

    // Criar transações
    console.log(
      '📝 [UPDATE_WALLETS] Criando transação de ganhos do personal...',
    );
    await this.createTransaction({
      paymentId: payment.id,
      userId: payment.personalId,
      type: PaymentType.PERSONAL_EARNINGS,
      amount: parseFloat(payment.personalAmount),
      description: `Ganhos da aula ${payment.classId}`,
      status: PaymentStatus.CAPTURED,
    });
    console.log('✅ [UPDATE_WALLETS] Transação de ganhos do personal criada');

    console.log(
      '📝 [UPDATE_WALLETS] Criando transação de pagamento do aluno...',
    );
    await this.createTransaction({
      paymentId: payment.id,
      userId: payment.studentId,
      type: PaymentType.CLASS_PAYMENT,
      amount: -parseFloat(payment.totalAmount),
      description: `Pagamento da aula ${payment.classId}`,
      status: PaymentStatus.CAPTURED,
    });
    console.log('✅ [UPDATE_WALLETS] Transação de pagamento do aluno criada');

    console.log(
      '💰 [UPDATE_WALLETS] ===== REPASSE CONCLUÍDO COM SUCESSO =====',
    );
  }

  // Criar disputa
  async createDispute(
    createDto: CreateDisputeDto,
    userId: string,
  ): Promise<DisputeResponseDto> {
    const payment = await this.db.query.payments.findFirst({
      where: eq(payments.id, createDto.paymentId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    // Verificar se o usuário pode criar disputa
    if (payment.studentId !== userId && payment.personalId !== userId) {
      throw new ForbiddenException(
        'Usuário não autorizado a criar disputa para este pagamento',
      );
    }

    // Verificar se já existe disputa ativa
    const existingDispute = await this.db.query.paymentDisputes.findFirst({
      where: and(
        eq(paymentDisputes.paymentId, createDto.paymentId),
        eq(paymentDisputes.status, DisputeStatus.PENDING),
      ),
    });

    if (existingDispute) {
      throw new BadRequestException(
        'Já existe uma disputa ativa para este pagamento',
      );
    }

    // Calcular expiração (48h)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    // Buscar contadores de disputas
    const studentDisputes = await this.db
      .select({ count: count() })
      .from(paymentDisputes)
      .where(
        and(
          eq(paymentDisputes.reportedBy, payment.studentId),
          eq(paymentDisputes.status, DisputeStatus.RESOLVED_PRO_PERSONAL),
        ),
      );

    const personalDisputes = await this.db
      .select({ count: count() })
      .from(paymentDisputes)
      .where(
        and(
          eq(paymentDisputes.reportedBy, payment.personalId),
          eq(paymentDisputes.status, DisputeStatus.RESOLVED_PRO_STUDENT),
        ),
      );

    const [newDispute] = await this.db
      .insert(paymentDisputes)
      .values({
        paymentId: createDto.paymentId,
        reportedBy: userId,
        reason: createDto.reason,
        description: createDto.description,
        status: DisputeStatus.PENDING,
        expiresAt,
        studentDisputeCount: studentDisputes[0]?.count || 0,
        personalDisputeCount: personalDisputes[0]?.count || 0,
      })
      .returning();

    // Atualizar status do pagamento para disputado
    await this.updatePaymentStatus(createDto.paymentId, PaymentStatus.DISPUTED);

    // Criar notificação in-app para o outro usuário (que não criou a disputa)
    try {
      const otherUserId =
        payment.studentId === userId ? payment.personalId : payment.studentId;
      const classData = await this.db.query.classes.findFirst({
        where: eq(classes.id, payment.classId),
      });

      await this.notificationsService.sendInAppNotification(
        otherUserId,
        'dispute-created',
        {
          disputeId: newDispute.id,
          classId: payment.classId,
          paymentId: createDto.paymentId,
          reason: createDto.reason,
          message: `Uma disputa foi criada sobre sua aula${classData ? ` de ${classData.date}` : ''}`,
        },
      );
    } catch (error) {
      console.error('❌ Erro ao criar notificação in-app de disputa:', error);
      // Não bloquear a criação da disputa se notificação falhar
    }

    return this.formatDisputeResponse(newDispute);
  }

  // Submeter evidências
  async submitEvidence(
    disputeId: string,
    evidenceDto: SubmitEvidenceDto,
    userId: string,
  ): Promise<DisputeResponseDto> {
    const dispute = await this.db.query.paymentDisputes.findFirst({
      where: eq(paymentDisputes.id, disputeId),
      with: {
        payment: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa não encontrada');
    }

    // Verificar se o usuário pode submeter evidências
    if (
      dispute.payment.studentId !== userId &&
      dispute.payment.personalId !== userId
    ) {
      throw new ForbiddenException(
        'Usuário não autorizado a submeter evidências para esta disputa',
      );
    }

    // Verificar se a disputa ainda está ativa
    if (dispute.status !== DisputeStatus.PENDING) {
      throw new BadRequestException('Disputa não está mais ativa');
    }

    // Verificar se não expirou
    if (new Date() > dispute.expiresAt) {
      await this.db
        .update(paymentDisputes)
        .set({
          status: DisputeStatus.EXPIRED,
          updatedAt: new Date(),
        })
        .where(eq(paymentDisputes.id, disputeId));

      throw new BadRequestException('Disputa expirada');
    }

    // Determinar se é evidência do aluno ou personal
    const isStudent = dispute.payment.studentId === userId;
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (isStudent) {
      updateData.studentEvidence = evidenceDto.evidence;
    } else {
      updateData.personalEvidence = evidenceDto.evidence;
    }

    // Se ambos submeteram evidências, mover para análise
    if (dispute.studentEvidence && dispute.personalEvidence) {
      updateData.status = DisputeStatus.UNDER_REVIEW;
    }

    const [updatedDispute] = await this.db
      .update(paymentDisputes)
      .set(updateData)
      .where(eq(paymentDisputes.id, disputeId))
      .returning();

    return this.formatDisputeResponse(updatedDispute);
  }

  // Listar disputas (admin) com filtros e paginação
  async listDisputes(filters?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: DisputeResponseDto[];
    total: number;
    totalPages: number;
  }> {
    const pageNum = Math.max(1, filters?.page ?? 1);
    const limitNum = Math.min(100, Math.max(1, filters?.limit ?? 20));
    const offset = (pageNum - 1) * limitNum;

    const whereConditions = [];
    if (filters?.status) {
      whereConditions.push(eq(paymentDisputes.status, filters.status as any));
    }

    const [itemsRaw, countResult] = await Promise.all([
      this.db.query.paymentDisputes.findMany({
        where: whereConditions.length ? and(...whereConditions) : undefined,
        with: {
          payment: {
            with: {
              student: true,
              personal: true,
            },
          },
          reportedByUser: true,
        },
        orderBy: [desc(paymentDisputes.createdAt)],
        limit: limitNum,
        offset,
      }),
      this.db
        .select({ count: count() })
        .from(paymentDisputes)
        .where(whereConditions.length ? and(...whereConditions) : undefined),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(total / limitNum) || 1;
    const items = itemsRaw.map((d) => this.formatDisputeResponse(d));
    return { items, total, totalPages };
  }

  // Obter disputa por ID (admin)
  async getDisputeById(disputeId: string): Promise<DisputeResponseDto> {
    const dispute = await this.db.query.paymentDisputes.findFirst({
      where: eq(paymentDisputes.id, disputeId),
      with: {
        payment: {
          with: {
            student: true,
            personal: true,
          },
        },
        reportedByUser: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa não encontrada');
    }

    return this.formatDisputeResponse(dispute);
  }

  // Resolver disputa (admin)
  async resolveDispute(
    disputeId: string,
    resolveDto: ResolveDisputeDto,
    adminId: string,
  ): Promise<DisputeResponseDto> {
    const dispute = await this.db.query.paymentDisputes.findFirst({
      where: eq(paymentDisputes.id, disputeId),
      with: {
        payment: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa não encontrada');
    }

    if (dispute.status !== DisputeStatus.UNDER_REVIEW) {
      throw new BadRequestException('Disputa não está em análise');
    }

    const [updatedDispute] = await this.db
      .update(paymentDisputes)
      .set({
        status: resolveDto.resolution,
        resolution: resolveDto.resolution,
        adminNotes: resolveDto.adminNotes,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentDisputes.id, disputeId))
      .returning();

    // Aplicar resolução
    if (resolveDto.resolution === DisputeStatus.RESOLVED_PRO_PERSONAL) {
      // Capturar pagamento (personal ganha)
      await this.capturePayment(dispute.paymentId);
    } else if (resolveDto.resolution === DisputeStatus.RESOLVED_PRO_STUDENT) {
      // Reembolsar aluno
      await this.refundPayment(dispute.paymentId);
    }

    return this.formatDisputeResponse(updatedDispute);
  }

  // Reembolsar pagamento
  async refundPayment(paymentId: string, reason?: string): Promise<void> {
    const payment = await this.db.query.payments.findFirst({
      where: eq(payments.id, paymentId),
      with: {
        class: true,
        student: true,
        personal: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    if (
      payment.status === PaymentStatus.REFUNDED ||
      payment.status === PaymentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Pagamento já foi reembolsado ou cancelado',
      );
    }

    // Reembolsar no Mercado Pago se tiver mpPaymentId
    if (payment.mpPaymentId) {
      let mpStatus: string | undefined;

      try {
        console.log(
          `[MercadoPagoService] Buscando status real do pagamento MP: ${payment.mpPaymentId}`,
        );
        // Buscar status real no Mercado Pago para decidir entre reembolso ou cancelamento
        const mpPayment = await this.mercadoPagoService.getPayment(
          payment.mpPaymentId,
        );
        mpStatus = mpPayment?.status;
      } catch (error) {
        console.error(
          `❌ Erro ao consultar status MP para ${payment.mpPaymentId}:`,
          error,
        );
        // Se falhar a consulta, não podemos assumir se é reembolso ou cancelamento.
        // Tentamos o reembolso padrão como último recurso (pode falhar se for authorized).
        throw new BadRequestException(
          `Não foi possível verificar o status do pagamento no Mercado Pago. Erro: ${error.message}`,
        );
      }

      if (mpStatus === 'authorized' || mpStatus === 'pending') {
        // Se apenas autorizado (custódia) ou pendente, cancelar a autorização
        console.log(
          `ℹ️ Pagamento MP ${payment.mpPaymentId} está como '${mpStatus}'. Cancelando autorização em vez de reembolsar.`,
        );
        await this.mercadoPagoService.cancelPayment(payment.mpPaymentId);
        console.log(`🔄 Autorização cancelada no MP: ${payment.mpPaymentId}`);
      } else if (mpStatus === 'approved') {
        // Se aprovado, realizar o reembolso normal
        console.log(
          `ℹ️ Pagamento MP ${payment.mpPaymentId} está como '${mpStatus}'. Processando reembolso.`,
        );
        await this.mercadoPagoService.refundPayment(payment.mpPaymentId);
        console.log(`🔄 Reembolso processado no MP: ${payment.mpPaymentId}`);
      } else if (mpStatus === 'cancelled' || mpStatus === 'refunded') {
        console.log(
          `ℹ️ Pagamento MP ${payment.mpPaymentId} já está em estado terminal: ${mpStatus}`,
        );
      } else {
        console.warn(
          `⚠️ Status do pagamento MP ${payment.mpPaymentId} é '${mpStatus}'. Tentando reembolso padrão.`,
        );
        await this.mercadoPagoService.refundPayment(payment.mpPaymentId);
        console.log(
          `🔄 Reembolso (fallback) processado no MP: ${payment.mpPaymentId}`,
        );
      }
    }

    // Atualizar status
    await this.updatePaymentStatus(paymentId, PaymentStatus.REFUNDED);

    // Reverter saldo da carteira do personal se já foi creditado
    if (payment.status === PaymentStatus.CAPTURED) {
      const personalWallet = await this.getUserWallet(payment.personalId);
      await this.updateWallet(payment.personalId, {
        availableBalance:
          personalWallet.availableBalance - parseFloat(payment.personalAmount),
        totalEarned:
          personalWallet.totalEarned - parseFloat(payment.personalAmount),
      });

      console.log(
        `💳 Carteira do personal ${payment.personalId} revertida: -R$ ${payment.personalAmount}`,
      );
    }

    // Criar transação de reembolso
    await this.createTransaction({
      paymentId,
      userId: payment.studentId,
      type: PaymentType.REFUND,
      amount: parseFloat(payment.totalAmount),
      description: reason || `Reembolso da aula ${payment.classId}`,
      status: PaymentStatus.REFUNDED,
    });

    console.log(
      `✅ Reembolso completo para pagamento ${paymentId}: R$ ${payment.totalAmount}`,
    );
  }

  // Capturar pagamento após aula concluída (fluxo normal)
  async capturePaymentAfterClass(
    classId: string,
    reason: string = 'Aula concluída',
  ): Promise<void> {
    console.log(
      '💰 [CAPTURE_AFTER_CLASS] ===== INICIANDO CAPTURA APÓS AULA =====',
    );
    console.log('💰 [CAPTURE_AFTER_CLASS] Class ID:', classId);
    console.log('💰 [CAPTURE_AFTER_CLASS] Reason:', reason);

    const payment = await this.db.query.payments.findFirst({
      where: eq(payments.classId, classId),
      with: {
        class: true,
        student: true,
        personal: true,
      },
    });

    if (!payment) {
      console.error(
        '❌ [CAPTURE_AFTER_CLASS] Pagamento não encontrado para esta aula',
      );
      throw new NotFoundException('Pagamento não encontrado para esta aula');
    }

    console.log('💰 [CAPTURE_AFTER_CLASS] Pagamento encontrado:', {
      id: payment.id,
      status: payment.status,
      totalAmount: payment.totalAmount,
      personalAmount: payment.personalAmount,
      mpPaymentId: payment.mpPaymentId,
    });

    // Aceitar tanto AUTHORIZED (webhook mapeado) quanto PENDING (sem webhook)
    const canCapture =
      payment.status === PaymentStatus.AUTHORIZED ||
      payment.status === PaymentStatus.PENDING;
    if (!canCapture) {
      console.error(
        '❌ [CAPTURE_AFTER_CLASS] Pagamento não está em estado capturável. Status atual:',
        payment.status,
      );
      throw new BadRequestException(
        `Pagamento não está em estado capturável. Status atual: ${payment.status}`,
      );
    }
    if (payment.status === PaymentStatus.PENDING) {
      console.warn(
        '⚠️ [CAPTURE_AFTER_CLASS] Pagamento em PENDING (sem webhook AUTHORIZED). Forçando captura e split.',
      );
    }

    // Capturar no Mercado Pago (com tratamento de erro)
    let mpCaptureSuccess = false;
    if (payment.mpPaymentId) {
      try {
        console.log(
          '💳 [CAPTURE_AFTER_CLASS] Capturando pagamento no Mercado Pago:',
          payment.mpPaymentId,
        );
        await this.mercadoPagoService.capturePayment(payment.mpPaymentId);
        console.log(
          `✅ [CAPTURE_AFTER_CLASS] Captura processada no MP: ${payment.mpPaymentId}`,
        );
        mpCaptureSuccess = true;
      } catch (error) {
        console.error(
          `❌ [CAPTURE_AFTER_CLASS] Falha ao capturar no MP: ${error.message}`,
        );
        console.warn(
          '⚠️ [CAPTURE_AFTER_CLASS] Continuando com split local mesmo com falha no MP',
        );
        mpCaptureSuccess = false;
      }
    } else {
      console.warn(
        '⚠️ [CAPTURE_AFTER_CLASS] Pagamento não tem mpPaymentId - pode ser simulação',
      );
      mpCaptureSuccess = true; // Simulações sempre "funcionam"
    }

    // Atualizar status para capturado (isso vai aplicar o split)
    console.log('🔄 [CAPTURE_AFTER_CLASS] Atualizando status para CAPTURED...');
    await this.updatePaymentStatus(payment.id, PaymentStatus.CAPTURED);

    if (!mpCaptureSuccess) {
      console.warn(
        '⚠️ [CAPTURE_AFTER_CLASS] Split aplicado localmente apesar da falha no MP',
      );
    }

    console.log(
      `✅ [CAPTURE_AFTER_CLASS] Pagamento capturado após conclusão da aula ${classId}: R$ ${payment.totalAmount}`,
    );
    console.log(
      '💰 [CAPTURE_AFTER_CLASS] ===== CAPTURA APÓS AULA FINALIZADA =====',
    );
  }

  // Cancelar pagamento (personal cancela antes da aula)
  async cancelPaymentBeforeClass(
    classId: string,
    reason: string = 'Aula cancelada pelo personal',
    proposalId?: string,
  ): Promise<void> {
    // Tentar localizar pelo classId primeiro; se não encontrar, tentar pelo proposalId.
    // O vínculo payment→class só é consolidado após o início da aula (ensurePaymentLinkedToClass),
    // portanto para aulas recém-criadas o pagamento pode só ter proposalId.
    let payment = await this.db.query.payments.findFirst({
      where: eq(payments.classId, classId),
    });

    if (!payment && proposalId) {
      payment = await this.db.query.payments.findFirst({
        where: eq(payments.proposalId, proposalId),
      });
    }

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado para esta aula');
    }

    if (
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'Pagamento já foi cancelado ou reembolsado',
      );
    }

    // Reembolsar totalmente
    await this.refundPayment(payment.id, reason);

    console.log(
      `❌ Pagamento cancelado antes da aula ${classId} - reembolso total`,
    );
  }

  // Processar disputa de no-show
  async processNoShowDispute(
    disputeId: string,
    resolution: 'pro_student' | 'pro_personal',
  ): Promise<void> {
    const dispute = await this.db.query.paymentDisputes.findFirst({
      where: eq(paymentDisputes.id, disputeId),
      with: {
        payment: {
          with: {
            class: true,
            student: true,
            personal: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa não encontrada');
    }

    const payment = dispute.payment;

    if (resolution === 'pro_personal') {
      // Personal tinha razão - aluno não compareceu
      // Capturar pagamento (split aplicado)
      if (payment.status === PaymentStatus.AUTHORIZED) {
        await this.capturePaymentAfterClass(
          payment.classId,
          'No-show confirmado - ausência do aluno',
        );
      }

      console.log(
        `⚖️ Disputa resolvida PRÓ-PERSONAL: Pagamento ${payment.id} capturado`,
      );
    } else if (resolution === 'pro_student') {
      // Aluno tinha razão - estava presente
      // Reembolsar totalmente
      await this.refundPayment(
        payment.id,
        'Disputa resolvida - aluno estava presente',
      );

      console.log(
        `⚖️ Disputa resolvida PRÓ-ALUNO: Pagamento ${payment.id} reembolsado`,
      );
    }

    // Atualizar status do pagamento para dispute_resolved
    await this.updatePaymentStatus(payment.id, PaymentStatus.DISPUTE_RESOLVED);
  }

  // Obter pagamento por ID
  async getPaymentById(
    paymentId: string,
    userId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.db.query.payments.findFirst({
      where: and(
        eq(payments.id, paymentId),
        or(eq(payments.studentId, userId), eq(payments.personalId, userId)),
      ),
      with: {
        class: true,
        student: true,
        personal: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    return this.formatPaymentResponse(payment);
  }

  // Listar pagamentos com filtros
  async getPayments(
    filters: PaymentFiltersDto,
    userId: string,
  ): Promise<PaymentResponseDto[]> {
    const whereConditions = [
      or(eq(payments.studentId, userId), eq(payments.personalId, userId)),
    ];

    if (filters.status) {
      whereConditions.push(eq(payments.status, filters.status));
    }

    if (filters.type) {
      whereConditions.push(eq(payments.type, filters.type));
    }

    if (filters.classId) {
      whereConditions.push(eq(payments.classId, filters.classId));
    }

    if (filters.minAmount) {
      whereConditions.push(
        sql`${payments.totalAmount} >= ${filters.minAmount}`,
      );
    }

    if (filters.maxAmount) {
      whereConditions.push(
        sql`${payments.totalAmount} <= ${filters.maxAmount}`,
      );
    }

    if (filters.startDate) {
      whereConditions.push(sql`${payments.createdAt} >= ${filters.startDate}`);
    }

    if (filters.endDate) {
      whereConditions.push(sql`${payments.createdAt} <= ${filters.endDate}`);
    }

    const paymentsList = await this.db.query.payments.findMany({
      where: and(...whereConditions),
      with: {
        class: true,
        student: true,
        personal: true,
      },
      orderBy: [desc(payments.createdAt)],
    });

    return paymentsList.map((payment) => this.formatPaymentResponse(payment));
  }

  // Obter carteira do usuário
  async getUserWallet(userId: string): Promise<WalletResponseDto> {
    let wallet = await this.db.query.userWallets.findFirst({
      where: eq(userWallets.userId, userId),
      with: {
        user: true,
      },
    });

    if (!wallet) {
      // Criar carteira se não existir
      const [newWallet] = await this.db
        .insert(userWallets)
        .values({
          userId,
          availableBalance: '0.00',
          pendingBalance: '0.00',
          totalEarned: '0.00',
          totalWithdrawn: '0.00',
        })
        .returning();

      wallet = newWallet;
    }

    return this.formatWalletResponse(wallet);
  }

  // Atualizar carteira
  async updateWallet(
    userId: string,
    updateDto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    console.log('💳 [UPDATE_WALLET] ===== ATUALIZANDO CARTEIRA =====');
    console.log('💳 [UPDATE_WALLET] User ID:', userId);
    console.log('💳 [UPDATE_WALLET] Dados de atualização:', updateDto);

    const [updatedWallet] = await this.db
      .update(userWallets)
      .set({
        ...updateDto,
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, userId))
      .returning();

    console.log(
      '✅ [UPDATE_WALLET] Carteira atualizada no banco:',
      updatedWallet,
    );
    console.log(
      '💳 [UPDATE_WALLET] ===== CARTEIRA ATUALIZADA COM SUCESSO =====',
    );

    return this.formatWalletResponse(updatedWallet);
  }

  // Solicitar saque
  async requestWithdrawal(
    userId: string,
    withdrawDto: WithdrawRequestDto,
  ): Promise<TransactionResponseDto> {
    const wallet = await this.getUserWallet(userId);

    if (wallet.availableBalance < withdrawDto.amount) {
      throw new BadRequestException('Saldo insuficiente para saque');
    }

    // Criar transação de saque
    const transaction = await this.createTransaction({
      paymentId: null, // Saque não está vinculado a um pagamento
      userId,
      type: PaymentType.REFUND, // Usando REFUND para saque
      amount: -withdrawDto.amount,
      description: withdrawDto.description || 'Solicitação de saque',
      status: PaymentStatus.PENDING,
    });

    // Atualizar carteira
    await this.updateWallet(userId, {
      availableBalance: wallet.availableBalance - withdrawDto.amount,
      totalWithdrawn: wallet.totalWithdrawn + withdrawDto.amount,
    });

    return transaction;
  }

  // Obter transações da carteira do personal
  async getPersonalTransactions(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<TransactionResponseDto[]> {
    console.log(
      `📊 [PERSONAL_TRANSACTIONS] Buscando transações para personal ${userId}`,
    );

    const userTransactions = await this.db.query.paymentTransactions.findMany({
      where: eq(paymentTransactions.userId, userId),
      orderBy: [desc(paymentTransactions.createdAt)],
      limit,
      offset,
    });

    console.log(
      `📊 [PERSONAL_TRANSACTIONS] Encontradas ${userTransactions.length} transações`,
    );

    return userTransactions.map((transaction) =>
      this.formatTransactionResponse(transaction),
    );
  }

  // Obter estatísticas financeiras do personal
  async getPersonalFinancialStats(userId: string): Promise<{
    wallet: WalletResponseDto;
    totalEarnings: number;
    totalWithdrawals: number;
    pendingWithdrawals: number;
    recentTransactions: TransactionResponseDto[];
  }> {
    // Buscar carteira
    const wallet = await this.getUserWallet(userId);

    // Buscar transações recentes (últimas 10)
    const recentTransactions = await this.getPersonalTransactions(
      userId,
      10,
      0,
    );

    // Calcular totais
    const totalEarnings = parseFloat(wallet.totalEarned.toString());
    const totalWithdrawals = parseFloat(wallet.totalWithdrawn.toString());
    const pendingWithdrawals = parseFloat(wallet.pendingBalance.toString());

    return {
      wallet,
      totalEarnings,
      totalWithdrawals,
      pendingWithdrawals,
      recentTransactions,
    };
  }

  // Obter estatísticas de pagamentos
  async getPaymentStats(userId?: string): Promise<PaymentStatsDto> {
    const whereConditions = userId
      ? [or(eq(payments.studentId, userId), eq(payments.personalId, userId))]
      : [];

    // Total de pagamentos
    const [totalPayments] = await this.db
      .select({ count: count() })
      .from(payments)
      .where(whereConditions.length ? and(...whereConditions) : undefined);

    // Total de valores
    const [totalAmount] = await this.db
      .select({ sum: sum(payments.totalAmount) })
      .from(payments)
      .where(whereConditions.length ? and(...whereConditions) : undefined);

    // Estatísticas por status
    const statusBreakdown = await this.getStatusBreakdown(whereConditions);

    // Estatísticas por período
    const periodStats = await this.getPeriodStats(whereConditions);

    return {
      totalPayments: totalPayments.count,
      totalAmount: parseFloat(totalAmount.sum || '0'),
      platformEarnings: 0, // Calcular baseado nos pagamentos
      personalEarnings: 0, // Calcular baseado nos pagamentos
      pendingAmount: 0, // Calcular baseado nos pagamentos
      refundedAmount: 0, // Calcular baseado nos pagamentos
      statusBreakdown,
      periodStats,
    };
  }

  // Métodos auxiliares privados
  private async createTransaction(data: any): Promise<TransactionResponseDto> {
    console.log('📝 [CREATE_TRANSACTION] ===== CRIANDO TRANSAÇÃO =====');
    console.log('📝 [CREATE_TRANSACTION] Dados da transação:', {
      paymentId: data.paymentId,
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      description: data.description,
      status: data.status,
    });

    const [transaction] = await this.db
      .insert(paymentTransactions)
      .values({
        ...data,
        processedAt: data.status === PaymentStatus.CAPTURED ? new Date() : null,
      })
      .returning();

    console.log(
      '✅ [CREATE_TRANSACTION] Transação criada no banco:',
      transaction,
    );
    console.log(
      '📝 [CREATE_TRANSACTION] ===== TRANSAÇÃO CRIADA COM SUCESSO =====',
    );

    return this.formatTransactionResponse(transaction);
  }

  private async getStatusBreakdown(whereConditions: any[]): Promise<any> {
    const statuses = Object.values(PaymentStatus);
    const breakdown: any = {};

    for (const status of statuses) {
      const [result] = await this.db
        .select({ count: count() })
        .from(payments)
        .where(and(...whereConditions, eq(payments.status, status)));

      breakdown[status] = result.count;
    }

    return breakdown;
  }

  private async getPeriodStats(whereConditions: any[]): Promise<any> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [todayStats] = await this.db
      .select({ count: count(), sum: sum(payments.totalAmount) })
      .from(payments)
      .where(and(...whereConditions, sql`${payments.createdAt} >= ${today}`));

    const [weekStats] = await this.db
      .select({ count: count(), sum: sum(payments.totalAmount) })
      .from(payments)
      .where(and(...whereConditions, sql`${payments.createdAt} >= ${weekAgo}`));

    const [monthStats] = await this.db
      .select({ count: count(), sum: sum(payments.totalAmount) })
      .from(payments)
      .where(
        and(...whereConditions, sql`${payments.createdAt} >= ${monthAgo}`),
      );

    return {
      today: {
        count: todayStats.count,
        amount: parseFloat(todayStats.sum || '0'),
      },
      thisWeek: {
        count: weekStats.count,
        amount: parseFloat(weekStats.sum || '0'),
      },
      thisMonth: {
        count: monthStats.count,
        amount: parseFloat(monthStats.sum || '0'),
      },
    };
  }

  private formatPaymentResponse(payment: any): PaymentResponseDto {
    return {
      id: payment.id,
      classId: payment.classId,
      studentId: payment.studentId,
      personalId: payment.personalId,
      mpPaymentId: payment.mpPaymentId,
      mpPreferenceId: payment.mpPreferenceId,
      totalAmount: parseFloat(payment.totalAmount),
      platformFee: parseFloat(payment.platformFee),
      personalAmount: parseFloat(payment.personalAmount),
      status: payment.status,
      type: payment.type,
      splitData: payment.splitData,
      class: payment.class
        ? {
            id: payment.class.id,
            date: payment.class.date,
            time: payment.class.time,
            location: payment.class.location,
            duration: payment.class.duration,
          }
        : undefined,
      student: payment.student
        ? {
            id: payment.student.id,
            name:
              payment.student.firstName != null &&
              payment.student.lastName != null
                ? `${payment.student.firstName} ${payment.student.lastName}`.trim()
                : ((payment.student as any).name ?? payment.student.email),
            email: payment.student.email,
          }
        : undefined,
      personal: payment.personal
        ? {
            id: payment.personal.id,
            name:
              payment.personal.firstName != null &&
              payment.personal.lastName != null
                ? `${payment.personal.firstName} ${payment.personal.lastName}`.trim()
                : ((payment.personal as any).name ?? payment.personal.email),
            email: payment.personal.email,
          }
        : undefined,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      authorizedAt: payment.authorizedAt,
      capturedAt: payment.capturedAt,
      refundedAt: payment.refundedAt,
    };
  }

  private formatDisputeResponse(dispute: any): DisputeResponseDto {
    return {
      id: dispute.id,
      paymentId: dispute.paymentId,
      reportedBy: dispute.reportedBy,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      studentEvidence: dispute.studentEvidence,
      personalEvidence: dispute.personalEvidence,
      adminNotes: dispute.adminNotes,
      resolution: dispute.resolution,
      resolvedBy: dispute.resolvedBy,
      resolvedAt: dispute.resolvedAt,
      studentDisputeCount: dispute.studentDisputeCount,
      personalDisputeCount: dispute.personalDisputeCount,
      expiresAt: dispute.expiresAt,
      payment: dispute.payment
        ? this.formatPaymentResponse(dispute.payment)
        : undefined,
      reportedByUser: dispute.reportedByUser
        ? {
            id: dispute.reportedByUser.id,
            name:
              dispute.reportedByUser.firstName != null &&
              dispute.reportedByUser.lastName != null
                ? `${dispute.reportedByUser.firstName} ${dispute.reportedByUser.lastName}`.trim()
                : ((dispute.reportedByUser as any).name ??
                  dispute.reportedByUser.email),
            email: dispute.reportedByUser.email,
            role:
              (dispute.reportedByUser as any).role ??
              dispute.reportedByUser.userType ??
              'user',
          }
        : undefined,
      createdAt: dispute.createdAt,
      updatedAt: dispute.updatedAt,
    };
  }

  private formatWalletResponse(wallet: any): WalletResponseDto {
    return {
      id: wallet.id,
      userId: wallet.userId,
      availableBalance: parseFloat(wallet.availableBalance),
      pendingBalance: parseFloat(wallet.pendingBalance),
      totalEarned: parseFloat(wallet.totalEarned),
      totalWithdrawn: parseFloat(wallet.totalWithdrawn),
      bankAccount: wallet.bankAccount,
      isActive: wallet.isActive,
      lastWithdrawalAt: wallet.lastWithdrawalAt,
      user: wallet.user
        ? {
            id: wallet.user.id,
            name: wallet.user.name,
            email: wallet.user.email,
            role: wallet.user.role,
            userType: wallet.user.userType,
          }
        : undefined,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  private formatTransactionResponse(transaction: any): TransactionResponseDto {
    return {
      id: transaction.id,
      paymentId: transaction.paymentId,
      userId: transaction.userId,
      type: transaction.type,
      amount: parseFloat(transaction.amount),
      description: transaction.description,
      mpTransactionId: transaction.mpTransactionId,
      mpOperationId: transaction.mpOperationId,
      status: transaction.status,
      metadata: transaction.metadata,
      user: transaction.user
        ? {
            id: transaction.user.id,
            name: transaction.user.name,
            email: transaction.user.email,
          }
        : undefined,
      createdAt: transaction.createdAt,
      processedAt: transaction.processedAt,
    };
  }

  // ===== TRANSFERÊNCIA REAL PARA PERSONAL =====

  // Processar transferência real para personal
  async processRealTransfer(
    transferDto: TransferRequestDto,
    adminId: string,
  ): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
  }> {
    try {
      console.log(
        `💸 [TRANSFER] Processando transferência real para personal ${transferDto.personalId}`,
      );

      // Validar dados de transferência
      const validation = await this.mercadoPagoService.validateTransferData({
        personalId: transferDto.personalId,
        amount: transferDto.amount,
        transferMethod: transferDto.transferMethod,
        personalData: transferDto.personalData,
      });

      if (!validation.isValid) {
        throw new BadRequestException(
          `Dados de transferência inválidos: ${validation.errors.join(', ')}`,
        );
      }

      // Buscar dados do personal
      const personal = await this.db.query.users.findFirst({
        where: eq(users.id, transferDto.personalId),
      });

      if (!personal) {
        throw new NotFoundException('Personal trainer não encontrado');
      }

      // Verificar se personal tem perfil financeiro configurado
      const financialProfile = await this.db.query.financialProfiles.findFirst({
        where: eq(users.id, transferDto.personalId),
      });

      if (!financialProfile || !financialProfile.canReceivePayments) {
        throw new BadRequestException(
          'Personal trainer não tem perfil financeiro configurado',
        );
      }

      // Fazer transferência via Mercado Pago
      const transferResult = await this.mercadoPagoService.transferToPersonal({
        personalId: transferDto.personalId,
        amount: transferDto.amount,
        description: transferDto.description,
        transferMethod: transferDto.transferMethod,
        personalData: transferDto.personalData,
      });

      if (!transferResult.success) {
        throw new BadRequestException(
          `Erro na transferência: ${transferResult.error}`,
        );
      }

      // Atualizar carteira do personal (debitar valor transferido)
      const personalWallet = await this.getUserWallet(transferDto.personalId);
      await this.updateWallet(transferDto.personalId, {
        availableBalance: personalWallet.availableBalance - transferDto.amount,
        totalWithdrawn: personalWallet.totalWithdrawn + transferDto.amount,
      });

      // Criar transação de transferência
      await this.createTransaction({
        paymentId: null,
        userId: transferDto.personalId,
        type: PaymentType.REFUND, // Usando REFUND para transferência
        amount: -transferDto.amount,
        description: `Transferência real: ${transferDto.description}`,
        status: PaymentStatus.CAPTURED,
        metadata: {
          transferId: transferResult.transferId,
          transferMethod: transferDto.transferMethod,
          adminId,
        },
      });

      console.log(
        `✅ [TRANSFER] Transferência processada com sucesso: ${transferResult.transferId}`,
      );

      return {
        success: true,
        transferId: transferResult.transferId,
      };
    } catch (error) {
      console.error(`❌ [TRANSFER] Erro ao processar transferência:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Aprovar solicitação de saque (admin)
  async approveWithdrawal(
    approveDto: ApproveWithdrawalDto,
    adminId: string,
  ): Promise<WithdrawalResponseDto> {
    try {
      console.log(`✅ [ADMIN] Aprovando saque ${approveDto.withdrawalId}`);

      // Buscar solicitação de saque
      const withdrawal = await this.db.query.withdrawalRequests.findFirst({
        where: eq(withdrawalRequests.id, approveDto.withdrawalId),
        with: {
          user: true,
        },
      });

      if (!withdrawal) {
        throw new NotFoundException('Solicitação de saque não encontrada');
      }

      if (withdrawal.status !== 'pending') {
        throw new BadRequestException('Solicitação já foi processada');
      }

      // Buscar perfil financeiro do personal
      const financialProfile = await this.db.query.financialProfiles.findFirst({
        where: eq(users.id, withdrawal.userId),
      });

      if (!financialProfile) {
        throw new BadRequestException('Perfil financeiro não encontrado');
      }

      // Preparar dados para transferência
      const transferMethod = approveDto.transferMethod || withdrawal.method;
      const personalData = this.preparePersonalDataForTransfer(
        financialProfile,
        transferMethod,
      );

      // Processar transferência real
      const transferResult = await this.processRealTransfer(
        {
          personalId: withdrawal.userId,
          amount: parseFloat(withdrawal.amount),
          description: withdrawal.description || 'Saque aprovado',
          transferMethod,
          personalData,
        },
        adminId,
      );

      if (!transferResult.success) {
        throw new BadRequestException(
          `Erro na transferência: ${transferResult.error}`,
        );
      }

      // Atualizar status da solicitação
      const [updatedWithdrawal] = await this.db
        .update(withdrawalRequests)
        .set({
          status: 'approved',
          adminNotes: approveDto.adminNotes,
          mpTransferId: transferResult.transferId,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(withdrawalRequests.id, approveDto.withdrawalId))
        .returning();

      // Criar histórico
      await this.createWithdrawalHistory({
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        action: 'approved',
        description: 'Saque aprovado e transferência processada',
        adminId,
        metadata: {
          transferId: transferResult.transferId,
          transferMethod,
        },
      });

      console.log(
        `✅ [ADMIN] Saque aprovado e transferência processada: ${transferResult.transferId}`,
      );

      return this.formatWithdrawalResponse(updatedWithdrawal);
    } catch (error) {
      console.error(`❌ [ADMIN] Erro ao aprovar saque:`, error);
      throw error;
    }
  }

  // Rejeitar solicitação de saque (admin)
  async rejectWithdrawal(
    rejectDto: RejectWithdrawalDto,
    adminId: string,
  ): Promise<WithdrawalResponseDto> {
    try {
      console.log(`❌ [ADMIN] Rejeitando saque ${rejectDto.withdrawalId}`);

      // Buscar solicitação de saque
      const withdrawal = await this.db.query.withdrawalRequests.findFirst({
        where: eq(withdrawalRequests.id, rejectDto.withdrawalId),
      });

      if (!withdrawal) {
        throw new NotFoundException('Solicitação de saque não encontrada');
      }

      if (withdrawal.status !== 'pending') {
        throw new BadRequestException('Solicitação já foi processada');
      }

      // Atualizar status da solicitação
      const [updatedWithdrawal] = await this.db
        .update(withdrawalRequests)
        .set({
          status: 'rejected',
          rejectionReason: rejectDto.reason,
          adminNotes: rejectDto.adminNotes,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(withdrawalRequests.id, rejectDto.withdrawalId))
        .returning();

      // Devolver saldo para a carteira
      const personalWallet = await this.getUserWallet(withdrawal.userId);
      await this.updateWallet(withdrawal.userId, {
        availableBalance:
          personalWallet.availableBalance + parseFloat(withdrawal.amount),
        pendingBalance:
          personalWallet.pendingBalance - parseFloat(withdrawal.amount),
      });

      // Criar histórico
      await this.createWithdrawalHistory({
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        action: 'rejected',
        description: `Saque rejeitado: ${rejectDto.reason}`,
        adminId,
        metadata: {
          reason: rejectDto.reason,
          adminNotes: rejectDto.adminNotes,
        },
      });

      console.log(`❌ [ADMIN] Saque rejeitado: ${rejectDto.reason}`);

      return this.formatWithdrawalResponse(updatedWithdrawal);
    } catch (error) {
      console.error(`❌ [ADMIN] Erro ao rejeitar saque:`, error);
      throw error;
    }
  }

  // Listar solicitações de saque pendentes (admin) – atalho para getWithdrawals({ status: 'pending' })
  async getPendingWithdrawals(): Promise<WithdrawalResponseDto[]> {
    const result = await this.getWithdrawals({
      status: 'pending',
      page: 1,
      limit: 500,
    });
    return result.items;
  }

  // Listar saques com filtro por status e paginação (admin)
  async getWithdrawals(filters?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: WithdrawalResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
    const offset = (page - 1) * limit;

    let statusWhere:
      | ReturnType<typeof eq>
      | ReturnType<typeof inArray>
      | undefined;
    if (filters?.status) {
      const statuses = filters.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        statusWhere = eq(withdrawalRequests.status, statuses[0]);
      } else if (statuses.length > 1) {
        statusWhere = inArray(withdrawalRequests.status, statuses);
      }
    }

    const withdrawals = await this.db.query.withdrawalRequests.findMany({
      where: statusWhere,
      with: { user: true },
      orderBy: [desc(withdrawalRequests.createdAt)],
      limit,
      offset,
    });

    const totalResult = await this.db
      .select({ count: count() })
      .from(withdrawalRequests)
      .where(statusWhere ?? undefined);
    const total = Number(totalResult[0]?.count ?? 0);

    const items = withdrawals.map((w) => this.formatWithdrawalResponse(w));
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // Obter histórico de saques de um usuário
  async getUserWithdrawalHistory(
    userId: string,
  ): Promise<WithdrawalResponseDto[]> {
    const withdrawals = await this.db.query.withdrawalRequests.findMany({
      where: eq(withdrawalRequests.userId, userId),
      with: {
        user: true,
      },
      orderBy: [desc(withdrawalRequests.createdAt)],
    });

    return withdrawals.map((withdrawal) =>
      this.formatWithdrawalResponse(withdrawal),
    );
  }

  // Métodos auxiliares privados
  private preparePersonalDataForTransfer(
    financialProfile: any,
    transferMethod: string,
  ): any {
    switch (transferMethod) {
      case 'pix':
        return {
          pixKey: financialProfile.pixKey,
        };
      case 'bank_transfer':
        return {
          bankAccount: financialProfile.bankAccount,
        };
      case 'mercadopago_balance':
        return {
          mpAccountId: financialProfile.mercadoPagoAccount?.accountId,
        };
      default:
        throw new Error('Método de transferência inválido');
    }
  }

  private async createWithdrawalHistory(data: {
    withdrawalId: string;
    userId: string;
    action: string;
    description: string;
    adminId?: string;
    metadata?: any;
  }): Promise<void> {
    await this.db.insert(withdrawalHistory).values({
      ...data,
      createdAt: new Date(),
    });
  }

  private formatWithdrawalResponse(withdrawal: any): WithdrawalResponseDto {
    const userName =
      withdrawal.user?.firstName != null && withdrawal.user?.lastName != null
        ? `${withdrawal.user.firstName} ${withdrawal.user.lastName}`.trim()
        : withdrawal.user?.firstName ||
          withdrawal.user?.lastName ||
          withdrawal.user?.email ||
          undefined;
    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: parseFloat(withdrawal.amount),
      fee: parseFloat(withdrawal.fee),
      netAmount: parseFloat(withdrawal.netAmount),
      method: withdrawal.method,
      status: withdrawal.status,
      description: withdrawal.description,
      rejectionReason: withdrawal.rejectionReason,
      adminNotes: withdrawal.adminNotes,
      mpTransferId: withdrawal.mpTransferId,
      createdAt: withdrawal.createdAt,
      processedAt: withdrawal.processedAt,
      user: withdrawal.user
        ? {
            id: withdrawal.user.id,
            name: userName ?? '',
            email: withdrawal.user.email ?? '',
            role: withdrawal.user.role ?? '',
            userType: withdrawal.user.userType,
          }
        : undefined,
    };
  }
}
