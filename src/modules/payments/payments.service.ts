import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, and, or, desc, count, sum, sql, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
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
  financialProfiles,
} from '../../database/schema/payments';
import { NotificationsService } from '../notifications/notifications.service';
import {
  WITHDRAWAL_PAYOUT_PROVIDER,
  WithdrawalPayoutPersonalData,
  WithdrawalPayoutProvider,
  WithdrawalPayoutResult,
  WithdrawalTransferMethod,
} from './withdrawal-payout.provider';
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
  TransferRequestDto,
  ApproveWithdrawalDto,
  RejectWithdrawalDto,
  WithdrawalResponseDto,
} from './dto/payments.dto';
import { StripeRefundsService } from './stripe-refunds.service';
import { StripeTransfersService } from './stripe-transfers.service';

type PaymentReleaseResult = {
  released: boolean;
  alreadyReleased: boolean;
  payment: any;
};

type PersonalSettlementReversalResult = {
  status:
    | 'not_released'
    | 'wallet_reversed'
    | 'partial_wallet_reversal_recovery_required'
    | 'recovery_required'
    | 'stripe_transfer_reversed'
    | 'stripe_transfer_reversal_failed';
  personalAmount: string;
  walletReversedAmount: string;
  recoveryRequiredAmount: string;
  stripeTransferId?: string;
  stripeTransferReversalId?: string;
  error?: string;
};

@Injectable()
export class PaymentsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    private readonly notificationsService: NotificationsService,
    @Inject(WITHDRAWAL_PAYOUT_PROVIDER)
    private readonly withdrawalPayoutProvider: WithdrawalPayoutProvider,
    private readonly stripeRefundsService: StripeRefundsService,
    private readonly stripeTransfersService: StripeTransfersService,
  ) {}

  // Atualizar status do pagamento
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
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
      await this.capturePayment(paymentId, 'Status atualizado para capturado');

      const capturedUpdateData: any = {
        updatedAt: new Date(),
      };
      await this.db
        .update(payments)
        .set(capturedUpdateData)
        .where(eq(payments.id, paymentId));
    }

    if (status !== PaymentStatus.CAPTURED) {
      await this.db
        .update(payments)
        .set(updateData)
        .where(eq(payments.id, paymentId));
    }
  }

  // Capturar pagamento e aplicar split
  async capturePayment(
    paymentId: string,
    reason: string = 'Pagamento capturado',
  ): Promise<void> {
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

    if (payment.status === PaymentStatus.CAPTURED) {
      console.log(
        `ℹ️ [CAPTURE_PAYMENT] Pagamento ${paymentId} já capturado; liberação idempotente ignorada`,
      );
      return;
    }

    await this.releasePaymentToInternalWallet(payment, {
      classId: payment.classId,
      reason,
      allowPending: true,
    });
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

  private async releasePaymentToInternalWallet(
    payment: any,
    options: {
      classId?: string | null;
      reason: string;
      allowPending: boolean;
    },
  ): Promise<PaymentReleaseResult> {
    if (!payment.personalId) {
      throw new BadRequestException(
        'Pagamento não possui personal vinculado para liberação',
      );
    }

    const isStripe = payment.provider === 'stripe';
    const currentStatus = String(payment.status || '').toLowerCase();

    if (currentStatus === PaymentStatus.CAPTURED) {
      return {
        released: false,
        alreadyReleased: true,
        payment,
      };
    }

    if (isStripe && currentStatus !== PaymentStatus.AUTHORIZED) {
      throw new BadRequestException(
        `Pagamento Stripe ainda não confirmado. Status atual: ${payment.status}`,
      );
    }

    const allowedStatuses = isStripe
      ? [PaymentStatus.AUTHORIZED]
      : options.allowPending
        ? [PaymentStatus.AUTHORIZED, PaymentStatus.PENDING]
        : [PaymentStatus.AUTHORIZED];

    if (!allowedStatuses.includes(payment.status)) {
      throw new BadRequestException(
        `Pagamento não está em estado capturável. Status atual: ${payment.status}`,
      );
    }

    const now = new Date();
    const classId = options.classId ?? payment.classId ?? null;
    const totalAmount = this.toMoneyNumber(payment.totalAmount);
    const platformFee = this.toMoneyNumber(payment.platformFee);
    const personalAmount = this.toMoneyNumber(payment.personalAmount);
    const releaseMetadata = this.buildInternalWalletReleaseMetadata(payment, {
      classId,
      reason: options.reason,
      releasedAt: now,
      totalAmount,
      platformFee,
      personalAmount,
    });
    const splitData = this.buildInternalWalletSplitData(
      payment,
      releaseMetadata,
    );

    return this.db.transaction(async (tx: any) => {
      const [capturedPayment] = await tx
        .update(payments)
        .set({
          status: PaymentStatus.CAPTURED,
          splitData,
          capturedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(payments.id, payment.id),
            inArray(payments.status, allowedStatuses),
          ),
        )
        .returning();

      if (!capturedPayment) {
        const [latestPayment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, payment.id))
          .limit(1);

        if (!latestPayment) {
          throw new NotFoundException('Pagamento não encontrado');
        }

        if (latestPayment.status === PaymentStatus.CAPTURED) {
          return {
            released: false,
            alreadyReleased: true,
            payment: latestPayment,
          };
        }

        throw new BadRequestException(
          `Pagamento não está em estado capturável. Status atual: ${latestPayment.status}`,
        );
      }

      await this.ensureWalletExists(tx, capturedPayment.personalId, now);

      const personalAmountString = this.toMoneyString(personalAmount);
      await tx
        .update(userWallets)
        .set({
          availableBalance: sql`${userWallets.availableBalance} + ${personalAmountString}::numeric`,
          totalEarned: sql`${userWallets.totalEarned} + ${personalAmountString}::numeric`,
          updatedAt: now,
        })
        .where(eq(userWallets.userId, capturedPayment.personalId));

      const totalAmountString = this.toMoneyString(totalAmount);
      await tx.insert(paymentTransactions).values([
        {
          paymentId: capturedPayment.id,
          userId: capturedPayment.personalId,
          type: PaymentType.PERSONAL_EARNINGS,
          amount: personalAmountString,
          description: classId
            ? `Ganhos da aula ${classId}`
            : `Ganhos do pagamento ${capturedPayment.id}`,
          status: PaymentStatus.CAPTURED,
          metadata: {
            ...releaseMetadata,
            ledgerEntry: 'personal_internal_wallet_credit',
          },
          processedAt: now,
        },
        {
          paymentId: capturedPayment.id,
          userId: capturedPayment.studentId,
          type: PaymentType.CLASS_PAYMENT,
          amount: this.toMoneyString(-totalAmount),
          description: classId
            ? `Pagamento da aula ${classId}`
            : `Pagamento ${capturedPayment.id}`,
          status: PaymentStatus.CAPTURED,
          metadata: {
            ...releaseMetadata,
            ledgerEntry: 'student_payment_debit',
            grossAmount: totalAmountString,
          },
          processedAt: now,
        },
      ]);

      return {
        released: true,
        alreadyReleased: false,
        payment: capturedPayment,
      };
    });
  }

  private async ensureWalletExists(
    tx: any,
    userId: string,
    now: Date,
  ): Promise<void> {
    const insertWallet = tx.insert(userWallets).values({
      userId,
      availableBalance: '0.00',
      pendingBalance: '0.00',
      totalEarned: '0.00',
      totalWithdrawn: '0.00',
      updatedAt: now,
    });

    if (typeof insertWallet.onConflictDoNothing === 'function') {
      await insertWallet.onConflictDoNothing({ target: userWallets.userId });
      return;
    }

    await insertWallet;
  }

  private buildInternalWalletSplitData(
    payment: any,
    releaseMetadata: Record<string, any>,
  ): Record<string, any> {
    const currentSplitData =
      payment.splitData && typeof payment.splitData === 'object'
        ? payment.splitData
        : {};

    return this.compactObject({
      ...currentSplitData,
      stripe: this.compactObject({
        paymentIntentId: payment.stripePaymentIntentId,
        chargeId: payment.stripeChargeId,
        latestChargeId: payment.stripeLatestChargeId,
        transferGroup: payment.stripeTransferGroup,
        processingModel: payment.processingModel,
      }),
      internalWalletRelease: releaseMetadata,
    });
  }

  private buildInternalWalletReleaseMetadata(
    payment: any,
    input: {
      classId?: string | null;
      reason: string;
      releasedAt: Date;
      totalAmount: number;
      platformFee: number;
      personalAmount: number;
    },
  ): Record<string, any> {
    const provider = payment.provider || 'stripe';
    const classScope = input.classId || payment.classId || 'proposal';

    return this.compactObject({
      provider,
      processingModel:
        payment.processingModel ||
        (provider === 'stripe' ? 'separate_charges_and_transfers' : undefined),
      releaseType: 'internal_wallet_release',
      releaseReason: input.reason,
      releaseIdempotencyKey: `${provider}_wallet_release:${payment.id}:${classScope}:${payment.personalId}`,
      paymentId: payment.id,
      classId: input.classId,
      proposalId: payment.proposalId,
      studentId: payment.studentId,
      personalId: payment.personalId,
      totalAmount: this.toMoneyString(input.totalAmount),
      platformFee: this.toMoneyString(input.platformFee),
      personalAmount: this.toMoneyString(input.personalAmount),
      releasedAt: input.releasedAt.toISOString(),
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeChargeId: payment.stripeChargeId,
      stripeLatestChargeId: payment.stripeLatestChargeId,
      stripeTransferGroup: payment.stripeTransferGroup,
    });
  }

  private compactObject<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, entryValue]) => {
        return (
          entryValue !== undefined && entryValue !== null && entryValue !== ''
        );
      }),
    ) as T;
  }

  private toMoneyNumber(value: string | number): number {
    return Number(Number(value || 0).toFixed(2));
  }

  private toMoneyString(value: string | number): string {
    return this.toMoneyNumber(value).toFixed(2);
  }

  private toStripeMetadata(value: Record<string, any>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.compactObject(value)).map(([key, entryValue]) => [
        key,
        String(entryValue).slice(0, 500),
      ]),
    );
  }

  private isStripePayment(payment: any): boolean {
    return (
      payment?.provider === 'stripe' ||
      Boolean(
        payment?.stripePaymentIntentId ||
          payment?.stripeChargeId ||
          payment?.stripeLatestChargeId,
      )
    );
  }

  private getStripeObjectId(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'id' in value) {
      return String((value as { id?: string }).id || '') || undefined;
    }
    return undefined;
  }

  private getStripeRefundIdFromCharge(charge: Stripe.Charge): string | undefined {
    return charge.refunds?.data?.[0]?.id;
  }

  private getStripeChargePaymentIntentId(
    charge: Stripe.Charge,
  ): string | undefined {
    return this.getStripeObjectId(charge.payment_intent);
  }

  private getStripeDisputeChargeId(
    dispute: Stripe.Dispute,
  ): string | undefined {
    return this.getStripeObjectId(dispute.charge);
  }

  private getStripeDisputePaymentIntentId(
    dispute: Stripe.Dispute,
  ): string | undefined {
    return this.getStripeObjectId((dispute as any).payment_intent);
  }

  private getStripeDisputeDeadline(dispute: Stripe.Dispute): Date {
    const dueBy = dispute.evidence_details?.due_by;
    if (dueBy) {
      return new Date(dueBy * 1000);
    }

    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 7);
    return fallback;
  }

  private getPaymentSpecificStripeTransferId(payment: any): string | undefined {
    const splitData =
      payment?.splitData && typeof payment.splitData === 'object'
        ? payment.splitData
        : {};

    return (
      splitData.stripe?.transferId ||
      splitData.stripeTransferId ||
      splitData.internalWalletRelease?.stripeTransferId ||
      splitData.externalPayout?.stripeTransferId
    );
  }

  private buildMergedSplitData(
    payment: any,
    key: string,
    value: Record<string, any>,
  ): Record<string, any> {
    const currentSplitData =
      payment?.splitData && typeof payment.splitData === 'object'
        ? payment.splitData
        : {};
    const previousValue =
      currentSplitData[key] && typeof currentSplitData[key] === 'object'
        ? currentSplitData[key]
        : {};

    return {
      ...currentSplitData,
      [key]: this.compactObject({
        ...previousValue,
        ...value,
      }),
    };
  }

  private async findPaymentByStripeIdentifiers(input: {
    chargeId?: string;
    paymentIntentId?: string;
  }): Promise<any | null> {
    const conditions = [];

    if (input.chargeId) {
      conditions.push(
        or(
          eq(payments.stripeChargeId, input.chargeId),
          eq(payments.stripeLatestChargeId, input.chargeId),
        ),
      );
    }

    if (input.paymentIntentId) {
      conditions.push(eq(payments.stripePaymentIntentId, input.paymentIntentId));
    }

    if (!conditions.length) {
      return null;
    }

    return this.db.query.payments.findFirst({
      where: conditions.length === 1 ? conditions[0] : or(...conditions),
      with: {
        class: true,
        student: true,
        personal: true,
      },
    });
  }

  private async findActivePaymentDispute(paymentId: string): Promise<any | null> {
    return this.db.query.paymentDisputes.findFirst({
      where: and(
        eq(paymentDisputes.paymentId, paymentId),
        or(
          eq(paymentDisputes.status, DisputeStatus.PENDING),
          eq(paymentDisputes.status, DisputeStatus.UNDER_REVIEW),
        ),
      ),
    });
  }

  private buildStripeDisputeMetadata(
    dispute: Stripe.Dispute,
    input: Record<string, any> = {},
  ): Record<string, any> {
    return this.compactObject({
      provider: 'stripe',
      stripeDisputeId: dispute.id,
      stripeChargeId: this.getStripeDisputeChargeId(dispute),
      stripePaymentIntentId: this.getStripeDisputePaymentIntentId(dispute),
      amount: this.toMoneyString((dispute.amount || 0) / 100),
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      evidenceDueBy: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : undefined,
      ...input,
    });
  }

  private buildStripeDisputeAdminNotes(metadata: Record<string, any>): string {
    return JSON.stringify(metadata, null, 2);
  }

  private mapStripeDisputeResolution(status: Stripe.Dispute.Status): DisputeStatus {
    if (status === 'lost') {
      return DisputeStatus.RESOLVED_PRO_STUDENT;
    }

    return DisputeStatus.RESOLVED_PRO_PERSONAL;
  }

  private normalizeDisputeResolution(resolution: string): DisputeStatus {
    if (resolution === 'RESOLVED_PRO_STUDENT') {
      return DisputeStatus.RESOLVED_PRO_STUDENT;
    }

    if (resolution === 'RESOLVED_PRO_PERSONAL') {
      return DisputeStatus.RESOLVED_PRO_PERSONAL;
    }

    return resolution as DisputeStatus;
  }

  private async reversePersonalSettlement(
    payment: any,
    input: {
      reason: string;
      source: string;
      status: PaymentStatus;
      stripeRefundId?: string;
      stripeDisputeId?: string;
      now?: Date;
    },
  ): Promise<PersonalSettlementReversalResult> {
    const personalAmount = this.toMoneyNumber(payment.personalAmount);
    const emptyResult: PersonalSettlementReversalResult = {
      status: 'not_released',
      personalAmount: this.toMoneyString(personalAmount),
      walletReversedAmount: '0.00',
      recoveryRequiredAmount: '0.00',
    };

    if (
      payment.status !== PaymentStatus.CAPTURED ||
      !payment.personalId ||
      personalAmount <= 0
    ) {
      return emptyResult;
    }

    const now = input.now || new Date();
    const stripeTransferId = this.getPaymentSpecificStripeTransferId(payment);

    if (stripeTransferId) {
      try {
        const reversal = await this.stripeTransfersService.createTransferReversal({
          transferId: stripeTransferId,
          amount: personalAmount,
          description: input.reason,
          metadata: this.toStripeMetadata({
            paymentId: payment.id,
            classId: payment.classId,
            proposalId: payment.proposalId,
            personalId: payment.personalId,
            source: input.source,
            stripeRefundId: input.stripeRefundId,
            stripeDisputeId: input.stripeDisputeId,
          }),
          idempotencyKey: `stripe_transfer_reversal:${payment.id}:${stripeTransferId}`,
        });

        const result: PersonalSettlementReversalResult = {
          status: 'stripe_transfer_reversed',
          personalAmount: this.toMoneyString(personalAmount),
          walletReversedAmount: '0.00',
          recoveryRequiredAmount: '0.00',
          stripeTransferId,
          stripeTransferReversalId: reversal.id,
        };

        await this.createTransaction({
          paymentId: payment.id,
          userId: payment.personalId,
          type: PaymentType.PERSONAL_EARNINGS,
          amount: this.toMoneyString(-personalAmount),
          description: `Reversal Stripe do repasse do pagamento ${payment.id}`,
          status: input.status,
          stripeTransferId,
          stripeRefundId: input.stripeRefundId,
          stripeDisputeId: input.stripeDisputeId,
          metadata: {
            ...result,
            transferReversalId: reversal.id,
            source: input.source,
            reason: input.reason,
            processedAt: now.toISOString(),
          },
        });

        return result;
      } catch (error) {
        const result: PersonalSettlementReversalResult = {
          status: 'stripe_transfer_reversal_failed',
          personalAmount: this.toMoneyString(personalAmount),
          walletReversedAmount: '0.00',
          recoveryRequiredAmount: this.toMoneyString(personalAmount),
          stripeTransferId,
          error: error instanceof Error ? error.message : String(error),
        };

        await this.createTransaction({
          paymentId: payment.id,
          userId: payment.personalId,
          type: PaymentType.PERSONAL_EARNINGS,
          amount: '0.00',
          description: `Recuperação pendente do repasse do pagamento ${payment.id}`,
          status: input.status,
          stripeTransferId,
          stripeRefundId: input.stripeRefundId,
          stripeDisputeId: input.stripeDisputeId,
          metadata: {
            ...result,
            source: input.source,
            reason: input.reason,
            processedAt: now.toISOString(),
          },
        });

        return result;
      }
    }

    const personalWallet = await this.getUserWallet(payment.personalId);
    const availableBalance = this.toMoneyNumber(personalWallet.availableBalance);
    const totalEarned = this.toMoneyNumber(personalWallet.totalEarned);
    const walletReversedAmount = Math.min(availableBalance, personalAmount);
    const recoveryRequiredAmount = this.toMoneyNumber(
      personalAmount - walletReversedAmount,
    );
    const nextAvailableBalance = this.toMoneyNumber(
      availableBalance - walletReversedAmount,
    );
    const nextTotalEarned = Math.max(
      0,
      this.toMoneyNumber(totalEarned - personalAmount),
    );

    await this.updateWallet(payment.personalId, {
      availableBalance: nextAvailableBalance,
      totalEarned: nextTotalEarned,
    });

    const result: PersonalSettlementReversalResult = {
      status:
        recoveryRequiredAmount > 0
          ? walletReversedAmount > 0
            ? 'partial_wallet_reversal_recovery_required'
            : 'recovery_required'
          : 'wallet_reversed',
      personalAmount: this.toMoneyString(personalAmount),
      walletReversedAmount: this.toMoneyString(walletReversedAmount),
      recoveryRequiredAmount: this.toMoneyString(recoveryRequiredAmount),
    };

    await this.createTransaction({
      paymentId: payment.id,
      userId: payment.personalId,
      type: PaymentType.PERSONAL_EARNINGS,
      amount: this.toMoneyString(-walletReversedAmount),
      description:
        recoveryRequiredAmount > 0
          ? `Reversal parcial da carteira; recuperação pendente do pagamento ${payment.id}`
          : `Reversal da carteira do pagamento ${payment.id}`,
      status: input.status,
      stripeRefundId: input.stripeRefundId,
      stripeDisputeId: input.stripeDisputeId,
      metadata: {
        ...result,
        source: input.source,
        reason: input.reason,
        previousAvailableBalance: this.toMoneyString(availableBalance),
        previousTotalEarned: this.toMoneyString(totalEarned),
        processedAt: now.toISOString(),
      },
    });

    return result;
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

    const resolution = this.normalizeDisputeResolution(resolveDto.resolution);

    const [updatedDispute] = await this.db
      .update(paymentDisputes)
      .set({
        status: resolution,
        resolution,
        adminNotes: resolveDto.adminNotes,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentDisputes.id, disputeId))
      .returning();

    // Aplicar resolução
    if (resolution === DisputeStatus.RESOLVED_PRO_PERSONAL) {
      // Capturar pagamento (personal ganha)
      await this.capturePayment(dispute.paymentId);
    } else if (resolution === DisputeStatus.RESOLVED_PRO_STUDENT) {
      // Reembolsar aluno
      await this.refundPayment(dispute.paymentId);
    }

    return this.formatDisputeResponse(updatedDispute);
  }

  private async refundStripePayment(payment: any, reason?: string): Promise<void> {
    if (!this.stripeRefundsService.isConfigured()) {
      throw new BadRequestException('Stripe não está configurado corretamente');
    }

    const totalAmount = this.toMoneyNumber(payment.totalAmount);
    const refund = await this.stripeRefundsService.createRefund({
      paymentIntentId: payment.stripePaymentIntentId,
      chargeId: payment.stripeChargeId || payment.stripeLatestChargeId,
      amount: totalAmount,
      reason: 'requested_by_customer',
      reverseTransfer: false,
      refundApplicationFee: false,
      metadata: this.toStripeMetadata({
        paymentId: payment.id,
        classId: payment.classId,
        proposalId: payment.proposalId,
        studentId: payment.studentId,
        personalId: payment.personalId,
        provider: 'stripe',
        reason: reason || 'refund_requested',
      }),
      idempotencyKey: `stripe_refund:${payment.id}`,
    });

    await this.applyStripeRefundToLocalPayment(payment, {
      refundId: refund.id,
      refundStatus: refund.status,
      amount: refund.amount ? refund.amount / 100 : totalAmount,
      reason,
      source: 'api',
    });
  }

  private async applyStripeRefundToLocalPayment(
    payment: any,
    input: {
      refundId?: string;
      refundStatus?: string | null;
      amount?: number;
      reason?: string;
      source: 'api' | 'webhook';
    },
  ): Promise<void> {
    const now = new Date();
    const refundId = input.refundId || payment.stripeRefundId;
    const totalAmount = this.toMoneyNumber(input.amount ?? payment.totalAmount);
    const reversal = await this.reversePersonalSettlement(payment, {
      reason: input.reason || `Reembolso da aula ${payment.classId}`,
      source: `stripe_refund_${input.source}`,
      status: PaymentStatus.REFUNDED,
      stripeRefundId: refundId,
      now,
    });

    await this.db
      .update(payments)
      .set({
        status: PaymentStatus.REFUNDED,
        stripeRefundId: refundId,
        splitData: this.buildMergedSplitData(payment, 'stripeRefund', {
          refundId,
          refundStatus: input.refundStatus,
          amount: this.toMoneyString(totalAmount),
          reason: input.reason,
          source: input.source,
          processedAt: now.toISOString(),
          personalReversalStatus: reversal.status,
          walletReversedAmount: reversal.walletReversedAmount,
          recoveryRequiredAmount: reversal.recoveryRequiredAmount,
          stripeTransferId: reversal.stripeTransferId,
          stripeTransferReversalId: reversal.stripeTransferReversalId,
        }),
        refundedAt: now,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));

    await this.createTransaction({
      paymentId: payment.id,
      userId: payment.studentId,
      type: PaymentType.REFUND,
      amount: totalAmount,
      description: input.reason || `Reembolso da aula ${payment.classId}`,
      status: PaymentStatus.REFUNDED,
      stripeRefundId: refundId,
      metadata: {
        provider: 'stripe',
        refundId,
        refundStatus: input.refundStatus,
        source: input.source,
        personalReversal: reversal,
      },
    });

    console.log(
      `✅ Reembolso Stripe registrado para pagamento ${payment.id}: R$ ${this.toMoneyString(totalAmount)}`,
    );
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

    if (this.isStripePayment(payment)) {
      await this.refundStripePayment(payment, reason);
      return;
    }

    throw new BadRequestException(
      'Pagamento legado sem Stripe nao pode ser reembolsado automaticamente apos o cutover',
    );
  }

  async handleStripeChargeRefundedEvent(charge: Stripe.Charge): Promise<void> {
    const chargeId = charge.id;
    const paymentIntentId = this.getStripeChargePaymentIntentId(charge);
    const refundId = this.getStripeRefundIdFromCharge(charge);
    const payment = await this.findPaymentByStripeIdentifiers({
      chargeId,
      paymentIntentId,
    });

    if (!payment) {
      console.warn(
        `⚠️ [STRIPE_REFUND] Pagamento local não encontrado para charge ${chargeId}`,
      );
      return;
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      if (refundId && !payment.stripeRefundId) {
        await this.db
          .update(payments)
          .set({
            stripeRefundId: refundId,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));
      }
      return;
    }

    await this.applyStripeRefundToLocalPayment(payment, {
      refundId,
      refundStatus: charge.refunds?.data?.[0]?.status,
      amount: charge.amount_refunded ? charge.amount_refunded / 100 : undefined,
      reason: 'Refund recebido via webhook Stripe',
      source: 'webhook',
    });
  }

  async handleStripeDisputeCreatedEvent(
    dispute: Stripe.Dispute,
  ): Promise<void> {
    const payment = await this.findPaymentByStripeIdentifiers({
      chargeId: this.getStripeDisputeChargeId(dispute),
      paymentIntentId: this.getStripeDisputePaymentIntentId(dispute),
    });

    if (!payment) {
      console.warn(
        `⚠️ [STRIPE_DISPUTE] Pagamento local não encontrado para dispute ${dispute.id}`,
      );
      return;
    }

    const now = new Date();
    const stripeDisputeMetadata = this.buildStripeDisputeMetadata(dispute, {
      event: 'created',
    });
    const adminNotes = this.buildStripeDisputeAdminNotes(stripeDisputeMetadata);
    const existingDispute = await this.findActivePaymentDispute(payment.id);

    if (existingDispute) {
      await this.db
        .update(paymentDisputes)
        .set({
          status: DisputeStatus.UNDER_REVIEW,
          reason: `stripe_${dispute.reason || 'dispute'}`,
          description:
            existingDispute.description ||
            `Disputa Stripe ${dispute.id} aberta para a charge ${this.getStripeDisputeChargeId(dispute) || 'desconhecida'}`,
          adminNotes,
          expiresAt: this.getStripeDisputeDeadline(dispute),
          updatedAt: now,
        })
        .where(eq(paymentDisputes.id, existingDispute.id));
    } else {
      await this.db.insert(paymentDisputes).values({
        paymentId: payment.id,
        reportedBy: payment.studentId,
        reason: `stripe_${dispute.reason || 'dispute'}`,
        description: `Disputa Stripe ${dispute.id} aberta para a charge ${this.getStripeDisputeChargeId(dispute) || 'desconhecida'}`,
        status: DisputeStatus.UNDER_REVIEW,
        adminNotes,
        expiresAt: this.getStripeDisputeDeadline(dispute),
      });
    }

    await this.db
      .update(payments)
      .set({
        status: PaymentStatus.DISPUTED,
        splitData: this.buildMergedSplitData(payment, 'stripeDispute', {
          ...stripeDisputeMetadata,
          mappedAt: now.toISOString(),
        }),
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));

    await this.createTransaction({
      paymentId: payment.id,
      userId: payment.studentId,
      type: PaymentType.REFUND,
      amount: '0.00',
      description: `Disputa Stripe aberta: ${dispute.reason || dispute.id}`,
      status: PaymentStatus.DISPUTED,
      stripeDisputeId: dispute.id,
      metadata: stripeDisputeMetadata,
    });
  }

  async handleStripeDisputeClosedEvent(
    dispute: Stripe.Dispute,
  ): Promise<void> {
    const payment = await this.findPaymentByStripeIdentifiers({
      chargeId: this.getStripeDisputeChargeId(dispute),
      paymentIntentId: this.getStripeDisputePaymentIntentId(dispute),
    });

    if (!payment) {
      console.warn(
        `⚠️ [STRIPE_DISPUTE] Pagamento local não encontrado para dispute fechado ${dispute.id}`,
      );
      return;
    }

    const now = new Date();
    const resolution = this.mapStripeDisputeResolution(dispute.status);
    const stripeDisputeMetadata = this.buildStripeDisputeMetadata(dispute, {
      event: 'closed',
      resolution,
    });
    const adminNotes = this.buildStripeDisputeAdminNotes(stripeDisputeMetadata);
    const existingDispute = await this.findActivePaymentDispute(payment.id);
    const reversal =
      resolution === DisputeStatus.RESOLVED_PRO_STUDENT
        ? await this.reversePersonalSettlement(payment, {
            reason: `Disputa Stripe perdida: ${dispute.id}`,
            source: 'stripe_dispute_closed',
            status: PaymentStatus.DISPUTE_RESOLVED,
            stripeDisputeId: dispute.id,
            now,
          })
        : undefined;

    const disputeUpdateData = {
      status: resolution,
      resolution,
      adminNotes,
      resolvedAt: now,
      updatedAt: now,
    };

    if (existingDispute) {
      await this.db
        .update(paymentDisputes)
        .set(disputeUpdateData)
        .where(eq(paymentDisputes.id, existingDispute.id));
    } else {
      await this.db.insert(paymentDisputes).values({
        paymentId: payment.id,
        reportedBy: payment.studentId,
        reason: `stripe_${dispute.reason || 'dispute'}`,
        description: `Disputa Stripe ${dispute.id} fechada com status ${dispute.status}`,
        status: resolution,
        resolution,
        adminNotes,
        resolvedAt: now,
        expiresAt: this.getStripeDisputeDeadline(dispute),
      });
    }

    await this.db
      .update(payments)
      .set({
        status: PaymentStatus.DISPUTE_RESOLVED,
        splitData: this.buildMergedSplitData(payment, 'stripeDispute', {
          ...stripeDisputeMetadata,
          personalReversal: reversal,
          mappedAt: now.toISOString(),
        }),
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));

    await this.createTransaction({
      paymentId: payment.id,
      userId: payment.studentId,
      type: PaymentType.REFUND,
      amount: this.toMoneyString((dispute.amount || 0) / 100),
      description: `Disputa Stripe fechada: ${dispute.status}`,
      status: PaymentStatus.DISPUTE_RESOLVED,
      stripeDisputeId: dispute.id,
      metadata: {
        ...stripeDisputeMetadata,
        personalReversal: reversal,
      },
    });
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

    let payment = await this.db.query.payments.findFirst({
      where: eq(payments.classId, classId),
      with: {
        class: true,
        student: true,
        personal: true,
      },
    });

    if (!payment) {
      const classData = await this.db.query.classes.findFirst({
        where: eq(classes.id, classId),
        columns: {
          id: true,
          proposalId: true,
          personalId: true,
        },
      });

      if (classData?.proposalId) {
        payment = await this.db.query.payments.findFirst({
          where: eq(payments.proposalId, classData.proposalId),
          with: {
            class: true,
            student: true,
            personal: true,
          },
        });

        if (payment) {
          await this.db
            .update(payments)
            .set({
              classId,
              personalId: classData.personalId ?? payment.personalId,
              updatedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));

          payment = {
            ...payment,
            classId,
            personalId: classData.personalId ?? payment.personalId,
          };
        }
      }

      if (!payment) {
        console.error(
          '❌ [CAPTURE_AFTER_CLASS] Pagamento não encontrado para esta aula',
        );
        throw new NotFoundException('Pagamento não encontrado para esta aula');
      }
    }

    console.log('💰 [CAPTURE_AFTER_CLASS] Pagamento encontrado:', {
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      totalAmount: payment.totalAmount,
      personalAmount: payment.personalAmount,
      stripePaymentIntentId: payment.stripePaymentIntentId,
    });

    if (payment.status === PaymentStatus.CAPTURED) {
      console.log(
        `ℹ️ [CAPTURE_AFTER_CLASS] Pagamento ${payment.id} já capturado; liberação idempotente ignorada`,
      );
      return;
    }

    const isStripePayment = this.isStripePayment(payment);
    const canCapture = isStripePayment && payment.status === PaymentStatus.AUTHORIZED;

    if (!canCapture) {
      console.error(
        '❌ [CAPTURE_AFTER_CLASS] Pagamento não está em estado capturável. Status atual:',
        payment.status,
      );
      throw new BadRequestException(
        `Pagamento Stripe ainda não confirmado. Status atual: ${payment.status}`,
      );
    }

    console.log(
      '🔄 [CAPTURE_AFTER_CLASS] Liberando saldo interno e marcando como CAPTURED...',
    );
    const releaseResult = await this.releasePaymentToInternalWallet(payment, {
      classId,
      reason,
      allowPending: false,
    });

    if (releaseResult.alreadyReleased) {
      console.log(
        `ℹ️ [CAPTURE_AFTER_CLASS] Pagamento ${payment.id} já tinha liberação registrada`,
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
      provider: payment.provider,
      proposalId: payment.proposalId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeChargeId: payment.stripeChargeId,
      stripeTransferGroup: payment.stripeTransferGroup,
      stripeLatestChargeId: payment.stripeLatestChargeId,
      stripeRefundId: payment.stripeRefundId,
      processingModel: payment.processingModel,
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
      stripeTransferId: transaction.stripeTransferId,
      stripeBalanceTransactionId: transaction.stripeBalanceTransactionId,
      stripeRefundId: transaction.stripeRefundId,
      stripeDisputeId: transaction.stripeDisputeId,
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

      // Buscar dados do personal
      const personal = await this.db.query.users.findFirst({
        where: eq(users.id, transferDto.personalId),
      });

      if (!personal) {
        throw new NotFoundException('Personal trainer não encontrado');
      }

      // Verificar se personal tem perfil financeiro configurado
      const financialProfile = await this.db.query.financialProfiles.findFirst({
        where: eq(financialProfiles.userId, transferDto.personalId),
      });

      if (!financialProfile || !financialProfile.canReceivePayments) {
        throw new BadRequestException(
          'Personal trainer não tem perfil financeiro configurado',
        );
      }

      if (!this.isStripeWithdrawalProfileReady(financialProfile)) {
        throw new BadRequestException(
          'Personal trainer ainda não tem Stripe Connect pronto para saque',
        );
      }

      const transferMethod = this.normalizeWithdrawalTransferMethod(
        transferDto.transferMethod,
        financialProfile,
      );
      const personalData = this.preparePersonalDataForTransfer(
        financialProfile,
        transferMethod,
      );

      // Fazer transferência via Stripe Connect
      const payoutResult = await this.withdrawalPayoutProvider.executePayout({
        personalId: transferDto.personalId,
        amount: transferDto.amount,
        description: transferDto.description,
        transferMethod,
        personalData,
        context: {
          initiatedBy: `admin:${adminId}`,
        },
      });

      if (!payoutResult.success) {
        throw new BadRequestException(
          `Erro na transferência: ${payoutResult.failureReason}`,
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
          transferId: payoutResult.transferId,
          provider: payoutResult.provider,
          transferMethod,
          adminId,
        },
      });

      console.log(
        `✅ [TRANSFER] Transferência processada com sucesso: ${payoutResult.transferId}`,
      );

      return {
        success: true,
        transferId: payoutResult.transferId,
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
    console.log(`✅ [ADMIN] Aprovando saque ${approveDto.withdrawalId}`);

    const result = await this.processWithdrawalPayout(approveDto.withdrawalId, {
      transferMethodOverride: approveDto.transferMethod,
      adminId,
      adminNotes: approveDto.adminNotes,
      keepPendingOnFailure: false,
    });

    if (!result.success || !result.withdrawal) {
      throw new BadRequestException(
        result.error || 'Erro ao processar transferência do saque',
      );
    }

    return this.formatWithdrawalResponse(result.withdrawal);
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
  ): WithdrawalPayoutPersonalData {
    switch (transferMethod) {
      case 'stripe_connect':
        return {
          stripeAccountId: financialProfile.stripeAccountId,
        };
      default:
        throw new Error('Método de transferência inválido');
    }
  }

  private async resolveWithdrawalSourceTransactionId(
    userId: string,
    netAmount: number,
  ): Promise<string | undefined> {
    const candidateTransactions =
      await this.db.query.paymentTransactions.findMany({
        where: and(
          eq(paymentTransactions.userId, userId),
          eq(paymentTransactions.type, PaymentType.PERSONAL_EARNINGS),
          eq(paymentTransactions.status, PaymentStatus.CAPTURED),
          sql`${paymentTransactions.amount} >= ${this.toMoneyString(netAmount)}::numeric`,
        ),
        orderBy: [desc(paymentTransactions.createdAt)],
        limit: 20,
      });

    for (const transaction of candidateTransactions) {
      const metadata =
        transaction.metadata && typeof transaction.metadata === 'string'
          ? this.safeParseJson(transaction.metadata)
          : transaction.metadata;
      const sourceTransactionId =
        metadata?.stripeLatestChargeId || metadata?.stripeChargeId;

      if (sourceTransactionId) {
        return sourceTransactionId;
      }
    }

    return undefined;
  }

  private safeParseJson(value: string): Record<string, any> | null {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  async processWithdrawalPayout(
    withdrawalId: string,
    options?: {
      transferMethodOverride?: string;
      adminId?: string;
      adminNotes?: string;
      initiatedBy?: string;
      keepPendingOnFailure?: boolean;
      /**
       * Quando true, ignora a chamada ao provedor de payout (ex: admin que já
       * transferiu manualmente ou pagamento já foi split via marketplace).
       */
      skipPayoutProvider?: boolean;
    },
  ): Promise<{
    success: boolean;
    withdrawal?: any;
    error?: string;
    transferId?: string;
  }> {
    try {
      const withdrawal = await this.db.query.withdrawalRequests.findFirst({
        where: eq(withdrawalRequests.id, withdrawalId),
        with: {
          user: true,
        },
      });

      if (!withdrawal) {
        throw new NotFoundException('Solicitação de saque não encontrada');
      }

      if (withdrawal.status === 'completed') {
        return {
          success: true,
          withdrawal,
          transferId: withdrawal.transactionId,
        };
      }

      if (
        withdrawal.status !== 'pending' &&
        withdrawal.status !== 'processing'
      ) {
        throw new BadRequestException('Solicitação já foi processada');
      }

      const financialProfile = await this.db.query.financialProfiles.findFirst({
        where: eq(financialProfiles.userId, withdrawal.userId),
      });

      if (!financialProfile) {
        throw new BadRequestException('Perfil financeiro não encontrado');
      }

      if (!this.isStripeWithdrawalProfileReady(financialProfile)) {
        throw new BadRequestException(
          'Personal trainer ainda não tem Stripe Connect pronto para saque',
        );
      }

      const requestedAmount = parseFloat(withdrawal.amount);
      const netAmount = parseFloat(withdrawal.netAmount);
      const transferMethod = this.normalizeWithdrawalTransferMethod(
        options?.transferMethodOverride || withdrawal.method,
        financialProfile,
      );
      const personalData = this.preparePersonalDataForTransfer(
        financialProfile,
        transferMethod,
      );
      const attemptTimestamp = new Date().toISOString();
      const currentTransferData =
        withdrawal.transferData && typeof withdrawal.transferData === 'object'
          ? withdrawal.transferData
          : {};
      const previousPayout =
        currentTransferData.payout &&
        typeof currentTransferData.payout === 'object'
          ? currentTransferData.payout
          : {};
      const payoutAttemptCount = Number(previousPayout.attemptCount || 0) + 1;
      const payoutIdempotencyKey =
        previousPayout.idempotencyKey ||
        `stripe_withdrawal:${withdrawalId}:${withdrawal.userId}:${this.toMoneyString(netAmount)}`;
      const stripeTransferGroup = `withdrawal_${withdrawalId}`;
      const sourceTransactionId =
        previousPayout.sourceTransactionId ||
        (await this.resolveWithdrawalSourceTransactionId(
          withdrawal.userId,
          netAmount,
        ));

      await this.db
        .update(withdrawalRequests)
        .set({
          status: 'processing',
          updatedAt: new Date(),
          processedAt: new Date(),
          failureReason: null,
          transferData: {
            ...currentTransferData,
            payout: {
              ...previousPayout,
              provider: previousPayout.provider || 'pending_provider',
              attemptCount: payoutAttemptCount,
              idempotencyKey: payoutIdempotencyKey,
              lastAttemptAt: attemptTimestamp,
              lastInitiatedBy: options?.initiatedBy || 'admin',
              lastTransferMethod: transferMethod,
              lastStatus: 'processing',
              stripeAccountId: financialProfile.stripeAccountId,
              stripeTransferGroup,
              sourceTransactionId,
            },
          },
        })
        .where(eq(withdrawalRequests.id, withdrawalId));

      let payoutResult: WithdrawalPayoutResult;

      if (options?.skipPayoutProvider) {
        // Admin aprovou manualmente (já transferiu via MP/banco) ou pagamento foi
        // split e o dinheiro já está na conta do personal — sem chamada de API.
        payoutResult = {
          success: true,
          provider: 'manual',
          externalStatus: 'completed',
        };
      } else {
        payoutResult = await this.withdrawalPayoutProvider.executePayout({
          personalId: withdrawal.userId,
          amount: netAmount,
          description: withdrawal.description || 'Saque processado',
          transferMethod,
          personalData,
          context: {
            withdrawalId,
            initiatedBy: options?.initiatedBy || 'admin',
            idempotencyKey: payoutIdempotencyKey,
            sourceTransactionId,
          },
        });
      }

      if (!payoutResult.success) {
        const fallbackStatus = options?.keepPendingOnFailure
          ? 'pending'
          : 'failed';

        const failureUpdate = {
          status: fallbackStatus,
          failureReason:
            payoutResult.failureReason || 'Falha ao processar transferência',
          updatedAt: new Date(),
          transferData: {
            ...currentTransferData,
            payout: {
              ...previousPayout,
              provider: payoutResult.provider,
              attemptCount: payoutAttemptCount,
              idempotencyKey:
                payoutResult.idempotencyKey || payoutIdempotencyKey,
              lastAttemptAt: attemptTimestamp,
              lastInitiatedBy: options?.initiatedBy || 'admin',
              lastTransferMethod: transferMethod,
              lastStatus: fallbackStatus,
              stripeAccountId:
                payoutResult.destinationAccountId ||
                financialProfile.stripeAccountId,
              stripeTransferGroup,
              sourceTransactionId,
              failureCode: payoutResult.failureCode,
              failureReason: payoutResult.failureReason,
            },
          },
        };

        const [failedWithdrawal] = options?.keepPendingOnFailure
          ? await this.db
              .update(withdrawalRequests)
              .set(failureUpdate)
              .where(eq(withdrawalRequests.id, withdrawalId))
              .returning()
          : await this.db.transaction(async (tx: any) => {
              await tx
                .update(userWallets)
                .set({
                  availableBalance: sql`${userWallets.availableBalance} + ${this.toMoneyString(requestedAmount)}::numeric`,
                  pendingBalance: sql`${userWallets.pendingBalance} - ${this.toMoneyString(requestedAmount)}::numeric`,
                  updatedAt: new Date(),
                })
                .where(eq(userWallets.userId, withdrawal.userId));

              return tx
                .update(withdrawalRequests)
                .set(failureUpdate)
                .where(eq(withdrawalRequests.id, withdrawalId))
                .returning();
            });

        await this.createWithdrawalHistory({
          withdrawalId,
          userId: withdrawal.userId,
          action: options?.keepPendingOnFailure
            ? 'auto_failed_pending'
            : 'failed',
          description: options?.keepPendingOnFailure
            ? 'Tentativa automática falhou e o saque permaneceu pendente para análise manual'
            : 'Falha ao processar saque',
          adminId: options?.adminId,
          metadata: {
            error: payoutResult.failureReason,
            failureCode: payoutResult.failureCode,
            provider: payoutResult.provider,
            transferMethod,
            stripeAccountId:
              payoutResult.destinationAccountId ||
              financialProfile.stripeAccountId,
            stripeTransferGroup,
            sourceTransactionId,
            idempotencyKey: payoutResult.idempotencyKey || payoutIdempotencyKey,
            initiatedBy: options?.initiatedBy || 'admin',
          },
        });

        return {
          success: false,
          withdrawal: failedWithdrawal,
          error: payoutResult.failureReason,
        };
      }

      const completedAt = new Date();
      const [updatedWithdrawal] = await this.db.transaction(async (tx: any) => {
        await tx
          .update(userWallets)
          .set({
            pendingBalance: sql`${userWallets.pendingBalance} - ${this.toMoneyString(requestedAmount)}::numeric`,
            totalWithdrawn: sql`${userWallets.totalWithdrawn} + ${this.toMoneyString(requestedAmount)}::numeric`,
            lastWithdrawalAt: completedAt,
            updatedAt: completedAt,
          })
          .where(eq(userWallets.userId, withdrawal.userId));

        return tx
          .update(withdrawalRequests)
          .set({
            status: 'completed',
            adminNotes: options?.adminNotes,
            transactionId: payoutResult.transferId,
            processedAt: withdrawal.processedAt || completedAt,
            completedAt,
            updatedAt: completedAt,
            failureReason: null,
            transferData: {
              ...currentTransferData,
              payout: {
                ...previousPayout,
                provider: payoutResult.provider,
                attemptCount: payoutAttemptCount,
                idempotencyKey:
                  payoutResult.idempotencyKey || payoutIdempotencyKey,
                lastAttemptAt: attemptTimestamp,
                lastInitiatedBy: options?.initiatedBy || 'admin',
                lastTransferMethod: transferMethod,
                lastStatus: 'completed',
                externalTransferId: payoutResult.transferId,
                balanceTransactionId: payoutResult.balanceTransactionId,
                stripeAccountId:
                  payoutResult.destinationAccountId ||
                  financialProfile.stripeAccountId,
                stripeTransferGroup,
                sourceTransactionId,
              },
            },
          })
          .where(eq(withdrawalRequests.id, withdrawalId))
          .returning();
      });

      await this.createWithdrawalHistory({
        withdrawalId,
        userId: withdrawal.userId,
        action: options?.adminId ? 'approved' : 'auto_completed',
        description: options?.adminId
          ? 'Saque aprovado e pago pelo painel admin'
          : 'Saque processado automaticamente',
        adminId: options?.adminId,
        metadata: {
          transferId: payoutResult.transferId,
          balanceTransactionId: payoutResult.balanceTransactionId,
          provider: payoutResult.provider,
          transferMethod,
          stripeAccountId:
            payoutResult.destinationAccountId ||
            financialProfile.stripeAccountId,
          stripeTransferGroup,
          sourceTransactionId,
          idempotencyKey: payoutResult.idempotencyKey || payoutIdempotencyKey,
          requestedAmount,
          netAmount,
          initiatedBy: options?.initiatedBy || 'admin',
        },
      });

      return {
        success: true,
        withdrawal: updatedWithdrawal,
        transferId: payoutResult.transferId,
      };
    } catch (error) {
      console.error(
        `❌ [WITHDRAWAL] Erro ao processar saque ${withdrawalId}:`,
        error,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private normalizeWithdrawalTransferMethod(
    method: string,
    financialProfile?: any,
  ): WithdrawalTransferMethod {
    if (financialProfile?.stripeAccountId) {
      return 'stripe_connect';
    }

    switch (method) {
      case 'stripe_connect':
        return 'stripe_connect';
      default:
        throw new Error('Saque deve usar Stripe Connect');
    }
  }

  private isStripeWithdrawalProfileReady(financialProfile: any): boolean {
    const requirements = this.normalizeStripeRequirements(
      financialProfile?.stripeRequirements,
    );

    return Boolean(
      financialProfile?.stripeAccountId &&
        financialProfile?.stripeDetailsSubmitted &&
        financialProfile?.stripePayoutsEnabled &&
        requirements.currentlyDue.length === 0 &&
        requirements.pastDue.length === 0,
    );
  }

  private normalizeStripeRequirements(raw: any): {
    currentlyDue: string[];
    pastDue: string[];
  } {
    const requirements = raw || {};
    return {
      currentlyDue: Array.isArray(requirements.currently_due)
        ? requirements.currently_due
        : Array.isArray(requirements.currentlyDue)
          ? requirements.currentlyDue
          : [],
      pastDue: Array.isArray(requirements.past_due)
        ? requirements.past_due
        : Array.isArray(requirements.pastDue)
          ? requirements.pastDue
          : [],
    };
  }

  private async createWithdrawalHistory(data: {
    withdrawalId: string;
    userId: string;
    action: string;
    description: string;
    adminId?: string;
    metadata?: any;
  }): Promise<void> {
    const normalizedAdminId =
      data.adminId && this.isUuid(data.adminId) ? data.adminId : undefined;

    await this.db.insert(withdrawalHistory).values({
      ...data,
      adminId: normalizedAdminId,
      createdAt: new Date(),
    });
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private formatWithdrawalResponse(withdrawal: any): WithdrawalResponseDto {
    const payout =
      withdrawal.transferData && typeof withdrawal.transferData === 'object'
        ? withdrawal.transferData.payout
        : undefined;
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
      stripeTransferId:
        payout?.provider === 'stripe' ? payout.externalTransferId : undefined,
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
