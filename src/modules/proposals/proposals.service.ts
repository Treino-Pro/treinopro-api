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
import { StudentPaymentMethodsService } from '../payments/student-payment-methods.service';
import { StudentPaymentMethod } from '../payments/dto/student-payment-methods.dto';
import { PaymentsService } from '../payments/payments.service';
import { JobsService } from '../jobs/jobs.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ProposalsGateway } from './proposals.gateway';
import { NonceService } from '../notifications/services/nonce.service';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LocationsService } from '../locations/locations.service';
// Enum ClassStatus não exportado no schema, usando string diretamente

@Injectable()
export class ProposalsService {
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

      // Considerar sucesso quando MP autorizar/aprovar.
      // Se for simulado, só permitir quando explícito via ENV e apenas em TEST.
      const statusOk = ['authorized', 'approved', 'captured'].includes(
        String(paymentResult.status || '').toLowerCase(),
      );
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
        // Se pagamento falhar, deletar proposta criada
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

      // ===== NOTIFICAR PERSONALS (FCM INDEPENDENTE DE WEBSOCKET) =====
      try {
        console.log(
          `🔍 [PROPOSALS] Proposta: data=${proposalResponse.trainingDate}, hora=${proposalResponse.trainingTime}, duração=${proposalResponse.durationMinutes}min`,
        );

        // 1. Buscar personals conectados (para WebSocket em foreground)
        const connectedPersonals = this.chatGateway.getConnectedPersonals();
        console.log(
          `📢 [PROPOSALS] ${connectedPersonals.length} personals conectados via WebSocket`,
        );

        // 2. CRÍTICO: Buscar TODOS os personals ativos, online e que têm fcmToken do BANCO DE DADOS
        // Isso permite que FCM funcione mesmo quando app está em background (WebSocket desconectado)
        // ✅ FILTRO: Apenas personals que estão ONLINE receberão FCM
        const allPersonalsWithFcm = await this.db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            fcmToken: users.fcmToken,
          })
          .from(users)
          .where(
            and(
              eq(users.userType, 'personal'),
              eq(users.status, 'active'),
              eq(users.isPersonalOnline, true), // ✅ Apenas personals online
              sql`${users.fcmToken} IS NOT NULL`,
            ),
          );

        console.log(
          `📱 [PROPOSALS] Encontrados ${allPersonalsWithFcm.length} personals com token FCM no banco`,
        );

        // 3. Separar: conectados (WebSocket) vs todos (FCM)
        const nearbyPersonalsForFCM: string[] = []; // TODOS para FCM
        const nearbyPersonalsForWS: string[] = []; // Apenas conectados para WebSocket

        // 4. Processar TODOS os personals com fcmToken (do banco)
        for (const personal of allPersonalsWithFcm) {
          try {
            const personalId = personal.id;

            console.log(
              `🔍 [PROPOSALS] Verificando conflito para personal ${personalId}...`,
            );

            // Verificar se o personal tem conflito de horário
            const hasConflict = await this.checkPersonalScheduleConflict(
              personalId,
              proposalResponse.trainingDate,
              proposalResponse.trainingTime,
              proposalResponse.durationMinutes,
            );

            if (hasConflict) {
              console.log(
                `⏰ [PROPOSALS] Personal ${personalId} tem conflito de horário, NÃO enviando proposta`,
              );
              continue; // Pular este personal
            }

            // Verificar se proposta está dentro do raio de atendimento do personal
            const proposalCoords =
              this.extractProposalCoordinates(proposalResponse);

            // ✅ CRÍTICO: Se proposta não tem coordenadas, NÃO enviar FCM
            if (!proposalCoords.lat || !proposalCoords.lng) {
              console.log(
                `⚠️ [PROPOSALS] Proposta ${proposalResponse.id} não tem coordenadas (locationLat/locationLng), NÃO enviando notificação FCM para personal ${personalId}`,
              );
              console.log(
                `📍 [PROPOSALS] locationName: ${proposalResponse.locationName || 'null'}, locationAddress: ${proposalResponse.locationAddress || 'null'}`,
              );
              continue; // Pular este personal
            }

            // Buscar localização do personal do banco
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
              const personalLat = parseFloat(personalData.serviceLocationLat);
              const personalLng = parseFloat(personalData.serviceLocationLng);
              const radiusKm = parseFloat(personalData.serviceRadiusKm);

              // Calcular distância usando Haversine
              const distanceKm = this.calculateDistanceKm(
                personalLat,
                personalLng,
                proposalCoords.lat!,
                proposalCoords.lng!,
              );

              if (distanceKm > radiusKm) {
                console.log(
                  `📍 [PROPOSALS] Personal ${personalId} está fora do raio (${distanceKm.toFixed(2)}km > ${radiusKm}km), NÃO enviando notificação`,
                );
                continue; // Pular este personal
              }

              console.log(
                `✅ [PROPOSALS] Personal ${personalId} está dentro do raio (${distanceKm.toFixed(2)}km <= ${radiusKm}km)`,
              );
            } else {
              // Se personal não tem localização definida, não enviar (por segurança)
              console.log(
                `⚠️ [PROPOSALS] Personal ${personalId} não tem localização/raio definido, NÃO enviando notificação`,
              );
              continue;
            }

            // Adicionar para FCM (dentro do raio e sem conflito)
            nearbyPersonalsForFCM.push(personalId);
            console.log(
              `✅ [PROPOSALS] Personal ${personalId} DENTRO do raio e sem conflito, será notificado via FCM`,
            );

            // Se estiver conectado, também enviar via WebSocket (foreground)
            const isConnected = connectedPersonals.some(
              (p) => p.userId === personalId,
            );
            if (isConnected) {
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
                nearbyPersonalsForWS.push(personalId);
                console.log(
                  `📡 [PROPOSALS] Personal ${personalId} também recebeu via WebSocket (foreground)`,
                );
              }
            }
          } catch (error) {
            console.error(
              `❌ [PROPOSALS] Erro ao verificar conflito para personal ${personal.id}:`,
              error,
            );
            // Em caso de erro, não adicionar para não enviar notificação incorreta
          }
        }

        // 5. Enviar notificações Firebase para TODOS os personals (conectados OU não)
        // CRÍTICO: FCM deve funcionar independente de WebSocket estar conectado
        if (nearbyPersonalsForFCM.length > 0) {
          console.log(
            `🔥 [PROPOSALS] Enviando FCM para ${nearbyPersonalsForFCM.length} personals (independente de conexão WebSocket)`,
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
            nearbyPersonals: nearbyPersonalsForFCM, // TODOS, não apenas conectados
          });
        } else {
          console.log(
            `⚠️ [PROPOSALS] Nenhum personal sem conflito encontrado para receber notificação`,
          );
        }
      } catch (error) {
        console.error(
          '❌ [PROPOSALS] Erro ao emitir evento new_proposal:',
          error,
        );
        // Não falhar a operação por causa de problemas de WebSocket
      }

      return {
        ...proposalResponse,
        payment: {
          paymentId: paymentResult.paymentId,
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
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
        },
      };
    } catch (error) {
      console.error('❌ [PROPOSALS] Erro no pagamento:', error.message);
      // Se falhar no pagamento, EXCLUIR a proposta criada para não ocupar horário
      try {
        // 'proposal' existe no escopo externo
        if (proposal?.id) {
          await this.db.delete(proposals).where(eq(proposals.id, proposal.id));
          console.log(
            '🗑️ [PROPOSALS] Proposta removida devido a falha no pagamento:',
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
      throw new BadRequestException(`Erro no pagamento: ${error.message}`);
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

    // Validar se o personal trainer existe
    const [personal] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, createRecontractDto.personalId),
          eq(users.userType, 'personal'),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);

    if (!personal) {
      throw new NotFoundException('Personal trainer não encontrado ou inativo');
    }

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

    // Buscar dados do aluno
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

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

      // Considerar sucesso quando MP autorizar/aprovar.
      // Se for simulado, só permitir quando explícito via ENV e apenas em TEST.
      const statusOk = ['authorized', 'approved', 'captured'].includes(
        String(paymentResult.status || '').toLowerCase(),
      );
      const isSimulated = Boolean((paymentResult as any)?._simulated);
      const allowSimulated =
        process.env.ALLOW_SIMULATED_PAYMENTS_FOR_PROPOSALS === 'true';
      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');

      if (
        !paymentResult.success ||
        !statusOk ||
        (isSimulated && !(allowSimulated && isTestEnv))
      ) {
        // Se pagamento falhar, deletar proposta criada
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

      // Retornar proposta com dados do pagamento e do usuário
      const proposalResponse = await this.mapToResponseDto(proposal, user);

      // ===== NOTIFICAR PERSONAL ESPECÍFICO =====
      try {
        // Emitir evento específico para o personal da recontratação
        this.chatGateway.server.emit('recontract_proposal', {
          action: 'recontract_created',
          proposal: proposalResponse,
          student: {
            id: user?.id,
            name: `${user?.firstName} ${user?.lastName}`,
            profileImageUrl: user?.profileImageUrl,
          },
          personalId: createRecontractDto.personalId,
          timestamp: new Date(),
        });

        console.log(
          '📡 [PROPOSALS SERVICE] Evento de recontratação emitido para personal:',
          createRecontractDto.personalId,
        );

        // ✅ NOVO: Enviar FCM para o personal específico da recontratação
        // Verificar se o personal está online antes de enviar FCM
        const [personalForFCM] = await this.db
          .select()
          .from(users)
          .where(
            and(
              eq(users.id, createRecontractDto.personalId),
              eq(users.isPersonalOnline, true), // ✅ Apenas se estiver online
            ),
          )
          .limit(1);

        if (personalForFCM) {
          console.log(
            `🔥 [PROPOSALS SERVICE] Personal está online - enviando FCM para recontratação: ${createRecontractDto.personalId}`,
          );
          await this.proposalsGateway.sendProposalCreated({
            proposal: proposalResponse,
            student: {
              id: user?.id,
              name: `${user?.firstName} ${user?.lastName}`,
              firstName: user?.firstName,
              lastName: user?.lastName,
              profileImageUrl: user?.profileImageUrl,
            },
            nearbyPersonals: [createRecontractDto.personalId], // Apenas o personal específico
          });
        } else {
          console.log(
            `⚠️ [PROPOSALS SERVICE] Personal não está online - FCM não enviado para recontratação: ${createRecontractDto.personalId}`,
          );
        }
      } catch (error) {
        console.error(
          '❌ [PROPOSALS SERVICE] Erro ao emitir evento de recontratação:',
          error,
        );
        // Não falhar a operação por causa de problemas de WebSocket
      }

      console.log(
        '✅ [PROPOSALS SERVICE] Recontratação criada com sucesso:',
        proposal.id,
      );
      console.log('🏁 [PROPOSALS SERVICE] ===== FIM DA RECONTRATAÇÃO =====');

      return {
        ...proposalResponse,
        payment: {
          paymentId: paymentResult.paymentId,
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
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
        },
      };
    } catch (error) {
      console.error(
        '❌ [PROPOSALS SERVICE] Erro no pagamento da recontratação:',
        error.message,
      );
      // Se falhar no pagamento, EXCLUIR a proposta criada para não ocupar horário
      try {
        if (proposal?.id) {
          await this.db.delete(proposals).where(eq(proposals.id, proposal.id));
          console.log(
            '🗑️ [PROPOSALS SERVICE] Proposta de recontratação removida por falha no pagamento:',
            proposal.id,
          );
        }
      } catch (cleanupErr) {
        console.error(
          '⚠️ [PROPOSALS SERVICE] Erro ao remover proposta de recontratação após falha:',
          cleanupErr,
        );
      }
      // Propagar erro amigável
      throw new BadRequestException(`Erro no pagamento: ${error.message}`);
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

    // Cancelar a proposta
    const [cancelledProposal] = await this.db
      .update(proposals)
      .set({
        status: ProposalStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();

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
        const [hours, minutes] = proposal.trainingTime.split(':').map(Number);
        const proposedStart = new Date(proposedTrainingDate);
        proposedStart.setHours(hours, minutes, 0, 0);
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
          const [clsHours, clsMinutes] = cls.time.split(':').map(Number);
          const classStart = new Date(cls.date);
          classStart.setHours(clsHours, clsMinutes, 0, 0);
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
          const [propHours, propMinutes] = prop.trainingTime
            .split(':')
            .map(Number);
          const propStart = new Date(prop.trainingDate);
          propStart.setHours(propHours, propMinutes, 0, 0);
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

          if (payment && payment.status === 'authorized') {
            // Atualizar pagamento com classId e personalId
            await tx
              .update(payments)
              .set({
                classId: newClass.id,
                personalId: personalId, // Definir personalId quando aceitar
                updatedAt: new Date(),
              })
              .where(eq(payments.id, payment.id));

            // Não capturar pagamento aqui: captura/repasse só após conclusão da aula
            console.log(
              'ℹ️ [PROPOSALS] Pagamento em custódia mantido. Captura ocorrerá na conclusão da aula.',
            );
          } else {
            console.log(
              '⚠️ [PROPOSALS] Pagamento não encontrado ou não autorizado:',
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
            name: personal?.name,
            profileImageUrl: personal?.profileImageUrl,
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
                personal.name || `${personal.firstName} ${personal.lastName}`,
              firstName: personal.firstName,
              lastName: personal.lastName,
              photo: personal.profileImageUrl,
              profileImageUrl: personal.profileImageUrl,
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
          name: personal?.name,
          profileImageUrl: personal?.profileImageUrl,
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
    mpPaymentId?: string,
  ): Promise<void> {
    // Validar parâmetros obrigatórios
    if (!proposalId || !paymentStatus) {
      throw new Error('proposalId e paymentStatus são obrigatórios');
    }

    try {
      await this.db
        .update(proposals)
        .set({
          paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      // Se pagamento foi aprovado, notificar que proposta está pronta
      if (paymentStatus === 'approved' || paymentStatus === 'captured') {
      }

      // Se pagamento falhou, cancelar proposta automaticamente
      if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
        await this.db
          .update(proposals)
          .set({
            status: ProposalStatus.CANCELLED,
            updatedAt: new Date(),
          })
          .where(eq(proposals.id, proposalId));
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

      // Cancelar propostas expiradas
      const cancelledCount = await this.db
        .update(proposals)
        .set({
          status: ProposalStatus.CANCELLED,
          paymentStatus: 'expired',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(proposals.status, ProposalStatus.PENDING),
            eq(proposals.paymentStatus, 'pending'),
            lte(proposals.createdAt, thirtyMinutesAgo),
          ),
        );

      // Processar reembolsos automáticos
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

            // Marcar como erro para análise manual
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
      // Verificar se é uma preferência do Mercado Pago ou pagamento simulado
      if (paymentId.startsWith('proposal_')) {
        // Pagamento real via Mercado Pago - processar reembolso via PaymentsService

        // Buscar pagamento no sistema de pagamentos
        const payment = await this.findPaymentByExternalReference(paymentId);

        if (payment) {
          await this.paymentsService.refundPayment(payment.id, reason);
        } else {
        }
      } else {
        // Pagamento simulado - apenas marcar como reembolsado
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

  async findPaymentByExternalReference(
    externalReference: string,
  ): Promise<any> {
    // Buscar pagamento no banco de dados usando external reference
    try {
      const payment = await this.db.query.payments?.findFirst({
        where: (payments: any) =>
          eq(payments.externalReference, externalReference),
      });

      return payment;
    } catch (error) {
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
            cardData: null,
            installments: createProposalDto.installments || '1',
            saveCard: createProposalDto.saveCard || false,
            cardNickname: createProposalDto.cardNickname,
            payerEmail: createProposalDto.payerEmail, // ✅ Passar email do pagador
            payerCpf: createProposalDto.payerCpf, // ✅ Passar CPF do pagador
          };

          console.log(
            '📤 [PROPOSALS] Dados enviados para processProposalPayment:',
            paymentDto,
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
            paymentId: proposalId, // Usar ID real da proposta
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

      // ===== FALLBACK: CRIAR PREFERÊNCIA MP (PIX, Mercado Pago, ou cartão sem ID) =====
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
        await this.paymentsService['mercadoPagoService'].createPreference(
          preferenceData,
        );

      console.log('✅ [PROPOSALS] Preferência MP criada:', {
        id: mpPreference.id,
        initPoint: mpPreference.initPoint,
        sandboxInitPoint: mpPreference.sandboxInitPoint,
      });

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
      throw new BadRequestException(
        `Erro ao processar pagamento: ${error.message}`,
      );
    }
  }

  // ===== MÉTODO DE SIMULAÇÃO DESABILITADO =====
  // Este método foi desabilitado para evitar criação de propostas sem pagamento real
  // Em caso de erro de pagamento, a proposta não deve ser criada

  private simulatePaymentForProposal(
    createProposalDto: CreateProposalDto,
    proposalId: string,
  ): any {
    // MÉTODO DESABILITADO - Não deve ser usado em produção
    throw new BadRequestException(
      'Simulação de pagamento desabilitada. Pagamento real é obrigatório.',
    );
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
      console.log(
        `🔍 [CONFLICTS] Buscando conflitos para data ${date} e aluno ${studentId}`,
      );

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

      console.log(`🔍 [CONFLICTS] Data buscada: ${targetDate}`);
      console.log(`🔍 [CONFLICTS] Start of day: ${startOfDay.toISOString()}`);
      console.log(`🔍 [CONFLICTS] End of day: ${endOfDay.toISOString()}`);

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

      if (beforeFilter !== afterFilter) {
        console.log(
          `🔍 [CONFLICTS] Filtro aplicado: ${beforeFilter} → ${afterFilter} propostas (removidas: ${beforeFilter - afterFilter})`,
        );
      }

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

      console.log(
        `📋 [CONFLICTS] Propostas existentes encontradas: ${existingProposals.length}`,
      );

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

      console.log(
        `🏃 [CONFLICTS] Aulas em match do aluno ${studentId} encontradas: ${matchedClasses.length}`,
      );

      // 3. Calcular horários bloqueados baseado nos conflitos reais
      const blockedTimeSlots = this.calculateBlockedTimeSlots(
        existingProposals,
        matchedClasses,
      );

      console.log(
        `🚫 [CONFLICTS] Horários bloqueados: ${blockedTimeSlots.join(', ')}`,
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
          } catch (_) {
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
        const start = new Date(p.trainingDate);
        const [hhStr, mmStr] = String(p.trainingTime ?? '00:00').split(':');
        const hh = Number(hhStr ?? 0);
        const mm = Number(mmStr ?? 0);
        start.setHours(hh, mm, 0, 0);

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

      // Deletar proposta
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
          const start = new Date(p.trainingDate);
          const [hhStr, mmStr] = String(p.trainingTime ?? '00:00').split(':');
          const hh = Number(hhStr ?? 0);
          const mm = Number(mmStr ?? 0);
          start.setHours(hh, mm, 0, 0);

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
        } catch (_) {
          return false;
        }
      });

      if (expiredProposals.length === 0) {
        return; // Nenhuma proposta expirada
      }

      // Deletar propostas expiradas
      for (const proposal of expiredProposals) {
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
      const startOfDay = new Date(dateObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateObj);
      endOfDay.setHours(23, 59, 59, 999);

      // Buscar aulas do personal no mesmo dia
      const existingClasses = await this.db
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
        `  📚 [CONFLICT_CHECK] Personal ${personalId}: ${existingClasses.length} aulas encontradas`,
      );

      if (existingClasses.length === 0) {
        console.log(
          `  ✅ [CONFLICT_CHECK] Personal ${personalId}: SEM aulas, sem conflito`,
        );
        return false; // Sem conflito
      }

      // Calcular janela de tempo da proposta
      const [hours, minutes] = proposalTime.split(':').map(Number);
      const proposalStart = new Date(dateObj);
      proposalStart.setHours(hours, minutes, 0, 0);
      const proposalEnd = new Date(
        proposalStart.getTime() + (proposalDuration || 60) * 60 * 1000,
      );

      console.log(
        `  ⏰ [CONFLICT_CHECK] Proposta: ${proposalStart.toISOString()} até ${proposalEnd.toISOString()}`,
      );

      // Verificar sobreposição com aulas existentes
      for (const cls of existingClasses) {
        const [clsHours, clsMinutes] = cls.time.split(':').map(Number);
        const classStart = new Date(cls.date);
        classStart.setHours(clsHours, clsMinutes, 0, 0);
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
}
