import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  proposals,
  users,
  classes,
  payments,
  ratings,
  files,
  locations,
  usedNonces,
  userPushTokens,
  financialProfiles,
} from '../../database/schema';
import {
  eq,
  and,
  desc,
  gte,
  lte,
  ilike,
  count,
  sql,
  or,
  lt,
  inArray,
} from 'drizzle-orm';
import {
  CreateProposalDto,
  CreateRecontractDto,
  UpdateProposalDto,
  ProposalQueryDto,
  ProposalResponseDto,
  ProposalListResponseDto,
  ProposalStatus,
} from './dto/proposals.dto';
import { buildTrainingStartDate } from './proposals.utils';
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
import { StudentPaymentMethod } from '../payments/dto/student-payment-methods.dto';
import { PaymentsService } from '../payments/payments.service';
import { JobsService } from '../jobs/jobs.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ProposalsGateway } from './proposals.gateway';
import { NonceService } from '../notifications/services/nonce.service';
import { ConflictException } from '@nestjs/common';
import { LocationsService } from '../locations/locations.service';
// Enum ClassStatus não exportado no schema, usando string diretamente

@Injectable()
export class ProposalsService {
  private readonly paymentConfirmedStatuses = new Set([
    'authorized',
    'approved',
    'captured',
  ]);

  private isPaymentConfirmedStatus(status?: string | null): boolean {
    const normalized = String(status || '').toLowerCase();
    return this.paymentConfirmedStatuses.has(normalized);
  }

  private extractErrorMessage(
    error: any,
    fallback = 'Erro ao processar pagamento',
  ): string {
    const responseMessage = error?.response?.message;
    if (Array.isArray(responseMessage)) {
      return responseMessage.join('; ');
    }
    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage;
    }
    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message;
    }
    return fallback;
  }

  private async ensureRecontractWindowIsOpen(
    studentId: string,
    personalId: string,
  ): Promise<void> {
    const [latestCompletedClass] = await this.db
      .select({
        id: classes.id,
        completedAt: classes.completedAt,
        date: classes.date,
      })
      .from(classes)
      .where(
        and(
          eq(classes.studentId, studentId),
          eq(classes.personalId, personalId),
          eq(classes.status, 'completed'),
        ),
      )
      .orderBy(desc(classes.completedAt), desc(classes.date))
      .limit(1);

    if (!latestCompletedClass) {
      throw new BadRequestException(
        'Recontratação só está disponível até 24 horas após uma aula concluída com este profissional.',
      );
    }

    const referenceTime =
      latestCompletedClass.completedAt != null
        ? new Date(latestCompletedClass.completedAt)
        : new Date(latestCompletedClass.date);
    const deadline = new Date(referenceTime.getTime() + 24 * 60 * 60 * 1000);

    // TEMP: deadline check disabled for split payment test
    // if (new Date() > deadline) {
    //   throw new BadRequestException(
    //     'O prazo para recontratar este profissional expirou. A recontratação fica disponível por até 24 horas após a aula.',
    //   );
    // }
  }

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly studentPaymentService: StudentPaymentMethodsService,
    private readonly paymentsService: PaymentsService,
    private readonly jobsService: JobsService,
    private readonly chatGateway: ChatGateway,
    private readonly proposalsGateway: ProposalsGateway,
    private readonly nonceService: NonceService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async createProposal(
    createProposalDto: CreateProposalDto,
    studentId: string,
  ): Promise<ProposalResponseDto> {
    // Verificar se o usuário é um aluno
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    if (!user.length || user[0].userType !== 'student') {
      throw new ForbiddenException('Apenas alunos podem criar propostas');
    }

    // Validação de tempo removida - permite criar propostas para qualquer horário
    const trainingDate = new Date(createProposalDto.trainingDate);
    console.log(
      '🔍 [PROPOSALS] Data do treino recebida:',
      createProposalDto.trainingDate,
    );

    // ===== VALIDAR CONFLITOS DE HORÁRIO (ABORDAGEM MATEMÁTICA) =====
    try {
      console.log(
        '🔍 [PROPOSALS] Validando conflitos de horário usando intervalos matemáticos...',
      );

      const dateString = trainingDate.toISOString().split('T')[0];

      // Buscar dados necessários para validação matemática
      let existingProposals = await this.db.query.proposals.findMany({
        where: and(
          eq(proposals.studentId, studentId),
          sql`DATE(${proposals.trainingDate}) = ${dateString}`,
          or(
            eq(proposals.status, 'pending'),
            eq(proposals.status, 'matched'),
            // Propostas 'disputed', 'completed', 'cancelled' não bloqueiam criação de novas propostas
          ),
        ),
        columns: {
          id: true,
          trainingTime: true,
          status: true,
          durationMinutes: true,
        },
      });

      // Filtrar explicitamente propostas canceladas, disputadas, completadas e sem horário
      const beforeFilter = existingProposals.length;
      existingProposals = existingProposals.filter(
        (proposal) =>
          proposal.status !== 'cancelled' &&
          proposal.status !== 'disputed' &&
          proposal.status !== 'completed' &&
          proposal.trainingTime !== null &&
          proposal.trainingTime !== undefined,
      );
      const afterFilter = existingProposals.length;

      if (beforeFilter !== afterFilter) {
        console.log(
          `🔍 [PROPOSALS] Filtro aplicado: ${beforeFilter} → ${afterFilter} propostas (removidas: ${beforeFilter - afterFilter})`,
        );
      }

      // Ignorar propostas cujo vínculo (aula) está em disputa de no-show
      const disputedClasses = await this.db.query.classes.findMany({
        where: and(
          sql`DATE(${classes.date}) = ${dateString}`,
          eq(classes.studentId, studentId as any),
          eq(classes.status, 'no_show_dispute'),
        ),
        columns: { proposalId: true },
      });
      const disputedProposalIds = new Set(
        disputedClasses.map((c) => c.proposalId).filter(Boolean),
      );
      if (disputedProposalIds.size > 0) {
        existingProposals = existingProposals.filter(
          (p) => !disputedProposalIds.has(p.id),
        );
      }

      // Ignorar propostas matched cujas aulas estão canceladas
      const cancelledClasses = await this.db.query.classes.findMany({
        where: and(
          sql`DATE(${classes.date}) = ${dateString}`,
          eq(classes.studentId, studentId as any),
          eq(classes.status, 'cancelled'),
        ),
        columns: { proposalId: true },
      });
      const cancelledProposalIds = new Set(
        cancelledClasses.map((c) => c.proposalId).filter(Boolean),
      );
      if (cancelledProposalIds.size > 0) {
        const beforeCancelledFilter = existingProposals.length;
        existingProposals = existingProposals.filter(
          (p) => !cancelledProposalIds.has(p.id),
        );
        console.log(
          `  - Propostas filtradas (aulas canceladas): ${beforeCancelledFilter} → ${existingProposals.length}`,
        );
      }

      const matchedClasses = await this.db.query.classes.findMany({
        where: and(
          eq(classes.studentId, studentId as any), // FILTRAR POR ALUNO
          sql`DATE(${classes.date}) = ${dateString}`,
          or(eq(classes.status, 'scheduled'), eq(classes.status, 'active')),
        ),
        columns: {
          id: true,
          time: true,
          status: true,
          duration: true,
        },
      });

      // Usar validação matemática (muito mais eficiente)
      const validation = this.canScheduleTimeMathematical(
        createProposalDto.trainingTime,
        createProposalDto.durationMinutes,
        existingProposals,
        matchedClasses,
      );

      if (!validation.canSchedule) {
        const conflictingItem = validation.conflictingItem;
        const itemType =
          conflictingItem?.type === 'proposal' ? 'proposta' : 'aula';
        const itemStatus =
          conflictingItem?.status === 'pending'
            ? 'pendente'
            : conflictingItem?.status === 'matched'
              ? 'em andamento'
              : conflictingItem?.status === 'scheduled'
                ? 'agendada'
                : 'ativa';

        let errorMessage = '';

        if (validation.reason === 'overlap') {
          if (itemType === 'proposta') {
            errorMessage = `Horário indisponível. Você já tem uma proposta ${itemStatus} neste horário.`;
          } else {
            errorMessage = `Horário indisponível. Já existe uma aula ${itemStatus} neste horário.`;
          }
        } else if (validation.reason === 'buffer') {
          if (itemType === 'proposta') {
            errorMessage = `Horário indisponível. Você já tem uma proposta ${itemStatus} muito próxima deste horário (intervalo de 1 hora necessário).`;
          } else {
            errorMessage = `Horário indisponível. Já existe uma aula ${itemStatus} muito próxima deste horário (intervalo de 1 hora necessário).`;
          }
        }

        console.log(
          `❌ [PROPOSALS] Horário ${createProposalDto.trainingTime} bloqueado: ${errorMessage}`,
        );
        throw new BadRequestException(errorMessage);
      }

      console.log('✅ [PROPOSALS] Validação matemática de conflitos passou');
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('❌ [PROPOSALS] Erro na validação de conflitos:', error);
      throw new BadRequestException(
        'Não foi possível validar conflitos de horário no momento. Tente novamente.',
      );
    }

    // ===== GARANTIR QUE LOCAL TEM COORDENADAS =====
    let finalLocationId = createProposalDto.locationId;

    // Se não tem locationId, tentar criar/atualizar local com coordenadas
    if (
      !finalLocationId &&
      createProposalDto.locationName &&
      createProposalDto.locationAddress
    ) {
      console.log(
        `📍 [PROPOSALS] Proposta sem locationId, tentando criar/atualizar local com coordenadas...`,
      );

      // ✅ Usar coordenadas do DTO se disponíveis, senão fazer geocoding
      const locationLat = createProposalDto.locationLat;
      const locationLng = createProposalDto.locationLng;

      if (locationLat && locationLng) {
        console.log(
          `✅ [PROPOSALS] Coordenadas recebidas do app: lat=${locationLat}, lng=${locationLng}`,
        );
      } else {
        console.log(
          `⚠️ [PROPOSALS] Coordenadas não fornecidas pelo app, será feito geocoding do endereço`,
        );
      }

      try {
        const locationsService = this.moduleRef.get(LocationsService, {
          strict: false,
        });
        finalLocationId = await locationsService.createOrUpdateLocation(
          createProposalDto.locationName,
          createProposalDto.locationAddress,
          locationLat, // ✅ Passar coordenadas se disponíveis
          locationLng,
        );

        if (finalLocationId) {
          console.log(
            `✅ [PROPOSALS] Local criado/atualizado com coordenadas: ${finalLocationId}`,
          );
        } else {
          console.log(
            `⚠️ [PROPOSALS] Não foi possível obter coordenadas para o local. A proposta será criada sem locationId, mas FCM será bloqueado.`,
          );
        }
      } catch (error) {
        console.error(`❌ [PROPOSALS] Erro ao criar/atualizar local:`, error);
        // Continuar mesmo se falhar - FCM será bloqueado depois
      }
    }

    // Atualizar locationId se foi criado/atualizado
    if (finalLocationId && finalLocationId !== createProposalDto.locationId) {
      console.log(
        `🔄 [PROPOSALS] Atualizando locationId da proposta: ${createProposalDto.locationId || 'null'} -> ${finalLocationId}`,
      );
    }

    // ===== CRIAR PROPOSTA PRIMEIRO =====
    const [proposal] = await this.db
      .insert(proposals)
      .values({
        studentId,
        locationId: finalLocationId,
        locationName: createProposalDto.locationName,
        locationAddress: createProposalDto.locationAddress,
        trainingDate: trainingDate,
        trainingTime: createProposalDto.trainingTime,
        durationMinutes: createProposalDto.durationMinutes,
        modalityId: createProposalDto.modalityId,
        modalityName: createProposalDto.modalityName,
        price: createProposalDto.price.toString(),
        additionalNotes: createProposalDto.additionalNotes,
        status: ProposalStatus.PENDING,
        // Campos de pagamento serão preenchidos após processamento
        paymentId: null,
        paymentMethod: createProposalDto.paymentMethod,
        paymentStatus: 'pending',
      })
      .returning();

    // ===== PROCESSAR PAGAMENTO APÓS CRIAR PROPOSTA =====
    try {
      // Criar preferência de pagamento específica para propostas usando ID real
      const paymentResult = await this.createProposalPaymentPreference(
        createProposalDto,
        user[0],
        trainingDate,
        proposal.id, // Usar ID real da proposta
      );

      // Considerar sucesso quando MP autorizar/aprovar ou quando for PIX pendente aguardando pagamento.
      // Se for simulado, só permitir quando explícito via ENV e apenas em TEST.
      const paymentStatus = String(paymentResult.status || '').toLowerCase();
      const isPix = createProposalDto.paymentMethod === 'pix';
      const statusOk =
        ['authorized', 'approved', 'captured'].includes(paymentStatus) ||
        (isPix && paymentStatus === 'pending' && !!paymentResult.qrCode);
      const isSimulated = Boolean((paymentResult as any)?._simulated);
      const allowSimulated =
        process.env.ALLOW_SIMULATED_PAYMENTS_FOR_PROPOSALS === 'true';
      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');

      console.log('🔍 [PROPOSALS] Validação do pagamento:', {
        success: paymentResult.success,
        status: paymentResult.status,
        statusOk,
        isSimulated,
        allowSimulated,
        isTestEnv,
        message: paymentResult.message,
      });

      if (
        !paymentResult.success ||
        !statusOk ||
        (isSimulated && !(allowSimulated && isTestEnv))
      ) {
        // Se pagamento falhar, deletar pagamentos (FK) e depois a proposta
        await this.db
          .delete(payments)
          .where(eq(payments.proposalId, proposal.id));
        await this.db.delete(proposals).where(eq(proposals.id, proposal.id));
        const reason = isSimulated
          ? 'Pagamento em simulação (sandbox) não permite criar proposta'
          : paymentResult.message || 'Falha no pagamento';
        throw new BadRequestException(`Falha no pagamento: ${reason}`);
      }

      // Atualizar proposta com dados do pagamento
      await this.db
        .update(proposals)
        .set({
          paymentId: paymentResult.paymentId,
          paymentStatus: paymentResult.status,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id));

      // Agendar timeout para proposta se pagamento ainda está pendente
      if (paymentResult.status === 'pending') {
        await this.jobsService.scheduleProposalExpiration({
          proposalId: proposal.id,
          studentId: studentId,
          createdAt: new Date(),
          expirationTime: 30, // 30 minutos
        });

        // Agendar lembretes de pagamento
        await this.schedulePaymentReminders(proposal.id);
      }

      // Buscar dados do usuário para incluir na resposta
      const [student] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, studentId))
        .limit(1);

      // Buscar proposta atualizada do banco para ter o paymentStatus correto
      const [updatedProposal] = await this.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposal.id))
        .limit(1);

      // Retornar proposta com dados do pagamento e do usuário
      const proposalResponse = await this.mapToResponseDto(
        updatedProposal,
        student,
      );

      // ===== NOTIFICAR PERSONALS (APENAS SE PAGAMENTO CONFIRMADO) =====
      if (this.isPaymentConfirmedStatus(paymentResult.status)) {
        // Notificar personals próximos (FCM e WebSocket)
        // O método notifyNearbyPersonals já lida com filtros de online, raio e conflitos.
        await this.notifyNearbyPersonals(proposalResponse, student);
      } else {
        console.log(
          `⏳ [PROPOSALS] Proposta ${proposal.id} criada sem envio imediato aos personals (aguardando confirmação de pagamento: ${paymentResult.status})`,
        );
      }

      return {
        ...proposalResponse,
        payment: {
          paymentId: String(paymentResult.paymentId),
          status: paymentResult.status,
          method: createProposalDto.paymentMethod,
          amount: createProposalDto.price,
          preferenceId: paymentResult.preferenceId,
          checkoutUrl: paymentResult.checkoutUrl,
          sandboxCheckoutUrl: paymentResult.sandboxCheckoutUrl,
          qrCode: paymentResult.qrCode,
          qrCodeBase64: paymentResult.qrCodeBase64,
          platformFee: paymentResult.platformFee,
          personalAmount: paymentResult.personalAmount,
          message: paymentResult.message,
          expiresAt:
            paymentResult.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
        },
      };
    } catch (error) {
      console.error('❌ [PROPOSALS] Erro no pagamento:', error.message);
      // Se falhar após pagamento aprovado, tentar reembolso antes de deletar.
      try {
        if (proposal?.id) {
          // Verificar se há pagamento aprovado que precisa ser reembolsado
          const existingPayment = await this.db.query.payments.findFirst({
            where: eq(payments.proposalId, proposal.id),
          });
          if (
            existingPayment &&
            this.isPaymentConfirmedStatus(existingPayment.status as string)
          ) {
            try {
              await this.processAutomaticRefund(
                proposal.id,
                existingPayment.mpPaymentId ?? '',
                'Falha ao criar proposta após pagamento aprovado',
              );
              console.log(
                '✅ [PROPOSALS] Reembolso realizado após falha na criação da proposta:',
                proposal.id,
              );
            } catch (refundErr) {
              // Se o reembolso falhar, NÃO deletar — preservar registros para reconciliação manual.
              console.error(
                `🚨 [PROPOSALS] CRITICAL: falha ao reembolsar após erro em createProposal (proposalId=${proposal.id}, paymentId=${existingPayment.mpPaymentId}). Registros preservados para auditoria.`,
                refundErr,
              );
              return; // Sair sem deletar — auditoria é mais importante
            }
          }
          // Remover registro de pagamento vinculado antes de deletar a proposta
          await this.db
            .delete(payments)
            .where(eq(payments.proposalId, proposal.id));
          await this.db.delete(proposals).where(eq(proposals.id, proposal.id));
          console.log(
            '🗑️ [PROPOSALS] Proposta e pagamento removidos após falha:',
            proposal.id,
          );
        }
      } catch (cleanupErr) {
        console.error(
          '⚠️ [PROPOSALS] Erro ao remover proposta após falha no pagamento:',
          cleanupErr,
        );
      }
      // Propagar erro amigável
      const friendlyMessage = this.extractErrorMessage(
        error,
        'Erro no pagamento',
      );
      throw new BadRequestException(friendlyMessage);
    }
  }

  async createRecontract(
    createRecontractDto: CreateRecontractDto,
    studentId: string,
  ): Promise<ProposalResponseDto> {
    console.log('🚀 [PROPOSALS SERVICE] ===== INÍCIO DA RECONTRATAÇÃO =====');
    console.log('👤 [PROPOSALS SERVICE] Student ID:', studentId);
    console.log(
      '🎯 [PROPOSALS SERVICE] Personal ID:',
      createRecontractDto.personalId,
    );

    // Validar se o solicitante é aluno
    const [studentUser] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    if (!studentUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (studentUser.userType !== 'student') {
      throw new ForbiddenException('Apenas alunos podem criar recontratação');
    }

    // Validar se o personal trainer existe e está aprovado
    const [personal] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, createRecontractDto.personalId),
          eq(users.userType, 'personal'),
          eq(users.status, 'active'),
          eq(users.approvalStatus, 'approved' as any), // ✅ Apenas personals aprovados
        ),
      )
      .limit(1);

    if (!personal) {
      throw new NotFoundException(
        'Personal trainer não encontrado, inativo ou não aprovado',
      );
    }

    await this.ensureRecontractWindowIsOpen(
      studentId,
      createRecontractDto.personalId,
    );

    console.log(
      '✅ [PROPOSALS SERVICE] Personal trainer encontrado:',
      personal.firstName,
      personal.lastName,
    );

    // Validar data (não pode ser no passado)
    const trainingDate = new Date(createRecontractDto.trainingDate);
    const now = new Date();
    if (trainingDate < now) {
      throw new BadRequestException('A data do treino não pode ser no passado');
    }

    const user = studentUser;

    // ===== CRIAR PROPOSTA DE RECONTRATAÇÃO PRIMEIRO =====
    const [proposal] = await this.db
      .insert(proposals)
      .values({
        studentId,
        locationId: createRecontractDto.locationId,
        locationName: createRecontractDto.locationName,
        locationAddress: createRecontractDto.locationAddress,
        trainingDate: trainingDate,
        trainingTime: createRecontractDto.trainingTime,
        durationMinutes: createRecontractDto.durationMinutes,
        modalityId: createRecontractDto.modalityId,
        modalityName: createRecontractDto.modalityName,
        price: createRecontractDto.price.toString(),
        additionalNotes:
          createRecontractDto.additionalNotes || 'Recontratação direta',
        status: ProposalStatus.PENDING,
        // Campos de pagamento serão preenchidos após processamento
        paymentId: null,
        paymentMethod: createRecontractDto.paymentMethod,
        paymentStatus: 'pending',
        // Campo específico para recontratação
        targetPersonalId: createRecontractDto.personalId, // Novo campo para identificar recontratação
      })
      .returning();

    // ===== PROCESSAR PAGAMENTO APÓS CRIAR PROPOSTA =====
    try {
      // Criar preferência de pagamento específica para recontratação usando ID real
      const paymentResult = await this.createProposalPaymentPreference(
        createRecontractDto,
        user,
        trainingDate,
        proposal.id, // Usar ID real da proposta
      );

      // Considerar sucesso quando MP autorizar/aprovar ou quando for PIX pendente aguardando pagamento.
      // Se for simulado, só permitir quando explícito via ENV e apenas em TEST.
      const paymentStatus = String(paymentResult.status || '').toLowerCase();
      const isPix = createRecontractDto.paymentMethod === 'pix';
      const statusOk =
        ['authorized', 'approved', 'captured'].includes(paymentStatus) ||
        (isPix && paymentStatus === 'pending' && !!paymentResult.qrCode);
      const isSimulated = Boolean((paymentResult as any)?._simulated);
      const allowSimulated =
        process.env.ALLOW_SIMULATED_PAYMENTS_FOR_PROPOSALS === 'true';
      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');

      if (
        !paymentResult.success ||
        !statusOk ||
        (isSimulated && !(allowSimulated && isTestEnv))
      ) {
        // Se pagamento falhar, deletar pagamentos (FK) e depois a proposta
        await this.db
          .delete(payments)
          .where(eq(payments.proposalId, proposal.id));
        await this.db.delete(proposals).where(eq(proposals.id, proposal.id));
        const reason = isSimulated
          ? 'Pagamento em simulação (sandbox) não permite criar proposta'
          : paymentResult.message || 'Falha no pagamento';
        throw new BadRequestException(`Falha no pagamento: ${reason}`);
      }

      // Atualizar proposta com dados do pagamento
      await this.db
        .update(proposals)
        .set({
          paymentId: paymentResult.paymentId,
          paymentStatus: paymentResult.status,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id));

      // Agendar timeout para proposta se pagamento ainda está pendente
      if (paymentResult.status === 'pending') {
        await this.jobsService.scheduleProposalExpiration({
          proposalId: proposal.id,
          studentId: studentId,
          createdAt: new Date(),
          expirationTime: 30, // 30 minutos
        });

        // Agendar lembretes de pagamento
        await this.schedulePaymentReminders(proposal.id);
      }

      // Buscar proposta atualizada para retornar paymentStatus/paymentId corretos.
      const [updatedProposal] = await this.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposal.id))
        .limit(1);

      // Retornar proposta com dados do pagamento e do usuário
      const proposalResponse = await this.mapToResponseDto(
        updatedProposal ?? proposal,
        user,
      );

      // ===== NOTIFICAR PERSONAL ESPECÍFICO (APENAS COM PAGAMENTO CONFIRMADO) =====
      if (this.isPaymentConfirmedStatus(paymentResult.status)) {
        try {
          // Enviar push/app notification para o personal alvo (online ou offline)
          await this.proposalsGateway.sendProposalCreated({
            proposal: proposalResponse,
            student: {
              id: user?.id,
              name: `${user?.firstName} ${user?.lastName}`,
              firstName: user?.firstName,
              lastName: user?.lastName,
              profileImageUrl: user?.profileImageUrl,
            },
            nearbyPersonals: [createRecontractDto.personalId],
          });

          console.log(
            '📡 [PROPOSALS SERVICE] Notificação de recontratação enviada para personal:',
            createRecontractDto.personalId,
          );
        } catch (error) {
          console.error(
            '❌ [PROPOSALS SERVICE] Erro ao emitir evento de recontratação:',
            error,
          );
          // Não falhar a operação por causa de problemas de WebSocket
        }
      } else {
        console.log(
          `⏳ [PROPOSALS SERVICE] Recontratação ${proposal.id} criada sem envio ao personal (aguardando pagamento). paymentStatus=${paymentResult.status}`,
        );
      }

      console.log(
        '✅ [PROPOSALS SERVICE] Recontratação criada com sucesso:',
        proposal.id,
      );
      console.log('🏁 [PROPOSALS SERVICE] ===== FIM DA RECONTRATAÇÃO =====');

      return {
        ...proposalResponse,
        payment: {
          paymentId: String(paymentResult.paymentId),
          status: paymentResult.status,
          method: createRecontractDto.paymentMethod,
          amount: createRecontractDto.price,
          preferenceId: paymentResult.preferenceId,
          checkoutUrl: paymentResult.checkoutUrl,
          sandboxCheckoutUrl: paymentResult.sandboxCheckoutUrl,
          qrCode: paymentResult.qrCode,
          qrCodeBase64: paymentResult.qrCodeBase64,
          platformFee: paymentResult.platformFee,
          personalAmount: paymentResult.personalAmount,
          message: paymentResult.message,
          expiresAt:
            paymentResult.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
        },
      };
    } catch (error) {
      console.error(
        '❌ [PROPOSALS SERVICE] Erro no pagamento da recontratação:',
        error.message,
      );
      // Se falhar após pagamento aprovado, tentar reembolso antes de deletar.
      try {
        if (proposal?.id) {
          const existingPayment = await this.db.query.payments.findFirst({
            where: eq(payments.proposalId, proposal.id),
          });
          if (
            existingPayment &&
            this.isPaymentConfirmedStatus(existingPayment.status as string)
          ) {
            try {
              await this.processAutomaticRefund(
                proposal.id,
                existingPayment.mpPaymentId ?? '',
                'Falha ao criar recontratação após pagamento aprovado',
              );
            } catch (refundErr) {
              // Se reembolso falhar, NÃO deletar — preservar para reconciliação manual.
              console.error(
                `🚨 [PROPOSALS] CRITICAL: falha ao reembolsar recontratação (proposalId=${proposal.id}). Registros preservados para auditoria.`,
                refundErr,
              );
              const friendlyMessage = this.extractErrorMessage(
                error,
                'Erro no pagamento',
              );
              throw new BadRequestException(friendlyMessage);
            }
          }
          // Remover pagamentos (FK) e depois a proposta
          await this.db
            .delete(payments)
            .where(eq(payments.proposalId, proposal.id));
          await this.db.delete(proposals).where(eq(proposals.id, proposal.id));
          console.log(
            '🗑️ [PROPOSALS SERVICE] Proposta de recontratação removida por falha no pagamento:',
            proposal.id,
          );
        }
      } catch (cleanupErr) {
        if (cleanupErr instanceof BadRequestException) throw cleanupErr;
        console.error(
          '⚠️ [PROPOSALS SERVICE] Erro ao remover proposta de recontratação após falha:',
          cleanupErr,
        );
      }
      // Propagar erro amigável
      const friendlyMessage = this.extractErrorMessage(
        error,
        'Erro no pagamento',
      );
      throw new BadRequestException(friendlyMessage);
    }
  }

  async getProposals(
    query: ProposalQueryDto,
    userId: string,
    userType: string,
  ): Promise<ProposalListResponseDto> {
    const { page = 1, limit = 10, status, modality, dateFrom, dateTo } = query;
    const offset = (page - 1) * limit;

    // Limpeza automática é feita pelo ProposalBackgroundService a cada 30 segundos

    // Construir condições de filtro
    const conditions = [];

    if (userType === 'student') {
      // Alunos veem apenas suas próprias propostas
      conditions.push(eq(proposals.studentId, userId));
    } else if (userType === 'personal') {
      // Personal trainers veem propostas pendentes (para aceitar)
      conditions.push(eq(proposals.status, ProposalStatus.PENDING));
      // Recontratações diretas só aparecem para o personal alvo
      conditions.push(
        or(
          and(
            eq(proposals.targetPersonalId, userId),
            inArray(proposals.paymentStatus, [
              'authorized',
              'approved',
              'captured',
            ]),
          ),
          sql`${proposals.targetPersonalId} IS NULL`,
        ),
      );
    }

    if (status) {
      conditions.push(eq(proposals.status, status));
    }

    if (modality) {
      conditions.push(ilike(proposals.modalityName, `%${modality}%`));
    }

    if (dateFrom) {
      conditions.push(gte(proposals.trainingDate, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(proposals.trainingDate, new Date(dateTo)));
    }

    // Buscar propostas com join na tabela de usuários

    const [proposalsList, totalResult] = await Promise.all([
      this.db
        .select({
          // Campos da proposta
          id: proposals.id,
          studentId: proposals.studentId,
          locationId: proposals.locationId,
          locationName: proposals.locationName,
          locationAddress: proposals.locationAddress,
          trainingDate: proposals.trainingDate,
          trainingTime: proposals.trainingTime,
          durationMinutes: proposals.durationMinutes,
          modalityName: proposals.modalityName,
          price: proposals.price,
          additionalNotes: proposals.additionalNotes,
          status: proposals.status,
          paymentStatus: proposals.paymentStatus,
          targetPersonalId: proposals.targetPersonalId,
          createdAt: proposals.createdAt,
          updatedAt: proposals.updatedAt,
          // Campos do estudante
          studentFirstName: users.firstName,
          studentLastName: users.lastName,
          studentEmail: users.email,
          studentProfileImageId: users.profileImageId,
        })
        .from(proposals)
        .leftJoin(users, eq(proposals.studentId, users.id))
        .where(and(...conditions))
        .orderBy(desc(proposals.createdAt))
        .limit(limit)
        .offset(offset),

      this.db
        .select({ count: count() })
        .from(proposals)
        .where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      proposals: await Promise.all(
        proposalsList.map((proposal) => this.mapToResponseDto(proposal)),
      ),
      total,
      page,
      limit,
    };
  }

  async getProposalById(
    id: string,
    userId: string,
    userType: string,
  ): Promise<ProposalResponseDto> {
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (userType === 'student' && proposal.studentId !== userId) {
      throw new ForbiddenException(
        'Você só pode visualizar suas próprias propostas',
      );
    }

    // ===== FALLBACK: consulta ao MP quando webhook não atualizou o status =====
    // Se o pagamento ainda está pendente e o paymentId é um ID numérico do MP
    // (pagamento PIX real), consulta o MP diretamente para obter o status atual.
    // Isso garante que o polling no app detecte o pagamento mesmo quando o
    // webhook falha (ex: MP_WEBHOOK_SECRET incorreto ou URL não configurada).
    const isRealMpId = /^\d+$/.test(proposal.paymentId ?? '');
    const needsLiveCheck =
      isRealMpId &&
      (!proposal.paymentStatus || proposal.paymentStatus === 'pending');

    if (needsLiveCheck) {
      try {
        const mpPayment = await this.paymentsService.getMpPayment(
          proposal.paymentId,
        );
        if (mpPayment?.status && mpPayment.status !== 'pending') {
          const mappedStatus = this.paymentsService.mapMpPaymentStatus(
            mpPayment.status,
          );
          await this.db
            .update(proposals)
            .set({ paymentStatus: mappedStatus, updatedAt: new Date() })
            .where(eq(proposals.id, id));
          proposal.paymentStatus = mappedStatus;
        }
      } catch {
        // Ignora erros de rede — retorna o status que está no banco
      }
    }

    // Buscar dados do usuário para incluir na resposta
    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, proposal.studentId))
      .limit(1);

    return await this.mapToResponseDto(proposal, student);
  }

  async updateProposal(
    id: string,
    updateProposalDto: UpdateProposalDto,
    userId: string,
    userType: string,
  ): Promise<ProposalResponseDto> {
    // Buscar a proposta
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (userType === 'student' && proposal.studentId !== userId) {
      throw new ForbiddenException(
        'Você só pode editar suas próprias propostas',
      );
    }

    // Verificar se a proposta pode ser editada
    if (proposal.status === ProposalStatus.COMPLETED) {
      throw new BadRequestException(
        'Propostas concluídas não podem ser editadas',
      );
    }

    // Atualizar a proposta
    const [updatedProposal] = await this.db
      .update(proposals)
      .set({
        ...updateProposalDto,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();

    // Buscar dados do usuário para incluir na resposta
    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, updatedProposal.studentId))
      .limit(1);

    return await this.mapToResponseDto(updatedProposal, student);
  }

  async cancelProposal(
    id: string,
    userId: string,
    userType: string,
  ): Promise<ProposalResponseDto> {
    // Buscar a proposta
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (userType === 'student' && proposal.studentId !== userId) {
      throw new ForbiddenException(
        'Você só pode cancelar suas próprias propostas',
      );
    }

    // Verificar se a proposta pode ser cancelada
    if (proposal.status === ProposalStatus.COMPLETED) {
      throw new BadRequestException(
        'Propostas concluídas não podem ser canceladas',
      );
    }

    if (proposal.status === ProposalStatus.CANCELLED) {
      throw new BadRequestException('Proposta já foi cancelada');
    }

    // Impedir cancelamento se a aula vinculada estiver em andamento (ACTIVE),
    // pois o serviço já está sendo prestado.
    if (proposal.classId) {
      const [linkedClass] = await this.db
        .select({ status: classes.status })
        .from(classes)
        .where(eq(classes.id, proposal.classId))
        .limit(1);

      if (linkedClass?.status === 'active') {
        throw new BadRequestException(
          'Não é possível cancelar uma proposta com aula em andamento.',
        );
      }
    }

    if (proposal.paymentId && proposal.paymentStatus !== 'refunded') {
      const cancellationReason =
        userType === 'student'
          ? 'Proposta cancelada pelo aluno'
          : 'Proposta cancelada manualmente';

      await this.processAutomaticRefund(
        proposal.id,
        proposal.paymentId,
        cancellationReason,
      );
    }

    await this.jobsService.cancelProposalExpirationJob(id);

    // Cancelar a proposta (e a aula vinculada atomicamente, se existir)
    const [cancelledProposal] = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(proposals)
        .set({
          status: ProposalStatus.CANCELLED,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, id))
        .returning();

      // Se a proposta tinha uma aula criada (MATCHED), cancelar também a aula
      // para evitar que o personal trainer fique com uma "aula zumbi" na agenda.
      if (updated.classId) {
        await tx
          .update(classes)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(
            and(
              eq(classes.id, updated.classId),
              // Só cancelar se a aula ainda estiver scheduled (não iniciada)
              eq(classes.status, 'scheduled'),
            ),
          );
      }

      return [updated];
    });

    // ===== EMITIR EVENTOS WEBSOCKET =====
    try {
      // Buscar informações do usuário para enviar no evento
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Evento de proposta cancelada
      this.chatGateway.server.emit('proposal_update', {
        action: 'proposal_cancelled',
        proposal: await this.mapToResponseDto(cancelledProposal),
        user: {
          id: user?.id,
          name: user?.name,
          userType: user?.userType,
        },
        userId: userId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(
        '❌ [PROPOSALS] Erro ao emitir eventos WebSocket para cancelamento:',
        error,
      );
      // Não falhar a operação por causa de problemas de WebSocket
    }

    // Buscar dados do usuário para incluir na resposta
    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, cancelledProposal.studentId))
      .limit(1);

    return await this.mapToResponseDto(cancelledProposal, student);
  }

  async acceptProposal(
    id: string,
    personalId: string,
    nonce?: string,
  ): Promise<ProposalResponseDto> {
    // ✅ Usar transação com lock para garantir idempotência
    const result = await this.db.transaction(async (tx) => {
      // ✅ Buscar proposta dentro da transação (lock automático pela transação)
      const [proposal] = await tx
        .select()
        .from(proposals)
        .where(eq(proposals.id, id))
        .limit(1);

      if (!proposal) {
        throw new NotFoundException('Proposta não encontrada');
      }

      // Verificar se a proposta está pendente
      if (proposal.status !== ProposalStatus.PENDING) {
        throw new ConflictException(
          'Proposta já foi aceita ou cancelada por outro personal trainer',
        );
      }

      if (
        proposal.targetPersonalId &&
        proposal.targetPersonalId !== personalId
      ) {
        throw new ForbiddenException(
          'Esta proposta é direcionada a outro personal trainer',
        );
      }

      // Propostas com valor > 0 só podem ser aceitas após confirmação de pagamento.
      const proposalPrice = parseFloat(proposal.price ?? '0');
      if (
        proposalPrice > 0 &&
        !this.isPaymentConfirmedStatus(proposal.paymentStatus)
      ) {
        throw new BadRequestException(
          'O pagamento desta proposta ainda não foi confirmado.',
        );
      }

      // ✅ Validar nonce se fornecido
      if (nonce) {
        // Verificar se nonce já foi usado
        const [usedNonce] = await tx
          .select()
          .from(usedNonces)
          .where(eq(usedNonces.nonce, nonce))
          .limit(1);

        if (usedNonce) {
          throw new ConflictException(
            'Esta notificação já foi processada. A proposta pode ter sido aceita por outro personal trainer.',
          );
        }

        // Validar assinatura do nonce
        if (!this.nonceService.validateNonce(nonce, id, personalId, 300)) {
          throw new BadRequestException(
            'Nonce inválido ou expirado. Por favor, recarregue a notificação.',
          );
        }

        // Registrar nonce como usado
        await tx.insert(usedNonces).values({
          nonce,
          proposalId: id,
          personalId,
        });
      }

      // ===== VALIDAR CONFLITOS DE HORÁRIO =====
      try {
        // Montar intervalo do dia da proposta
        const proposedTrainingDate = new Date(proposal.trainingDate);
        const startOfDay = new Date(proposedTrainingDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(proposedTrainingDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 1. VALIDAR CONFLITOS DO PERSONAL TRAINER
        // Buscar aulas do personal no mesmo dia com status relevantes
        const existingClasses = await tx
          .select()
          .from(classes)
          .where(
            and(
              eq(classes.personalId, personalId),
              gte(classes.date, startOfDay),
              lte(classes.date, endOfDay),
              or(
                eq(classes.status, 'scheduled'),
                eq(classes.status, 'pending_confirmation'),
                eq(classes.status, 'active'),
              ),
            ),
          );

        console.log(
          `  - Aulas do personal encontradas: ${existingClasses.length}`,
        );

        // 2. VALIDAR CONFLITOS DO ALUNO
        // Buscar propostas existentes do aluno para o mesmo dia
        let existingProposals = await tx
          .select()
          .from(proposals)
          .where(
            and(
              eq(proposals.studentId, proposal.studentId),
              gte(proposals.trainingDate, startOfDay),
              lte(proposals.trainingDate, endOfDay),
              or(
                eq(proposals.status, 'pending'),
                eq(proposals.status, 'matched'),
              ),
              // Excluir a proposta atual
              sql`${proposals.id} != ${id}`,
            ),
          );

        console.log(
          `  - Propostas do aluno encontradas: ${existingProposals.length}`,
        );

        // Ignorar propostas matched cujas aulas estão em disputa de no-show
        const disputedClasses = await tx.query.classes.findMany({
          where: and(
            sql`DATE(${classes.date}) = ${proposedTrainingDate.toISOString().split('T')[0]}`,
            eq(classes.studentId, proposal.studentId as any),
            eq(classes.status, 'no_show_dispute'),
          ),
          columns: { proposalId: true },
        });
        const disputedProposalIds = new Set(
          disputedClasses.map((c) => c.proposalId).filter(Boolean),
        );
        if (disputedProposalIds.size > 0) {
          const beforeFilter = existingProposals.length;
          existingProposals = existingProposals.filter(
            (p) => !disputedProposalIds.has(p.id),
          );
          console.log(
            `  - Propostas filtradas (aulas em disputa): ${beforeFilter} → ${existingProposals.length}`,
          );
        }

        // Calcular janela de tempo da proposta aceita
        // Combinar data com horário (formato HH:MM)
        const proposedStart = buildTrainingStartDate(
          proposal.trainingDate,
          proposal.trainingTime,
        );
        const proposedEnd = new Date(
          proposedStart.getTime() +
            (proposal.durationMinutes || 60) * 60 * 1000,
        );

        console.log(
          `  - Proposta: ${proposal.trainingTime} (${proposedStart.toISOString()}) até ${proposedEnd.toISOString()}`,
        );
        console.log(`  - Duração: ${proposal.durationMinutes || 60} minutos`);

        // Verificar conflitos com aulas do personal
        const hasClassConflict = existingClasses.some((cls: any) => {
          // Combinar data da aula com horário
          const classStart = buildTrainingStartDate(cls.date, cls.time);
          const classEnd = new Date(
            classStart.getTime() + (cls.duration || 60) * 60 * 1000,
          );

          console.log(
            `    - Aula existente: ${cls.time} (${classStart.toISOString()}) até ${classEnd.toISOString()}, status: ${cls.status}`,
          );

          // Verificar se a aula já deveria ter terminado (no-show ou esquecimento)
          const now = new Date();
          const isClassExpired = classEnd < now;

          if (isClassExpired) {
            console.log(`      ✓ Aula expirada, ignorando`);
            return false; // Não há conflito com aulas expiradas
          }

          // Verificar sobreposição
          const overlaps = !(
            proposedEnd <= classStart || proposedStart >= classEnd
          );
          console.log(
            `      ${overlaps ? '❌ CONFLITO!' : '✓ Sem conflito'} (proposta: ${proposedStart.toISOString()} - ${proposedEnd.toISOString()}, aula: ${classStart.toISOString()} - ${classEnd.toISOString()})`,
          );
          return overlaps;
        });

        // Verificar conflitos com propostas do aluno
        const hasProposalConflict = existingProposals.some((prop: any) => {
          const propStart = buildTrainingStartDate(
            prop.trainingDate,
            prop.trainingTime,
          );
          const propEnd = new Date(
            propStart.getTime() + (prop.durationMinutes || 60) * 60 * 1000,
          );

          console.log(
            `    - Proposta existente: ${prop.trainingTime} (${propStart.toISOString()}) até ${propEnd.toISOString()}, status: ${prop.status}`,
          );

          // Verificar sobreposição
          const overlaps = !(
            proposedEnd <= propStart || proposedStart >= propEnd
          );
          console.log(`      ${overlaps ? '❌ CONFLITO!' : '✓ Sem conflito'}`);
          return overlaps;
        });

        console.log(`  - Conflito com aulas do personal: ${hasClassConflict}`);
        console.log(
          `  - Conflito com propostas do aluno: ${hasProposalConflict}`,
        );

        if (hasClassConflict) {
          throw new BadRequestException(
            'Conflito de horário: o personal trainer já possui uma aula agendada nesse período.',
          );
        }

        if (hasProposalConflict) {
          throw new BadRequestException(
            'Conflito de horário: o aluno já possui uma proposta ou aula agendada nesse período.',
          );
        }
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Em caso de erro inesperado na verificação, não bloquear o fluxo com mensagem genérica
        console.error(
          '❌ [PROPOSALS] Erro ao validar conflito de horário:',
          error,
        );
        throw new BadRequestException(
          'Não foi possível validar conflitos de horário no momento. Tente novamente.',
        );
      }

      // Aceitar a proposta (mudar status para matched)
      const [acceptedProposal] = await tx
        .update(proposals)
        .set({
          status: ProposalStatus.MATCHED,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, id))
        .returning();

      // ===== PAGAMENTO SERÁ CAPTURADO APÓS CRIAÇÃO DA AULA =====
      console.log(
        '💰 [PROPOSALS] Pagamento será capturado após criação da aula...',
      );

      // ===== CRIAR AULA AUTOMATICAMENTE =====

      // Verificar se já existe uma aula para esta proposta
      const existingClass = await tx
        .select()
        .from(classes)
        .where(eq(classes.proposalId, id))
        .limit(1);

      if (existingClass.length > 0) {
        // Buscar dados do usuário para incluir na resposta
        const [student] = await tx
          .select()
          .from(users)
          .where(eq(users.id, acceptedProposal.studentId))
          .limit(1);
        return await this.mapToResponseDto(acceptedProposal, student);
      }

      let newClass;
      try {
        [newClass] = await tx
          .insert(classes)
          .values({
            studentId: proposal.studentId,
            personalId: personalId,
            proposalId: id, // Vincular à proposta
            location: proposal.locationName,
            address: proposal.locationAddress,
            date: proposal.trainingDate,
            time: proposal.trainingTime,
            duration: proposal.durationMinutes,
            modality: proposal.modalityName,
            price: proposal.price,
            status: 'scheduled',
            notes: proposal.additionalNotes,
          })
          .returning();

        // Atualizar proposta para incluir o ID da aula criada
        await tx
          .update(proposals)
          .set({
            classId: newClass.id, // Adicionar referência à aula
            updatedAt: new Date(),
          })
          .where(eq(proposals.id, id));

        // ===== CAPTURAR PAGAMENTO APÓS CRIAÇÃO DA AULA =====
        try {
          console.log(
            '💰 [PROPOSALS] Capturando pagamento após criação da aula...',
          );
          console.log(
            '🔍 [PROPOSALS] Buscando pagamento para proposta ID:',
            id,
          );

          // Buscar pagamento da proposta
          const payment = await tx.query.payments.findFirst({
            where: eq(payments.proposalId, id), // Busca direta por ID da proposta
          });

          console.log('💰 [PROPOSALS] Pagamento encontrado:', {
            paymentId: payment?.id,
            proposalId: payment?.proposalId,
            classId: payment?.classId,
            status: payment?.status,
            totalAmount: payment?.totalAmount,
            personalAmount: payment?.personalAmount,
          });

          if (payment) {
            // Atualizar pagamento com classId e personalId
            await tx
              .update(payments)
              .set({
                classId: newClass.id,
                personalId: personalId, // Definir personalId quando aceitar
                updatedAt: new Date(),
              })
              .where(eq(payments.id, payment.id));

            if (payment.status === 'authorized') {
              // Não capturar pagamento aqui: captura/repasse só após conclusão da aula
              console.log(
                'ℹ️ [PROPOSALS] Pagamento em custódia mantido. Captura ocorrerá na conclusão da aula.',
              );
            } else {
              console.log(
                `ℹ️ [PROPOSALS] Pagamento vinculado à aula com status "${payment.status}". Captura/reasse seguirá regra na conclusão.`,
              );
            }
          } else {
            console.log(
              '⚠️ [PROPOSALS] Pagamento não encontrado para proposta:',
              payment?.status,
            );
          }
        } catch (error) {
          console.error(
            '❌ [PROPOSALS] Erro ao capturar pagamento após criação da aula:',
            error,
          );
          // Não falhar a operação se a captura de pagamento falhar
          // Mas logar o erro para investigação
        }

        // Buscar dados do usuário para incluir na resposta (dentro da transação)
        const [student] = await tx
          .select()
          .from(users)
          .where(eq(users.id, acceptedProposal.studentId))
          .limit(1);

        // Retornar resultado da transação
        return await this.mapToResponseDto(acceptedProposal, student);
      } catch (error) {
        console.error('❌ [PROPOSALS] Erro ao criar aula:', error);
        // Se falhar, reverter status da proposta dentro da transação
        await tx
          .update(proposals)
          .set({
            status: ProposalStatus.PENDING,
            updatedAt: new Date(),
          })
          .where(eq(proposals.id, id));

        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Erro desconhecido ao criar aula';
        throw new BadRequestException(`Erro ao criar aula: ${errorMessage}`);
      }
    });

    // ===== EMITIR EVENTOS WEBSOCKET (fora da transação) =====
    // Buscar novamente os dados para eventos WebSocket após transação
    try {
      const [proposalForEvents] = await this.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, id))
        .limit(1);

      if (!proposalForEvents) {
        return;
      }

      // Buscar informações do aluno para enviar no evento
      const [studentForEvents] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, proposalForEvents.studentId))
        .limit(1);

      // Buscar informações do personal para enviar no evento
      const [personal] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, personalId))
        .limit(1);

      // ✅ RESOLVER URL DA FOTO DO PERSONAL
      let personalProfileImageUrl = personal?.profileImageUrl || null;
      if (personal?.profileImageId) {
        try {
          const file = await this.db.query.files.findFirst({
            where: eq(files.id, personal.profileImageId),
          });

          if (file?.url) {
            const baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';
            try {
              const original = new URL(file.url);
              const normalizedBase = new URL(baseUrl);
              personalProfileImageUrl = `${normalizedBase.origin}${original.pathname}`;
            } catch (e) {
              personalProfileImageUrl = file.url.replace(
                'https://api.treinopro.com',
                baseUrl,
              );
            }
          }
        } catch (e) {
          console.error('⚠️ Falha ao buscar URL da imagem do personal:', e);
        }
      }

      // Calcular rating médio do personal
      let personalRating = 0.0;
      if (personal) {
        const personalRatings = await this.db
          .select({ rating: ratings.rating })
          .from(ratings)
          .where(
            and(
              eq(ratings.ratedId, personalId),
              eq(ratings.type, 'student_to_personal'),
            ),
          );

        if (personalRatings.length > 0) {
          const totalRating = personalRatings.reduce(
            (sum, r) => sum + r.rating,
            0,
          );
          personalRating = totalRating / personalRatings.length;
        }
      }

      // Evento para o aluno (proposta foi aceita)
      if (studentForEvents) {
        this.chatGateway.server.emit('proposal_update', {
          action: 'proposal_accepted',
          proposal: await this.mapToResponseDto(
            proposalForEvents,
            studentForEvents,
          ),
          personal: {
            id: personal?.id,
            name:
              personal?.name ||
              `${personal?.firstName || ''} ${personal?.lastName || ''}`.trim(),
            firstName: personal?.firstName,
            lastName: personal?.lastName,
            profileImageUrl: personalProfileImageUrl,
            rating: personalRating,
          },
          userId: studentForEvents.id,
          timestamp: new Date(),
        });
      }

      // Enviar notificação push para o aluno (proposta aceita)
      if (studentForEvents && personal) {
        try {
          await this.proposalsGateway.sendProposalAccepted({
            proposal: await this.mapToResponseDto(
              proposalForEvents,
              studentForEvents,
            ),
            personal: {
              id: personal.id,
              name:
                personal.name ||
                `${personal.firstName || ''} ${personal.lastName || ''}`.trim(),
              firstName: personal.firstName,
              lastName: personal.lastName,
              photo: personalProfileImageUrl,
              profileImageUrl: personalProfileImageUrl,
            },
            studentId: studentForEvents.id,
          });
          console.log(
            '✅ [PROPOSALS] Notificação push enviada para aluno quando proposta foi aceita',
          );
        } catch (error) {
          console.error(
            '❌ [PROPOSALS] Erro ao enviar notificação push:',
            error,
          );
          // Não falhar a operação por causa de problemas de notificação
        }
      }

      // Buscar aula criada para eventos
      const [newClass] = await this.db
        .select()
        .from(classes)
        .where(eq(classes.proposalId, id))
        .limit(1);

      // Evento de match confirmado para ambos
      const matchData = {
        action: 'match_confirmed',
        proposal: await this.mapToResponseDto(
          proposalForEvents,
          studentForEvents,
        ),
        student: {
          id: studentForEvents?.id,
          name: studentForEvents?.name,
          profileImageUrl: studentForEvents?.profileImageUrl,
        },
        personal: {
          id: personal?.id,
          name:
            personal?.name ||
            `${personal?.firstName || ''} ${personal?.lastName || ''}`.trim(),
          firstName: personal?.firstName,
          lastName: personal?.lastName,
          profileImageUrl: personalProfileImageUrl,
          rating: personalRating,
        },
        timestamp: new Date(),
      };

      this.chatGateway.server.emit('match_confirmed', matchData);

      // Evento de aula criada para ambos os usuários
      if (newClass) {
        const classData = {
          action: 'class_created',
          class: {
            id: newClass.id,
            proposalId: id,
            studentId: proposalForEvents.studentId,
            personalId: personalId,
            location: proposalForEvents.locationName,
            date: proposalForEvents.trainingDate,
            time: proposalForEvents.trainingTime,
            duration: proposalForEvents.durationMinutes,
            status: 'scheduled',
            // Garantir que a modalidade esteja presente no payload em tempo real
            proposalModality: proposalForEvents.modalityName,
            student: {
              id: studentForEvents?.id,
              firstName: studentForEvents?.firstName,
              lastName: studentForEvents?.lastName,
              profileImageUrl: studentForEvents?.profileImageUrl,
            },
            personal: {
              id: personal?.id,
              firstName: personal?.firstName,
              lastName: personal?.lastName,
              profileImageUrl: personal?.profileImageUrl,
            },
          },
          personalId: personalId,
          studentId: proposalForEvents.studentId,
          timestamp: new Date(),
        };

        console.log(
          '📡 [PROPOSALS] Emitindo evento class_update:',
          JSON.stringify(classData, null, 2),
        );
        this.chatGateway.server.emit('class_update', classData);
        console.log('✅ [PROPOSALS] Evento WebSocket emitido: class_created');
      }

      console.log(
        '🔌 [PROPOSALS] ChatGateway server disponível:',
        !!this.chatGateway.server,
      );

      // Verificar se sockets está disponível antes de acessar
      if (this.chatGateway.server?.sockets?.sockets) {
        console.log(
          '👥 [PROPOSALS] Clientes conectados:',
          this.chatGateway.server.sockets.sockets.size,
        );
      } else {
        console.log('👥 [PROPOSALS] Sockets não disponível para contagem');
      }
    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao emitir eventos WebSocket:', error);
      // Não falhar a operação por causa de problemas de WebSocket
    }

    return result;
  }

  // ===== MÉTODOS PARA WEBHOOK DE PAGAMENTO =====

  async updatePaymentStatus(
    proposalId: string,
    paymentStatus: string,
  ): Promise<void> {
    // Validar parâmetros obrigatórios
    if (!proposalId || !paymentStatus) {
      throw new Error('proposalId e paymentStatus são obrigatórios');
    }

    try {
      const [currentProposal] = await this.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposalId))
        .limit(1);

      if (!currentProposal) {
        throw new NotFoundException('Proposta não encontrada');
      }

      const wasConfirmed = this.isPaymentConfirmedStatus(
        currentProposal.paymentStatus,
      );

      await this.db
        .update(proposals)
        .set({
          paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      // Recontratação: quando pagamento for confirmado, liberar envio ao personal alvo.
      if (
        currentProposal.targetPersonalId &&
        !wasConfirmed &&
        this.isPaymentConfirmedStatus(paymentStatus)
      ) {
        const [student] = await this.db
          .select()
          .from(users)
          .where(eq(users.id, currentProposal.studentId))
          .limit(1);

        const proposalResponse = await this.mapToResponseDto(
          {
            ...currentProposal,
            paymentStatus,
          },
          student,
        );

        await this.proposalsGateway.sendProposalCreated({
          proposal: proposalResponse,
          student: {
            id: student?.id,
            name: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
            firstName: student?.firstName,
            lastName: student?.lastName,
            profileImageUrl: student?.profileImageUrl,
          },
          nearbyPersonals: [currentProposal.targetPersonalId],
        });

        console.log(
          `📡 [PROPOSALS] Recontratação ${proposalId} liberada para personal ${currentProposal.targetPersonalId} após confirmação de pagamento (${paymentStatus})`,
        );
      }

      // Proposta Geral: quando pagamento for confirmado, notificar personals próximos.
      if (
        !currentProposal.targetPersonalId &&
        !wasConfirmed &&
        this.isPaymentConfirmedStatus(paymentStatus)
      ) {
        const [student] = await this.db
          .select()
          .from(users)
          .where(eq(users.id, currentProposal.studentId))
          .limit(1);

        const proposalResponse = await this.mapToResponseDto(
          {
            ...currentProposal,
            paymentStatus,
          },
          student,
        );

        // Notificar personals próximos (FCM e WebSocket broadcast)
        await this.notifyNearbyPersonals(proposalResponse, student);

        console.log(
          `📡 [PROPOSALS] Proposta ${proposalId} liberada para personals próximos após confirmação de pagamento (${paymentStatus})`,
        );
      }

      // Se pagamento falhou, cancelar proposta e aula vinculada atomicamente
      if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
        await this.db.transaction(async (tx) => {
          const [cancelledProposal] = await tx
            .update(proposals)
            .set({
              status: ProposalStatus.CANCELLED,
              updatedAt: new Date(),
            })
            .where(eq(proposals.id, proposalId))
            .returning();

          // Cancelar aula vinculada para evitar "aula zumbi" na agenda do personal
          if (cancelledProposal?.classId) {
            await tx
              .update(classes)
              .set({ status: 'cancelled', updatedAt: new Date() })
              .where(
                and(
                  eq(classes.id, cancelledProposal.classId),
                  eq(classes.status, 'scheduled'),
                ),
              );
          }
        });
      }
    } catch (error) {
      console.error(
        '❌ [PROPOSALS] Erro ao atualizar status do pagamento:',
        error,
      );
      throw error;
    }
  }

  async findProposalByPaymentId(paymentId: string): Promise<any> {
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.paymentId, paymentId))
      .limit(1);

    return proposal;
  }

  // ===== TIMEOUT PARA PROPOSTAS NÃO PAGAS =====

  async cancelExpiredProposals(): Promise<{ cancelled: number }> {
    // Propostas pendentes há mais de 30 minutos com pagamento pendente
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    try {
      const expiredProposals = await this.db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.status, ProposalStatus.PENDING),
            eq(proposals.paymentStatus, 'pending'),
            lte(proposals.createdAt, thirtyMinutesAgo),
          ),
        );

      if (expiredProposals.length === 0) {
        return { cancelled: 0 };
      }

      const ids = expiredProposals.map((p) => p.id);

      // 1. Cancelar todas as propostas expiradas no banco (status e paymentStatus)
      await this.db
        .update(proposals)
        .set({
          status: ProposalStatus.CANCELLED,
          paymentStatus: 'expired',
          updatedAt: new Date(),
        })
        .where(inArray(proposals.id, ids));

      // 2. Tentar reembolso para as que já possuem pagamento registrado
      for (const proposal of expiredProposals) {
        if (proposal.paymentId && proposal.paymentStatus !== 'refunded') {
          try {
            await this.processAutomaticRefund(
              proposal.id,
              proposal.paymentId,
              'Proposta expirada - timeout de 30 minutos',
            );
          } catch (error) {
            console.error(
              `❌ [PROPOSALS] Erro no reembolso da proposta ${proposal.id}:`,
              error,
            );

            // Marcar como erro para análise manual (status já é CANCELLED)
            await this.db
              .update(proposals)
              .set({
                paymentStatus: 'refund_error',
                updatedAt: new Date(),
              })
              .where(eq(proposals.id, proposal.id));
          }
        }
      }

      return { cancelled: expiredProposals.length };
    } catch (error) {
      console.error(
        '❌ [PROPOSALS] Erro ao cancelar propostas expiradas:',
        error,
      );
      throw error;
    }
  }

  // ===== AGENDAMENTO DE LEMBRETES DE PAGAMENTO =====

  private async schedulePaymentReminders(proposalId: string): Promise<void> {
    try {
      // Lembrete aos 10 minutos (20 min restantes)
      await this.jobsService.scheduleNotification(
        {
          userId: null, // Será preenchido no processor
          type: 'push',
          template: 'payment-reminder',
          data: { proposalId, reminderType: 'first' },
          priority: 'high',
        },
        10,
      );

      // Lembrete final aos 25 minutos (5 min restantes)
      await this.jobsService.scheduleNotification(
        {
          userId: null, // Será preenchido no processor
          type: 'push',
          template: 'payment-reminder',
          data: { proposalId, reminderType: 'final' },
          priority: 'critical',
        },
        25,
      );
    } catch (error) {
      console.error(
        `❌ [PROPOSALS] Erro ao agendar lembretes para proposta ${proposalId}:`,
        error,
      );
    }
  }

  // ===== SISTEMA DE REEMBOLSO AUTOMÁTICO =====

  async processAutomaticRefund(
    proposalId: string,
    paymentId: string,
    reason: string,
  ): Promise<void> {
    try {
      const isSimulated =
        paymentId.startsWith('sim_pix_') || paymentId.startsWith('sim_');

      if (isSimulated) {
        // Pagamento mockado — não há nada a reembolsar no MP
        console.log(
          `🧪 [PROPOSALS] Pagamento simulado ${paymentId} — nenhuma chamada ao MP necessária`,
        );
      } else {
        try {
          const resolvedPayment = await this.resolveAutomaticRefundPayment(
            proposalId,
            paymentId,
          );

          if (resolvedPayment.localPayment && !resolvedPayment.mpPaymentId) {
            console.log(
              `💾 [PROPOSALS] Pagamento ${paymentId} resolvido apenas localmente (${resolvedPayment.source}) — aplicando reembolso interno`,
            );
            await this.paymentsService.refundPayment(
              resolvedPayment.localPayment.id,
              reason,
            );
          } else if (resolvedPayment.mpPaymentId) {
            const mpPayment = await this.paymentsService.getMpPayment(
              resolvedPayment.mpPaymentId,
            );
            const mpStatus = String(
              mpPayment?.status ?? 'unknown',
            ).toLowerCase();

            if (
              mpStatus === 'pending' ||
              mpStatus === 'in_process' ||
              mpStatus === 'authorized'
            ) {
              console.log(
                `🛑 [PROPOSALS] Cancelando pagamento MP ${resolvedPayment.mpPaymentId} (origem=${resolvedPayment.source}, status=${mpStatus})`,
              );
              await this.paymentsService.cancelMpPayment(
                resolvedPayment.mpPaymentId,
              );
              console.log(
                `✅ [PROPOSALS] Pagamento MP ${resolvedPayment.mpPaymentId} cancelado com sucesso`,
              );
            } else if (mpStatus === 'approved' || mpStatus === 'captured') {
              console.log(
                `💰 [PROPOSALS] Solicitando reembolso ao MP para ${resolvedPayment.mpPaymentId} (origem=${resolvedPayment.source}, status=${mpStatus})`,
              );
              await this.paymentsService.createRefundByMpId(
                resolvedPayment.mpPaymentId,
                reason,
              );
              console.log(
                `✅ [PROPOSALS] Reembolso criado no MP para pagamento: ${resolvedPayment.mpPaymentId}`,
              );
            } else if (
              mpStatus === 'cancelled' ||
              mpStatus === 'canceled' ||
              mpStatus === 'refunded'
            ) {
              console.log(
                `ℹ️ [PROPOSALS] Pagamento ${resolvedPayment.mpPaymentId} já está em estado terminal (${mpStatus})`,
              );
            } else {
              console.log(
                `⚠️ [PROPOSALS] Pagamento ${resolvedPayment.mpPaymentId} com status '${mpStatus}' — ação de reembolso/cancelamento não aplicável`,
              );
            }
          } else {
            throw new BadRequestException(
              `Nao foi possivel resolver o pagamento da proposta ${proposalId} para reembolso automatico`,
            );
          }
        } catch (refundError) {
          console.error(
            `❌ [PROPOSALS] Falha ao processar reembolso para ${paymentId}:`,
            refundError,
          );
          throw refundError;
        }
      }

      // Atualizar status da proposta
      await this.db
        .update(proposals)
        .set({
          paymentStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));
    } catch (error) {
      console.error(`❌ [PROPOSALS] Erro no reembolso automático:`, error);
      throw error;
    }
  }

  private isMercadoPagoNumericId(value?: string | null): boolean {
    return /^\d+$/.test(String(value || '').trim());
  }

  private isUuid(value?: string | null): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim(),
    );
  }

  private async resolveAutomaticRefundPayment(
    proposalId: string,
    paymentId: string,
  ): Promise<{
    localPayment: any | null;
    mpPaymentId: string | null;
    source: string;
  }> {
    const normalizedPaymentId = String(paymentId || '').trim();
    const paymentLookupConditions: any[] = [
      eq(payments.proposalId, proposalId),
      eq(payments.mpPaymentId, normalizedPaymentId),
    ];

    if (this.isUuid(normalizedPaymentId)) {
      paymentLookupConditions.push(eq(payments.id, normalizedPaymentId));
    }

    const localPayment = await this.db.query.payments.findFirst({
      where: or(...paymentLookupConditions),
    });

    if (localPayment?.mpPaymentId) {
      return {
        localPayment,
        mpPaymentId: localPayment.mpPaymentId,
        source:
          localPayment.proposalId === proposalId
            ? 'payments.proposalId'
            : 'payments.mpPaymentId',
      };
    }

    if (localPayment) {
      return {
        localPayment,
        mpPaymentId: null,
        source: 'payments.id',
      };
    }

    if (this.isMercadoPagoNumericId(normalizedPaymentId)) {
      return {
        localPayment: null,
        mpPaymentId: normalizedPaymentId,
        source: 'proposal.paymentId',
      };
    }

    const externalReference = proposalId || normalizedPaymentId;

    try {
      const searchResult = await this.paymentsService.searchMpPayments({
        externalReference,
        limit: 1,
      });
      const matchedPayment = searchResult?.results?.[0];

      if (matchedPayment?.id) {
        return {
          localPayment: null,
          mpPaymentId: String(matchedPayment.id),
          source: 'mp.external_reference',
        };
      }
    } catch (searchError) {
      console.warn(
        `⚠️ [PROPOSALS] Busca no MP por external_reference falhou para ${externalReference}:`,
        searchError?.message || searchError,
      );
    }

    return {
      localPayment: null,
      mpPaymentId: null,
      source: 'unresolved',
    };
  }

  async findPaymentByExternalReference(
    externalReference: string,
  ): Promise<any> {
    // No fluxo de propostas, o external_reference do MP corresponde ao proposalId.
    try {
      const payment = await this.db.query.payments?.findFirst({
        where: eq(payments.proposalId, externalReference),
      });

      return payment;
    } catch (error) {
      console.error(
        `❌ [PROPOSALS] Erro ao buscar pagamento por external reference ${externalReference}:`,
        error,
      );
      return null;
    }
  }

  // Reembolsar proposta não aceita (chamado manualmente)
  async refundUnacceptedProposal(
    proposalId: string,
    userId: string,
  ): Promise<{ message: string }> {
    // Buscar proposta diretamente do banco para ter acesso aos campos de pagamento
    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);

    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }

    // Verificar permissões
    if (proposal.studentId !== userId) {
      throw new ForbiddenException(
        'Você só pode reembolsar suas próprias propostas',
      );
    }

    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException(
        'Apenas propostas pendentes podem ser reembolsadas',
      );
    }

    if (!proposal.paymentId) {
      throw new BadRequestException('Proposta não possui pagamento associado');
    }

    if (proposal.paymentStatus === 'refunded') {
      throw new BadRequestException('Proposta já foi reembolsada');
    }

    // Processar reembolso
    await this.processAutomaticRefund(
      proposalId,
      proposal.paymentId,
      'Reembolso solicitado pelo usuário',
    );

    // Cancelar proposta
    await this.db
      .update(proposals)
      .set({
        status: ProposalStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    return { message: 'Proposta cancelada e reembolso processado com sucesso' };
  }

  // ===== INTEGRAÇÃO REAL COM MERCADO PAGO PARA PROPOSTAS =====

  private async createProposalPaymentPreference(
    createProposalDto: CreateProposalDto,
    userData: any,
    trainingDate: Date,
    proposalId: string,
  ): Promise<any> {
    try {
      console.log(
        '💳 [PROPOSALS] ===== INÍCIO DO PROCESSAMENTO DE PAGAMENTO =====',
      );
      console.log('👤 [PROPOSALS] User ID:', userData.id);
      console.log('📋 [PROPOSALS] Dados da proposta:', {
        price: createProposalDto.price,
        paymentMethod: createProposalDto.paymentMethod,
        cardId: createProposalDto.cardId,
        installments: createProposalDto.installments,
        saveCard: createProposalDto.saveCard,
        cardNickname: createProposalDto.cardNickname,
      });

      console.log('🆔 [PROPOSALS] Proposal ID real:', proposalId);

      const resolvedPayerEmail =
        createProposalDto.payerEmail?.trim() || userData?.email?.trim();
      const fallbackDocumentNumber = String(
        userData?.documentNumber ?? '',
      ).replace(/\D/g, '');
      const resolvedPayerCpf =
        createProposalDto.payerCpf?.trim() ||
        (userData?.documentType === 'CPF' &&
        fallbackDocumentNumber.length === 11
          ? fallbackDocumentNumber
          : undefined);

      // Calcular taxa da plataforma
      const platformFeePercentage =
        parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10') / 100;
      const platformFee = createProposalDto.price * platformFeePercentage;
      const personalAmount = createProposalDto.price - platformFee;

      console.log('💰 [PROPOSALS] Cálculos financeiros:', {
        price: createProposalDto.price,
        platformFeePercentage: `${platformFeePercentage * 100}%`,
        platformFee,
        personalAmount,
      });

      // ===== VERIFICAR SE DEVE PROCESSAR PAGAMENTO AUTOMÁTICO =====
      const hasCardId = !!createProposalDto.cardId;
      const isCardPayment =
        createProposalDto.paymentMethod === 'credit_card' ||
        createProposalDto.paymentMethod === 'debit_card';

      console.log('🔍 [PROPOSALS] Verificações de pagamento automático:', {
        hasCardId,
        isCardPayment,
        shouldProcessAutomatic: hasCardId && isCardPayment,
        cardIdReceived: createProposalDto.cardId,
        paymentMethodReceived: createProposalDto.paymentMethod,
        cardDataReceived: createProposalDto.cardData,
      });

      if (hasCardId && isCardPayment) {
        console.log(
          '🚀 [PROPOSALS] Iniciando pagamento automático com cartão salvo...',
        );

        try {
          const paymentDto = {
            classId: proposalId, // Usar ID real da proposta
            paymentMethod:
              createProposalDto.paymentMethod as StudentPaymentMethod,
            cardId: createProposalDto.cardId,
            savedCardCvv: createProposalDto.savedCardCvv,
            cardData: null,
            installments: createProposalDto.installments || '1',
            saveCard: createProposalDto.saveCard || false,
            cardNickname: createProposalDto.cardNickname,
            payerEmail: resolvedPayerEmail, // ✅ Fallback para email do usuário autenticado
            payerCpf: resolvedPayerCpf, // ✅ Fallback para CPF do documento do usuário
          };

          console.log(
            '📤 [PROPOSALS] Dados enviados para processProposalPayment:',
            {
              ...paymentDto,
              savedCardCvv: paymentDto.savedCardCvv
                ? `*** (${paymentDto.savedCardCvv.trim().length} dígitos)`
                : undefined,
            },
          );

          // Dados da proposta para o pagamento
          const proposalData = {
            price: createProposalDto.price,
            personalId: 'temp-personal-id', // Será definido quando personal aceitar
            studentEmail: userData.email,
          };

          // Processar pagamento automático da proposta usando cartão salvo
          const paymentResult =
            await this.studentPaymentService.processProposalPayment(
              userData.id,
              paymentDto,
              proposalData,
            );

          console.log(
            '✅ [PROPOSALS] Resultado do pagamento automático:',
            paymentResult,
          );

          const response = {
            success: true,
            paymentId: String(
              paymentResult.mpPaymentId ||
                paymentResult.paymentId ||
                proposalId,
            ),
            status: paymentResult.status,
            method: createProposalDto.paymentMethod,
            amount: createProposalDto.price,
            platformFee,
            personalAmount,
            message:
              paymentResult.message || 'Pagamento processado com sucesso.',
          };

          console.log(
            '📤 [PROPOSALS] Resposta do pagamento automático:',
            response,
          );
          console.log('🏁 [PROPOSALS] ===== FIM DO PAGAMENTO AUTOMÁTICO =====');

          return response;
        } catch (paymentError) {
          console.error(
            '❌ [PROPOSALS] Erro no pagamento automático:',
            paymentError.message,
          );
          console.error('❌ [PROPOSALS] Stack trace:', paymentError.stack);
          console.log(
            '🚫 [PROPOSALS] Pagamento recusado - proposta não será criada',
          );
          // Se o pagamento falhar, NÃO criar a proposta
          throw new BadRequestException(
            `Pagamento recusado: ${paymentError.message}`,
          );
        }
      }

      // ===== PIX: CRIAR PAGAMENTO PIX VIA API MP =====
      if (createProposalDto.paymentMethod === 'pix') {
        console.log('🔵 [PROPOSALS] Iniciando pagamento PIX real...');

        // Proteção defensiva: PIX não deve carregar cardId
        if (createProposalDto.cardId) {
          console.warn('⚠️ [PROPOSALS] cardId ignorado pois paymentMethod=pix');
          createProposalDto.cardId = undefined;
        }

        if (!resolvedPayerEmail) {
          throw new BadRequestException(
            'payerEmail é obrigatório para pagamento via PIX',
          );
        }

        const apiUrl = process.env.API_URL;
        const isPublicUrl = !!apiUrl && !/localhost|127\.0\.0\.1/.test(apiUrl);
        const notificationUrl = isPublicUrl
          ? `${apiUrl}/webhooks/mercadopago`
          : undefined;

        // Split marketplace: busca OAuth token do personal se já conhecido.
        // Em recontratações, o personal alvo vem em (createProposalDto as any).personalId.
        let sellerAccessToken: string | undefined;
        const targetPersonalId: string | undefined = (createProposalDto as any)
          .personalId;
        if (targetPersonalId) {
          try {
            const personalProfile =
              await this.db.query.financialProfiles.findFirst({
                where: eq(financialProfiles.userId, targetPersonalId),
              });
            if (personalProfile?.mpAccessToken) {
              sellerAccessToken = personalProfile.mpAccessToken;
              console.log(
                `💳 [PROPOSALS] Split: OAuth token do personal encontrado para ${targetPersonalId}`,
              );
            } else {
              console.log(
                `⚠️ [PROPOSALS] Split: personal ${targetPersonalId} sem OAuth conectado — PIX vai para conta da plataforma`,
              );
            }
          } catch (err) {
            console.warn(
              `⚠️ [PROPOSALS] Não foi possível buscar OAuth token do personal: ${err.message}`,
            );
          }
        }

        const pixResult = await this.paymentsService.createPixPayment({
          amount: createProposalDto.price,
          description: `${createProposalDto.locationName} - ${trainingDate.toLocaleDateString('pt-BR')}`,
          externalReference: proposalId,
          payerEmail: resolvedPayerEmail,
          payerCpf: resolvedPayerCpf,
          notificationUrl,
          sellerAccessToken,
          marketplaceFee: platformFee,
        });

        console.log('✅ [PROPOSALS] Pagamento PIX criado:', {
          paymentId: pixResult.paymentId,
          status: pixResult.status,
          hasQrCode: !!pixResult.qrCode,
          hasQrCodeBase64: !!pixResult.qrCodeBase64,
        });

        // Registrar pagamento PIX na tabela payments para que os webhooks e a
        // lógica de captura pós-aula consigam localizar o registro por proposalId.
        // Se o INSERT falhar, propagar erro — sem registro interno não é seguro prosseguir.
        const pixPaymentStatus =
          pixResult.status === 'approved' ? 'authorized' : 'pending';
        await this.db.insert(payments).values({
          proposalId,
          studentId: userData.id,
          mpPaymentId: String(pixResult.paymentId),
          totalAmount: createProposalDto.price.toString(),
          platformFee: platformFee.toString(),
          personalAmount: personalAmount.toString(),
          status: pixPaymentStatus,
          type: 'class_payment',
        });
        console.log(
          `💾 [PROPOSALS] Registro PIX inserido na tabela payments (proposalId=${proposalId}, status=${pixPaymentStatus})`,
        );

        const pixResponse = {
          success: true,
          paymentId: pixResult.paymentId,
          status: pixResult.status,
          method: 'pix',
          amount: createProposalDto.price,
          qrCode: pixResult.qrCode,
          qrCodeBase64: pixResult.qrCodeBase64,
          checkoutUrl: pixResult.ticketUrl,
          platformFee,
          personalAmount,
          message:
            'Proposta criada com sucesso. PIX gerado; conclua o pagamento para confirmar.',
          expiresAt: pixResult.expiresAt
            ? new Date(pixResult.expiresAt)
            : new Date(Date.now() + 30 * 60 * 1000),
        };

        console.log('🏁 [PROPOSALS] ===== FIM DO PAGAMENTO PIX =====');
        return pixResponse;
      }

      // ===== FALLBACK: CRIAR PREFERÊNCIA MP (Mercado Pago checkout ou cartão sem ID) =====
      console.log('🔄 [PROPOSALS] Iniciando fallback para Mercado Pago...');
      console.log('🔄 [PROPOSALS] Motivo do fallback:', {
        hasCardId,
        isCardPayment,
        paymentMethod: createProposalDto.paymentMethod,
        cardId: createProposalDto.cardId,
        cardData: createProposalDto.cardData,
      });

      // Criar dados para o Mercado Pago
      const preferenceData = {
        classId: proposalId, // Usar ID real da proposta
        title: `${createProposalDto.locationName} - ${trainingDate.toLocaleDateString()}`,
        totalAmount: createProposalDto.price,
        platformFee,
        personalAmount,
        studentEmail: userData.email,
        personalEmail: 'temp@personal.com', // Será definido quando aceita
        externalReference: proposalId, // Usar ID real da proposta
      };

      console.log('📋 [PROPOSALS] Dados da preferência MP:', preferenceData);

      // Criar preferência no Mercado Pago
      const mpPreference =
        await this.paymentsService.createMpPreference(preferenceData);

      console.log('✅ [PROPOSALS] Preferência MP criada:', {
        id: mpPreference.id,
        initPoint: mpPreference.initPoint,
        sandboxInitPoint: mpPreference.sandboxInitPoint,
      });

      // Registrar pagamento de checkout na tabela payments (sem mpPaymentId ainda —
      // será vinculado pelo webhook handlePaymentCreated via external_reference).
      // Se o INSERT falhar, propagar erro — sem registro interno não é seguro prosseguir.
      await this.db.insert(payments).values({
        proposalId,
        studentId: userData.id,
        totalAmount: createProposalDto.price.toString(),
        platformFee: platformFee.toString(),
        personalAmount: personalAmount.toString(),
        status: 'pending',
        type: 'class_payment',
      });
      console.log(
        `💾 [PROPOSALS] Registro de checkout MP inserido em payments (proposalId=${proposalId})`,
      );

      const response = {
        success: true,
        paymentId: proposalId, // Usar ID real da proposta
        status: 'pending',
        method: createProposalDto.paymentMethod,
        amount: createProposalDto.price,
        preferenceId: mpPreference.id,
        checkoutUrl: mpPreference.initPoint,
        sandboxCheckoutUrl: mpPreference.sandboxInitPoint,
        platformFee,
        personalAmount,
        message: 'Preferência de pagamento criada com sucesso.',
      };

      console.log('📤 [PROPOSALS] Resposta do fallback MP:', response);
      console.log('🏁 [PROPOSALS] ===== FIM DO FALLBACK MP =====');

      return response;
    } catch (error) {
      console.error('❌ [PROPOSALS] Erro ao criar preferência MP:', error);
      console.error('❌ [PROPOSALS] Stack trace:', error.stack);
      console.log('🚫 [PROPOSALS] Pagamento falhou - proposta não será criada');

      // CORREÇÃO: Se o pagamento falhar, NÃO criar a proposta
      const friendlyMessage = this.extractErrorMessage(
        error,
        'Erro ao processar pagamento',
      );
      throw new BadRequestException(friendlyMessage);
    }
  }

  async getProposalStats(userId: string, userType: string): Promise<any> {
    const conditions =
      userType === 'student'
        ? [eq(proposals.studentId, userId)]
        : [eq(proposals.status, ProposalStatus.PENDING)];

    const [stats] = await this.db
      .select({
        total: count(),
        pending: sql<number>`count(case when ${proposals.status} = 'pending' then 1 end)`,
        matched: sql<number>`count(case when ${proposals.status} = 'matched' then 1 end)`,
        completed: sql<number>`count(case when ${proposals.status} = 'completed' then 1 end)`,
        cancelled: sql<number>`count(case when ${proposals.status} = 'cancelled' then 1 end)`,
      })
      .from(proposals)
      .where(and(...conditions));

    return stats;
  }

  // ===== VALIDAÇÃO DE CONFLITOS DE HORÁRIOS =====

  async getTimeConflicts(
    date: string,
    studentId: string,
  ): Promise<{
    existingProposals: any[];
    matchedClasses: any[];
    blockedTimeSlots: string[];
  }> {
    try {
      // Validar formato da data
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        throw new BadRequestException(
          'Formato de data inválido. Use YYYY-MM-DD',
        );
      }

      // Normalizar data para início do dia (considerando timezone)
      const targetDateObj = new Date(targetDate);
      const startOfDay = new Date(
        targetDateObj.getFullYear(),
        targetDateObj.getMonth(),
        targetDateObj.getDate(),
        0,
        0,
        0,
        0,
      );
      const endOfDay = new Date(
        targetDateObj.getFullYear(),
        targetDateObj.getMonth(),
        targetDateObj.getDate(),
        23,
        59,
        59,
        999,
      );
      // 1. Buscar propostas existentes do aluno para o mesmo dia
      // Usar comparação de string para data (YYYY-MM-DD)
      const dateString = targetDate.toISOString().split('T')[0]; // 2025-09-25

      let existingProposals = await this.db.query.proposals.findMany({
        where: and(
          eq(proposals.studentId, studentId),
          sql`DATE(${proposals.trainingDate}) = ${dateString}`,
          or(
            eq(proposals.status, 'pending'),
            eq(proposals.status, 'matched'),
            // Propostas 'disputed' não bloqueiam criação de novas propostas
          ),
        ),
        columns: {
          id: true,
          trainingTime: true,
          status: true,
          durationMinutes: true,
        },
      });

      // Filtrar explicitamente propostas canceladas, disputadas e completadas
      const beforeFilter = existingProposals.length;
      existingProposals = existingProposals.filter(
        (proposal) =>
          proposal.status !== 'cancelled' &&
          proposal.status !== 'disputed' &&
          proposal.status !== 'completed',
      );
      const afterFilter = existingProposals.length;

      // Ignorar propostas vinculadas a aulas em disputa (no_show_dispute)
      const disputedClasses = await this.db.query.classes.findMany({
        where: and(
          sql`DATE(${classes.date}) = ${dateString}`,
          eq(classes.studentId, studentId as any),
          eq(classes.status, 'no_show_dispute'),
        ),
        columns: { proposalId: true },
      });
      const disputedProposalIds = new Set(
        disputedClasses.map((c) => c.proposalId).filter(Boolean),
      );
      if (disputedProposalIds.size > 0) {
        existingProposals = existingProposals.filter(
          (p) => !disputedProposalIds.has(p.id),
        );
      }

      // 2. Buscar aulas em match do ALUNO ESPECÍFICO para o mesmo dia
      const matchedClasses = await this.db.query.classes.findMany({
        where: and(
          eq(classes.studentId, studentId as any), // FILTRAR POR ALUNO
          sql`DATE(${classes.date}) = ${dateString}`,
          or(eq(classes.status, 'scheduled'), eq(classes.status, 'active')),
        ),
        columns: {
          id: true,
          time: true,
          status: true,
          duration: true,
        },
      });

      // 3. Calcular horários bloqueados baseado nos conflitos reais
      const blockedTimeSlots = this.calculateBlockedTimeSlots(
        existingProposals,
        matchedClasses,
      );

      return {
        existingProposals,
        matchedClasses,
        blockedTimeSlots,
      };
    } catch (error) {
      console.error('❌ [CONFLICTS] Erro ao buscar conflitos:', error);
      throw error;
    }
  }

  private calculateBlockedTimeSlots(
    existingProposals: any[],
    matchedClasses: any[],
  ): string[] {
    const blockedSlots = new Set<string>();

    // Processar propostas existentes
    for (const proposal of existingProposals) {
      const startTime = this.parseTime(proposal.trainingTime);
      const duration = proposal.durationMinutes || 60;
      const endTime = startTime + duration / 60;

      // Bloquear apenas o intervalo real da proposta (sem buffer)
      this.addBlockedSlots(blockedSlots, startTime, endTime);
    }

    // Processar aulas em match
    for (const classItem of matchedClasses) {
      const startTime = this.parseTime(classItem.time);
      const duration = classItem.duration || 60;
      const endTime = startTime + duration / 60;

      // Bloquear apenas o intervalo real da aula (sem buffer)
      this.addBlockedSlots(blockedSlots, startTime, endTime);
    }

    return Array.from(blockedSlots).sort();
  }

  async debugStudentProposals(studentId: string) {
    try {
      console.log(`🔍 [DEBUG] Buscando propostas para aluno: ${studentId}`);

      const allProposals = await this.db.query.proposals.findMany({
        where: eq(proposals.studentId, studentId),
        columns: {
          id: true,
          studentId: true,
          trainingDate: true,
          trainingTime: true,
          status: true,
          durationMinutes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: (proposals, { desc }) => [desc(proposals.createdAt)],
        limit: 20,
      });

      console.log(
        `📊 [DEBUG] Total de propostas encontradas: ${allProposals.length}`,
      );

      return {
        studentId,
        totalProposals: allProposals.length,
        proposals: allProposals,
      };
    } catch (error) {
      console.error('❌ [DEBUG] Erro ao buscar propostas:', error);
      throw error;
    }
  }

  /**
   * NOVA ABORDAGEM: Validação usando intervalos matemáticos (muito mais eficiente)
   * Complexidade: O(m) onde m = número de agendamentos existentes
   * Memória: Baixa (só armazena agendamentos reais)
   */
  private canScheduleTimeMathematical(
    targetTime: string,
    durationMinutes: number,
    existingProposals: any[],
    matchedClasses: any[],
  ): { canSchedule: boolean; reason?: string; conflictingItem?: any } {
    console.log(`🔍 [BUFFER_DEBUG] ===== INÍCIO VALIDAÇÃO =====`);
    console.log(`🔍 [BUFFER_DEBUG] Horário alvo: ${targetTime}`);
    console.log(`🔍 [BUFFER_DEBUG] Duração: ${durationMinutes}min`);
    console.log(
      `🔍 [BUFFER_DEBUG] Propostas existentes: ${existingProposals.length}`,
    );
    console.log(`🔍 [BUFFER_DEBUG] Aulas em match: ${matchedClasses.length}`);

    for (const proposal of existingProposals) {
      console.log(
        `🔍 [BUFFER_DEBUG] Proposta encontrada: ${proposal.id} - Status: ${proposal.status} - Horário: ${proposal.trainingTime}`,
      );
    }

    const newStartMinutes = this.timeToMinutes(targetTime);
    const newEndMinutes = newStartMinutes + durationMinutes;
    const bufferMinutes = 0; // Sem buffer: bloquear apenas sobreposição real

    // Verificar conflitos com propostas existentes
    for (const proposal of existingProposals) {
      console.log(`🔍 [BUFFER_DEBUG] Verificando proposta ${proposal.id}:`);
      console.log(`  - Status: ${proposal.status}`);
      console.log(`  - Horário: ${proposal.trainingTime}`);
      console.log(`  - Duração: ${proposal.durationMinutes}min`);

      // Pular propostas sem horário definido
      if (!proposal.trainingTime) {
        console.log(
          `⚠️ [BUFFER_DEBUG] Proposta ${proposal.id} sem horário definido, pulando`,
        );
        continue;
      }

      const existingStartMinutes = this.timeToMinutes(proposal.trainingTime);
      const existingEndMinutes =
        existingStartMinutes + (proposal.durationMinutes || 60);

      console.log(`  - Início (min): ${existingStartMinutes}`);
      console.log(`  - Fim (min): ${existingEndMinutes}`);
      console.log(`  - Novo início (min): ${newStartMinutes}`);
      console.log(`  - Novo fim (min): ${newEndMinutes}`);

      // Regra: propostas bloqueiam apenas se houver sobreposição real com o novo intervalo
      // Estados que bloqueiam: 'pending', 'matched'
      // Estados que NÃO bloqueiam: 'disputed', 'cancelled', 'completed'
      if (
        proposal.status === 'disputed' ||
        proposal.status === 'cancelled' ||
        proposal.status === 'completed'
      ) {
        console.log(
          `✅ [BUFFER_DEBUG] Proposta ${proposal.id} em estado ${proposal.status}, não bloqueia`,
        );
        continue;
      }

      // Verificar sobreposição direta
      if (
        newStartMinutes < existingEndMinutes &&
        newEndMinutes > existingStartMinutes
      ) {
        console.log(`❌ [BUFFER_DEBUG] Sobreposição direta detectada`);
        return {
          canSchedule: false,
          reason: 'overlap',
          conflictingItem: { type: 'proposal', ...proposal },
        };
      }

      // Verificar buffer apenas se bufferMinutes > 0
      if (bufferMinutes > 0) {
        const bufferStart = existingStartMinutes - bufferMinutes;
        const bufferEnd = existingEndMinutes + bufferMinutes;

        console.log(`  - Buffer início (min): ${bufferStart}`);
        console.log(`  - Buffer fim (min): ${bufferEnd}`);
        console.log(
          `  - Condição buffer: ${newStartMinutes} < ${bufferEnd} && ${newEndMinutes} > ${bufferStart} = ${newStartMinutes < bufferEnd && newEndMinutes > bufferStart}`,
        );

        if (newStartMinutes < bufferEnd && newEndMinutes > bufferStart) {
          console.log(
            `❌ [BUFFER_DEBUG] Buffer de ${bufferMinutes}min detectado`,
          );
          return {
            canSchedule: false,
            reason: 'buffer',
            conflictingItem: { type: 'proposal', ...proposal },
          };
        }
      } else {
        console.log(
          `  - Sem buffer (bufferMinutes = 0), apenas sobreposição direta verificada`,
        );
      }

      console.log(`✅ [BUFFER_DEBUG] Proposta ${proposal.id} não conflita`);
    }

    // Verificar conflitos com aulas em match
    for (const classItem of matchedClasses) {
      const existingStartMinutes = this.timeToMinutes(classItem.time);
      const existingEndMinutes =
        existingStartMinutes + (classItem.duration || 60);

      // Verificar sobreposição direta
      if (
        newStartMinutes < existingEndMinutes &&
        newEndMinutes > existingStartMinutes
      ) {
        return {
          canSchedule: false,
          reason: 'overlap',
          conflictingItem: { type: 'class', ...classItem },
        };
      }

      // Verificar buffer apenas se bufferMinutes > 0
      if (bufferMinutes > 0) {
        const bufferStart = existingStartMinutes - bufferMinutes;
        const bufferEnd = existingEndMinutes + bufferMinutes;

        if (newStartMinutes < bufferEnd && newEndMinutes > bufferStart) {
          return {
            canSchedule: false,
            reason: 'buffer',
            conflictingItem: { type: 'class', ...classItem },
          };
        }
      }
    }

    return { canSchedule: true };
  }

  /**
   * Converte horário HH:MM para minutos desde meia-noite
   * Exemplo: "21:30" -> 1290 minutos
   */
  private timeToMinutes(time: string | null | undefined): number {
    if (!time) {
      console.log(`⚠️ [TIME_DEBUG] Horário nulo/undefined: ${time}`);
      return 0; // Retorna 0 para horários nulos (meia-noite)
    }
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private parseTime(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours + minutes / 60;
  }

  private addBlockedSlots(
    blockedSlots: Set<string>,
    startTime: number,
    endTime: number,
  ): void {
    // Bloquear horários principais do intervalo da proposta/aula existente
    // Exemplo: proposta 21:00-22:00 bloqueia de 21:00 até 22:00 (a cada 15min)

    // Converter para minutos para facilitar o cálculo
    const startMinutes = Math.floor(startTime * 60);
    const endMinutes = Math.floor(endTime * 60);

    // Bloquear a cada 15 minutos no intervalo (mais realista e eficiente)
    for (let minutes = startMinutes; minutes < endMinutes; minutes += 15) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const timeString = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
      blockedSlots.add(timeString);
    }

    // Garantir que o horário de início e fim sejam bloqueados
    const startHours = Math.floor(startTime);
    const startMins = Math.floor((startTime - startHours) * 60);
    const startTimeString = `${startHours.toString().padStart(2, '0')}:${startMins.toString().padStart(2, '0')}`;
    blockedSlots.add(startTimeString);

    const endHours = Math.floor(endTime);
    const endMins = Math.floor((endTime - endHours) * 60);
    const endTimeString = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
    blockedSlots.add(endTimeString);
  }

  private async mapToResponseDto(
    proposal: any,
    student?: any,
  ): Promise<ProposalResponseDto> {
    // Usar dados do usuário se fornecidos, senão usar dados da proposta (para compatibilidade)
    const studentFirstName = student?.firstName || proposal.studentFirstName;
    const studentLastName = student?.lastName || proposal.studentLastName;
    const studentEmail = student?.email || proposal.studentEmail;

    const studentName =
      studentFirstName && studentLastName
        ? `${studentFirstName} ${studentLastName}`.trim()
        : 'Nome não disponível';

    // Buscar foto do aluno
    let studentProfilePicture = null;
    const profileImageId = proposal.studentProfileImageId;

    if (profileImageId) {
      try {
        const file = await this.db.query.files.findFirst({
          where: eq(files.id, profileImageId),
        });

        if (file?.url) {
          const baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';

          try {
            const original = new URL(file.url);
            const normalizedBase = new URL(baseUrl);
            studentProfilePicture = `${normalizedBase.origin}${original.pathname}`;
          } catch (e) {
            console.error('⚠️ Erro ao normalizar URL da imagem do aluno:', e);
            studentProfilePicture = file.url.replace(
              'https://api.treinopro.com',
              baseUrl,
            );
          }
        }
      } catch (e) {
        console.error('⚠️ Falha ao buscar URL da imagem do aluno:', e);
      }
    }

    // Tentar enriquecer com coordenadas do local, se houver locationId
    let locationLat: number | null = null;
    let locationLng: number | null = null;
    try {
      const locId = (proposal.locationId || proposal.location_id) as
        | string
        | undefined;
      if (locId) {
        const [loc] = await this.db
          .select({ lat: locations.lat, lng: locations.lng })
          .from(locations)
          .where(eq(locations.id, locId))
          .limit(1);
        if (loc) {
          locationLat = parseFloat(String(loc.lat));
          locationLng = parseFloat(String(loc.lng));
        }
      }
    } catch (e) {
      console.error('⚠️ Falha ao buscar coordenadas do local:', e);
      // Silencioso: sem coordenadas
    }

    return {
      id: proposal.id,
      studentId: proposal.studentId,
      student: {
        id: proposal.studentId,
        name: studentName,
        email: studentEmail || '',
        firstName: studentFirstName || '',
        lastName: studentLastName || '',
        profilePicture: studentProfilePicture,
      },
      locationName: proposal.locationName,
      locationAddress: proposal.locationAddress,
      // Campos adicionais para o app filtrar por raio em tempo real
      ...(locationLat !== null && locationLng !== null
        ? { locationLat, locationLng }
        : {}),
      trainingDate: proposal.trainingDate,
      trainingTime: proposal.trainingTime,
      durationMinutes: proposal.durationMinutes,
      modalityName: proposal.modalityName,
      price: parseFloat(proposal.price),
      additionalNotes: proposal.additionalNotes,
      status: proposal.status,
      paymentStatus: proposal.paymentStatus,
      isRecontract: !!proposal.targetPersonalId,
      targetPersonalId: proposal.targetPersonalId || undefined,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }

  /**
   * Debug: Lista todas as propostas pendentes com detalhes
   */
  async debugPendingProposals(): Promise<any> {
    try {
      const now = new Date();

      const pendingProposals = await this.db
        .select()
        .from(proposals)
        .where(eq(proposals.status, ProposalStatus.PENDING))
        .orderBy(desc(proposals.createdAt));

      const debugInfo = pendingProposals.map((p: any) => {
        const start = buildTrainingStartDate(p.trainingDate, p.trainingTime);

        return {
          id: p.id,
          trainingDate: p.trainingDate,
          trainingTime: p.trainingTime,
          calculatedStart: start.toISOString(),
          now: now.toISOString(),
          isExpired: start.getTime() < now.getTime(),
          isRecontract: !!p.targetPersonalId,
          targetPersonalId: p.targetPersonalId,
          timeDiff: now.getTime() - start.getTime(),
          createdAt: p.createdAt,
        };
      });

      return {
        total: pendingProposals.length,
        now: now.toISOString(),
        proposals: debugInfo,
      };
    } catch (error) {
      console.error('❌ [DEBUG] Erro ao buscar propostas pendentes:', error);
      throw error;
    }
  }

  async forceExpireProposal(proposalId: string): Promise<any> {
    try {
      console.log('🧪 [DEBUG] Forçando expiração da proposta:', proposalId);

      // Buscar proposta
      const [proposal] = await this.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposalId))
        .limit(1);

      if (!proposal) {
        throw new Error('Proposta não encontrada');
      }

      if (proposal.status !== 'pending') {
        throw new Error(
          `Proposta já foi processada (status: ${proposal.status})`,
        );
      }

      // Reembolsar se houver pagamento autorizado antes de deletar
      if (
        proposal.paymentId &&
        this.isPaymentConfirmedStatus(proposal.paymentStatus)
      ) {
        try {
          await this.processAutomaticRefund(
            proposal.id,
            proposal.paymentId,
            'Proposta expirada sem match de personal',
          );
        } catch (refundErr) {
          // Se reembolso falhar, NÃO deletar — preservar para reconciliação manual.
          console.error(
            `🚨 [PROPOSALS] CRITICAL: falha ao reembolsar proposta expirada ${proposalId}. Registros preservados para auditoria.`,
            refundErr,
          );
          throw refundErr; // Abortar sem deletar
        }
      }

      // Deletar pagamentos vinculados (FK) antes de deletar a proposta
      await this.db.delete(payments).where(eq(payments.proposalId, proposalId));
      await this.db.delete(proposals).where(eq(proposals.id, proposalId));

      // Emitir evento WebSocket
      this.chatGateway.server.emit('proposal_expired', {
        action: 'proposal_expired',
        proposal: {
          id: proposal.id,
          studentId: proposal.studentId,
          locationName: proposal.locationName,
          trainingDate: proposal.trainingDate,
          trainingTime: proposal.trainingTime,
          status: 'expired',
        },
        proposalId: proposal.id,
        studentId: proposal.studentId,
        location: proposal.locationName,
        trainingDate: proposal.trainingDate,
        trainingTime: proposal.trainingTime,
        reason: 'Expiração forçada para teste',
        timestamp: new Date(),
      });

      console.log('✅ [DEBUG] Proposta expirada e evento WebSocket emitido');

      return {
        success: true,
        message: 'Proposta expirada com sucesso',
        proposalId: proposal.id,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('❌ [DEBUG] Erro ao forçar expiração:', error);
      throw error;
    }
  }

  async testWebSocket(): Promise<any> {
    try {
      console.log('🧪 [DEBUG] Testando WebSocket...');

      // Verificar se o servidor WebSocket está disponível
      if (!this.chatGateway.server) {
        throw new Error('Servidor WebSocket não está disponível');
      }

      // Emitir evento de teste
      const testData = {
        action: 'proposal_expired',
        proposal: {
          id: 'test-proposal-id',
          studentId: 'test-student-id',
          locationName: 'Test Location',
          trainingDate: new Date().toISOString(),
          trainingTime: '12:00',
          status: 'expired',
        },
        proposalId: 'test-proposal-id',
        studentId: 'test-student-id',
        location: 'Test Location',
        trainingDate: new Date().toISOString(),
        trainingTime: '12:00',
        reason: 'Teste de WebSocket',
        timestamp: new Date(),
      };

      this.chatGateway.server.emit('proposal_expired', testData);
      console.log('✅ [DEBUG] Evento de teste WebSocket emitido');

      return {
        success: true,
        message: 'Evento de teste WebSocket emitido',
        data: testData,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('❌ [DEBUG] Erro ao testar WebSocket:', error);
      throw error;
    }
  }

  /**
   * Verifica e limpa propostas expiradas em tempo real
   * Chamado quando propostas são consultadas para garantir dados atualizados
   */
  async checkAndCleanExpiredProposals(): Promise<void> {
    try {
      const now = new Date();

      // Buscar candidatas (até amanhã) e combinar data + hora em memória
      const candidates = await this.db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.status, ProposalStatus.PENDING),
            lt(
              proposals.trainingDate,
              new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
            ),
          ),
        );

      const expiredProposals = candidates.filter((p: any) => {
        try {
          const start = buildTrainingStartDate(p.trainingDate, p.trainingTime);

          const isExpired = start.getTime() < now.getTime();

          // Log para debug
          if (isExpired) {
            console.log(`🗑️ [PROPOSALS] Proposta expirada detectada:`, {
              id: p.id,
              trainingDate: p.trainingDate,
              trainingTime: p.trainingTime,
              calculatedStart: start.toISOString(),
              now: now.toISOString(),
              isRecontract: !!p.targetPersonalId,
            });
          }

          return isExpired;
        } catch (e) {
          console.error(
            `⚠️ [PROPOSALS] Erro ao processar proposta ${p.id} para verificação de expiração:`,
            e,
          );
          return false;
        }
      });

      if (expiredProposals.length === 0) {
        return; // Nenhuma proposta expirada
      }

      // Deletar propostas expiradas
      for (const proposal of expiredProposals) {
        // Reembolsar pagamentos autorizados antes de deletar
        if (
          proposal.paymentId &&
          this.isPaymentConfirmedStatus(proposal.paymentStatus)
        ) {
          try {
            await this.processAutomaticRefund(
              proposal.id,
              proposal.paymentId,
              'Proposta expirada sem match de personal',
            );
          } catch (refundErr) {
            // Se o reembolso falhar, NÃO deletar — manter registro para conciliação manual.
            console.error(
              `🚨 [PROPOSALS] CRITICAL: falha ao reembolsar proposta expirada ${proposal.id}. Proposta NÃO deletada para preservar auditoria.`,
              refundErr,
            );
            continue;
          }
        }

        // Remover pagamentos vinculados (FK) antes de deletar a proposta
        await this.db
          .delete(payments)
          .where(eq(payments.proposalId, proposal.id));
        await this.db.delete(proposals).where(eq(proposals.id, proposal.id));

        // Notificar o aluno sobre a expiração via WebSocket
        this.chatGateway.server.emit('proposal_expired', {
          action: 'proposal_expired',
          proposal: {
            id: proposal.id,
            studentId: proposal.studentId,
            locationName: proposal.locationName,
            trainingDate: proposal.trainingDate,
            trainingTime: proposal.trainingTime,
            status: 'expired',
          },
          proposalId: proposal.id,
          studentId: proposal.studentId,
          location: proposal.locationName,
          trainingDate: proposal.trainingDate,
          trainingTime: proposal.trainingTime,
          reason: 'Horário de início expirado sem match',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error('❌ [PROPOSALS] Erro na limpeza em tempo real:', error);
    }
  }

  /**
   * Verifica se um personal tem conflito de horário com uma proposta
   */
  private async checkPersonalScheduleConflict(
    personalId: string,
    proposalDate: Date,
    proposalTime: string,
    proposalDuration: number,
  ): Promise<boolean> {
    try {
      console.log(
        `  🔍 [CONFLICT_CHECK] Personal ${personalId}: Verificando conflito para ${proposalTime} (${proposalDuration}min)`,
      );

      const dateObj = new Date(proposalDate);
      const dateString = dateObj.toISOString().split('T')[0];

      // Buscar aulas do personal no mesmo dia usando DATE() para evitar
      // falso negativo por timezone entre trainingDate e classes.date.
      const existingClasses = await this.db.query.classes.findMany({
        where: and(
          eq(classes.personalId, personalId),
          sql`DATE(${classes.date}) = ${dateString}`,
          or(
            eq(classes.status, 'scheduled'),
            eq(classes.status, 'pending_confirmation'),
            eq(classes.status, 'active'),
          ),
        ),
        columns: {
          id: true,
          date: true,
          time: true,
          duration: true,
          status: true,
        },
      });

      console.log(
        `  📚 [CONFLICT_CHECK] Personal ${personalId}: ${existingClasses.length} aulas encontradas`,
      );

      if (existingClasses.length === 0) {
        console.log(
          `  ✅ [CONFLICT_CHECK] Personal ${personalId}: SEM aulas, sem conflito`,
        );
        return false; // Sem conflito
      }

      // Calcular janela de tempo da proposta
      const proposalStart = buildTrainingStartDate(dateObj, proposalTime);
      const proposalEnd = new Date(
        proposalStart.getTime() + (proposalDuration || 60) * 60 * 1000,
      );

      console.log(
        `  ⏰ [CONFLICT_CHECK] Proposta: ${proposalStart.toISOString()} até ${proposalEnd.toISOString()}`,
      );

      // Verificar sobreposição com aulas existentes
      for (const cls of existingClasses) {
        const classStart = buildTrainingStartDate(cls.date, cls.time);
        const classEnd = new Date(
          classStart.getTime() + (cls.duration || 60) * 60 * 1000,
        );

        console.log(
          `  📅 [CONFLICT_CHECK] Aula: ${cls.time} (${classStart.toISOString()} até ${classEnd.toISOString()}), status: ${cls.status}`,
        );

        // Verificar se a aula já expirou
        const now = new Date();
        if (classEnd < now) {
          console.log(`    ⏭️  Aula expirada, ignorando`);
          continue; // Ignorar aulas expiradas
        }

        // ✅ CORREÇÃO: Lógica de sobreposição mais robusta para horários pontuais
        // Dois intervalos se sobrepõem se:
        // - O início de um está ANTES do fim do outro (usando < ao invés de <=)
        // - O fim de um está DEPOIS do início do outro (usando > ao invés de >=)
        // Isso garante que horários pontuais iguais sejam detectados como conflito
        const overlaps = proposalStart < classEnd && proposalEnd > classStart;

        // Log detalhado para debug
        console.log(`    📊 Comparação de horários:`);
        console.log(
          `       Proposta: ${proposalStart.toISOString()} até ${proposalEnd.toISOString()}`,
        );
        console.log(
          `       Aula:     ${classStart.toISOString()} até ${classEnd.toISOString()}`,
        );
        console.log(
          `       proposalStart < classEnd: ${proposalStart < classEnd} (${proposalStart.toISOString()} < ${classEnd.toISOString()})`,
        );
        console.log(
          `       proposalEnd > classStart: ${proposalEnd > classStart} (${proposalEnd.toISOString()} > ${classStart.toISOString()})`,
        );
        console.log(
          `       Horários exatamente iguais? ${proposalStart.getTime() === classStart.getTime()}`,
        );
        console.log(
          `    ${overlaps ? '❌ CONFLITO DETECTADO!' : '✅ Sem conflito'}`,
        );

        if (overlaps) {
          console.log(
            `    🚫 [CONFLICT_CHECK] CONFLITO: Proposta ${proposalTime} conflita com aula ${cls.time} do personal ${personalId}`,
          );
          return true; // Conflito encontrado
        }
      }

      console.log(
        `  ✅ [CONFLICT_CHECK] Personal ${personalId}: Sem conflito após verificar todas as aulas`,
      );
      return false; // Sem conflito
    } catch (error) {
      console.error(
        '❌ [PROPOSALS] Erro ao verificar conflito de horário:',
        error,
      );
      return false; // Em caso de erro, não bloquear (fail-safe)
    }
  }

  /**
   * Extrai coordenadas da proposta
   */
  private extractProposalCoordinates(proposal: any): {
    lat?: number;
    lng?: number;
  } {
    // Tentar extrair de locationLat/locationLng
    let lat = proposal.locationLat
      ? parseFloat(proposal.locationLat)
      : undefined;
    let lng = proposal.locationLng
      ? parseFloat(proposal.locationLng)
      : undefined;

    // Se não encontrou, tentar do objeto location
    if ((!lat || !lng) && proposal.location) {
      lat = proposal.location.latitude || proposal.location.lat;
      lng = proposal.location.longitude || proposal.location.lng;
    }

    return { lat, lng };
  }

  /**
   * Calcula distância em km entre dois pontos usando fórmula de Haversine
   */
  private calculateDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Raio da Terra em km
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distância em km
  }

  /**
   * Notifica personals próximos sobre uma nova proposta (FCM e WebSocket)
   * Apenas personals online, sem conflito de horário e dentro do raio são notificados.
   */
  private async notifyNearbyPersonals(
    proposalResponse: any,
    student: any,
  ): Promise<void> {
    try {
      console.log(
        `🔍 [PROPOSALS] Iniciando notificação de personals próximos para proposta ${proposalResponse.id}`,
      );
      console.log(
        `🔍 [PROPOSALS] Dados: data=${proposalResponse.trainingDate}, hora=${proposalResponse.trainingTime}, duração=${proposalResponse.durationMinutes}min`,
      );

      // 1. Buscar personals conectados (para WebSocket em foreground)
      const connectedPersonals = this.chatGateway.getConnectedPersonals();
      console.log(
        `📢 [PROPOSALS] ${connectedPersonals.length} personals conectados via WebSocket`,
      );

      // 2. CRÍTICO: Buscar TODOS os personals ativos, online e com token em user_push_tokens
      // ✅ FILTRO: Apenas personals que estão ONLINE e têm token ativo receberão FCM
      const allPersonalsWithFcm = await this.db
        .selectDistinct({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .innerJoin(userPushTokens, eq(userPushTokens.userId, users.id))
        .where(
          and(
            eq(users.userType, 'personal'),
            eq(users.status, 'active'),
            eq(users.isPersonalOnline, true), // ✅ Apenas personals online
            eq(users.approvalStatus, 'approved' as any), // ✅ Apenas personals aprovados
          ),
        );

      console.log(
        `📱 [PROPOSALS] Encontrados ${allPersonalsWithFcm.length} personals com token FCM no banco`,
      );

      // 3. Separar: conectados (WebSocket) vs todos (FCM)
      const nearbyPersonalsForFCM: string[] = []; // TODOS para FCM

      // 4. Processar TODOS os personals com fcmToken (do banco)
      for (const personal of allPersonalsWithFcm) {
        try {
          const personalId = personal.id;

          // Verificar conflito de horário
          const hasConflict = await this.checkPersonalScheduleConflict(
            personalId,
            proposalResponse.trainingDate,
            proposalResponse.trainingTime,
            proposalResponse.durationMinutes,
          );

          if (hasConflict) {
            continue; // Pular este personal
          }

          // Verificar se proposta está dentro do raio de atendimento
          const proposalCoords =
            this.extractProposalCoordinates(proposalResponse);

          if (!proposalCoords.lat || !proposalCoords.lng) {
            continue; // Pular se sem coordenadas
          }

          // Buscar localização do personal
          const [personalData] = await this.db
            .select({
              serviceLocationLat: users.serviceLocationLat,
              serviceLocationLng: users.serviceLocationLng,
              serviceRadiusKm: users.serviceRadiusKm,
            })
            .from(users)
            .where(eq(users.id, personalId))
            .limit(1);

          if (
            personalData?.serviceLocationLat &&
            personalData?.serviceLocationLng &&
            personalData?.serviceRadiusKm
          ) {
            const distanceKm = this.calculateDistanceKm(
              parseFloat(personalData.serviceLocationLat),
              parseFloat(personalData.serviceLocationLng),
              proposalCoords.lat!,
              proposalCoords.lng!,
            );

            if (distanceKm > parseFloat(personalData.serviceRadiusKm)) {
              continue; // Fora do raio
            }
          } else {
            continue; // Sem localização/raio definido
          }

          // Adicionar para FCM
          nearbyPersonalsForFCM.push(personalId);

          // Se estiver conectado, também enviar via WebSocket (foreground)
          const connection = connectedPersonals.find(
            (p) => p.userId === personalId,
          );
          if (connection) {
            this.chatGateway.server
              .to(connection.socketId)
              .emit('new_proposal', {
                action: 'proposal_created',
                proposal: proposalResponse,
                student: {
                  id: student?.id,
                  name: student?.name,
                  profileImageUrl: student?.profileImageUrl,
                },
                timestamp: new Date(),
              });
          }
        } catch (error) {
          console.error(
            `❌ [PROPOSALS] Erro ao verificar conflito para personal ${personal.id}:`,
            error,
          );
        }
      }

      // 5. Enviar notificações Firebase (FCM)
      if (nearbyPersonalsForFCM.length > 0) {
        console.log(
          `🔥 [PROPOSALS] Enviando FCM para ${nearbyPersonalsForFCM.length} personals`,
        );
        await this.proposalsGateway.sendProposalCreated({
          proposal: proposalResponse,
          student: {
            id: student?.id,
            name: student?.name,
            firstName: student?.firstName,
            lastName: student?.lastName,
            profileImageUrl: student?.profileImageUrl,
          },
          nearbyPersonals: nearbyPersonalsForFCM,
        });
      } else {
        console.log(
          `⚠️ [PROPOSALS] Nenhum personal qualificado encontrado para receber notificação`,
        );
      }
    } catch (error) {
      console.error(
        '❌ [PROPOSALS] Erro ao notificar personals próximos:',
        error,
      );
    }
  }
}
