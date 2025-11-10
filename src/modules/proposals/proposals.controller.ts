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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ProposalsService } from './proposals.service';
import { ProposalCleanupService } from './proposal-cleanup.service';
import { ProposalBackgroundService } from './proposal-background.service';
import {
  CreateProposalDto,
  CreateRecontractDto,
  UpdateProposalDto,
  ProposalQueryDto,
  ProposalResponseDto,
  ProposalListResponseDto,
  PaymentStatusWebhookDto,
} from './dto/proposals.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Proposals')
@Controller('proposals')
@ApiBearerAuth()
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly proposalCleanupService: ProposalCleanupService,
    private readonly proposalBackgroundService: ProposalBackgroundService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Criar nova proposta de treino',
    description: 'Permite que um aluno crie uma nova proposta de treino',
  })
  @ApiResponse({
    status: 201,
    description: 'Proposta criada com sucesso',
    type: ProposalResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou data no passado',
  })
  @ApiResponse({
    status: 403,
    description: 'Apenas alunos podem criar propostas',
  })
  async createProposal(
    @Body() createProposalDto: CreateProposalDto,
    @Request() req: any,
  ): Promise<ProposalResponseDto> {
    try {
      console.log(
        '🚀 [PROPOSALS CONTROLLER] ===== INÍCIO DA CRIAÇÃO DE PROPOSTA =====',
      );
      console.log('👤 [PROPOSALS CONTROLLER] User ID:', req.user.sub);
      console.log(
        '📋 [PROPOSALS CONTROLLER] Dados recebidos do frontend:',
        JSON.stringify(createProposalDto, null, 2),
      );

      const result = await this.proposalsService.createProposal(
        createProposalDto,
        req.user.sub,
      );

      console.log('✅ [PROPOSALS CONTROLLER] Proposta criada com sucesso');
      console.log(
        '📤 [PROPOSALS CONTROLLER] Resposta enviada para o frontend:',
        JSON.stringify(result, null, 2),
      );
      console.log(
        '🏁 [PROPOSALS CONTROLLER] ===== FIM DA CRIAÇÃO DE PROPOSTA =====',
      );

      return result;
    } catch (error) {
      console.error(
        '❌ [PROPOSALS CONTROLLER] Erro ao criar proposta:',
        error.message,
      );
      throw error;
    }
  }

  @Post('recontract')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Criar proposta de recontratação direta',
    description:
      'Permite que um aluno crie uma proposta de recontratação direta para um personal trainer específico',
  })
  @ApiResponse({
    status: 201,
    description: 'Proposta de recontratação criada com sucesso',
    type: ProposalResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou data no passado',
  })
  @ApiResponse({
    status: 403,
    description: 'Apenas alunos podem criar propostas',
  })
  async createRecontract(
    @Body() createRecontractDto: CreateRecontractDto,
    @Request() req: any,
  ): Promise<ProposalResponseDto> {
    try {
      console.log(
        '🚀 [PROPOSALS CONTROLLER] ===== INÍCIO DA RECONTRATAÇÃO =====',
      );
      console.log('👤 [PROPOSALS CONTROLLER] User ID:', req.user.sub);
      console.log(
        '🎯 [PROPOSALS CONTROLLER] Personal ID:',
        createRecontractDto.personalId,
      );
      console.log(
        '📋 [PROPOSALS CONTROLLER] Dados recebidos do frontend:',
        JSON.stringify(createRecontractDto, null, 2),
      );

      const result = await this.proposalsService.createRecontract(
        createRecontractDto,
        req.user.sub,
      );

      console.log('✅ [PROPOSALS CONTROLLER] Recontratação criada com sucesso');
      console.log(
        '📤 [PROPOSALS CONTROLLER] Resposta enviada para o frontend:',
        JSON.stringify(result, null, 2),
      );
      console.log('🏁 [PROPOSALS CONTROLLER] ===== FIM DA RECONTRATAÇÃO =====');

      return result;
    } catch (error) {
      console.error(
        '❌ [PROPOSALS CONTROLLER] Erro ao criar recontratação:',
        error.message,
      );
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Listar propostas',
    description:
      'Lista propostas com filtros e paginação. Alunos veem suas propostas, personal trainers veem propostas pendentes',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de propostas retornada com sucesso',
    type: ProposalListResponseDto,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Página (padrão: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Itens por página (padrão: 10)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por status',
  })
  @ApiQuery({
    name: 'modality',
    required: false,
    description: 'Filtrar por modalidade',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Data mínima (ISO string)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Data máxima (ISO string)',
  })
  async getProposals(
    @Query() query: ProposalQueryDto,
    @Request() req: any,
  ): Promise<ProposalListResponseDto> {
    return this.proposalsService.getProposals(
      query,
      req.user.sub,
      req.user.userType,
    );
  }

  @Get('my')
  @ApiOperation({
    summary: 'Listar minhas propostas',
    description: 'Lista apenas as propostas do usuário logado (aluno)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de propostas do usuário retornada com sucesso',
    type: ProposalListResponseDto,
  })
  async getMyProposals(
    @Query() query: ProposalQueryDto,
    @Request() req: any,
  ): Promise<ProposalListResponseDto> {
    // Forçar que apenas o usuário veja suas próprias propostas
    const userQuery = { ...query };
    return this.proposalsService.getProposals(
      userQuery,
      req.user.sub,
      'student',
    );
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Estatísticas das propostas',
    description: 'Retorna estatísticas das propostas do usuário',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas retornadas com sucesso',
  })
  async getProposalStats(@Request() req: any) {
    return this.proposalsService.getProposalStats(
      req.user.sub,
      req.user.userType,
    );
  }

  @Get('conflicts')
  @ApiOperation({
    summary: 'Buscar conflitos de horários',
    description:
      'Retorna propostas e aulas existentes que podem conflitar com um horário específico',
  })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Data para verificar conflitos (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'studentId',
    required: false,
    description: 'ID do aluno (opcional, usa usuário logado se não informado)',
  })
  @ApiResponse({
    status: 200,
    description: 'Conflitos de horários retornados com sucesso',
    schema: {
      type: 'object',
      properties: {
        existingProposals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              trainingTime: { type: 'string' },
              status: { type: 'string' },
              durationMinutes: { type: 'number' },
            },
          },
        },
        matchedClasses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              time: { type: 'string' },
              status: { type: 'string' },
              duration: { type: 'number' },
            },
          },
        },
        blockedTimeSlots: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de horários bloqueados (formato HH:MM)',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Data inválida ou parâmetros incorretos',
  })
  async getTimeConflicts(
    @Query('date') date: string,
    @Request() req: any,
    @Query('studentId') studentId?: string,
  ) {
    const targetStudentId = studentId || req.user.sub;
    return this.proposalsService.getTimeConflicts(date, targetStudentId);
  }

  @Get('debug/student/:studentId')
  @ApiOperation({
    summary: 'Debug - Listar propostas do aluno',
    description: 'Endpoint temporário para debug de propostas',
  })
  async debugStudentProposals(@Param('studentId') studentId: string) {
    return this.proposalsService.debugStudentProposals(studentId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter proposta por ID',
    description: 'Retorna os detalhes de uma proposta específica',
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({
    status: 200,
    description: 'Proposta encontrada com sucesso',
    type: ProposalResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Proposta não encontrada',
  })
  @ApiResponse({
    status: 403,
    description: 'Sem permissão para visualizar esta proposta',
  })
  async getProposalById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<ProposalResponseDto> {
    return this.proposalsService.getProposalById(
      id,
      req.user.sub,
      req.user.userType,
    );
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualizar proposta',
    description: 'Atualiza uma proposta existente',
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({
    status: 200,
    description: 'Proposta atualizada com sucesso',
    type: ProposalResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Proposta não encontrada',
  })
  @ApiResponse({
    status: 403,
    description: 'Sem permissão para editar esta proposta',
  })
  @ApiResponse({
    status: 400,
    description: 'Proposta não pode ser editada',
  })
  async updateProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProposalDto: UpdateProposalDto,
    @Request() req: any,
  ): Promise<ProposalResponseDto> {
    return this.proposalsService.updateProposal(
      id,
      updateProposalDto,
      req.user.sub,
      req.user.userType,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar proposta',
    description: 'Cancela uma proposta existente',
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({
    status: 200,
    description: 'Proposta cancelada com sucesso',
    type: ProposalResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Proposta não encontrada',
  })
  @ApiResponse({
    status: 403,
    description: 'Sem permissão para cancelar esta proposta',
  })
  @ApiResponse({
    status: 400,
    description: 'Proposta não pode ser cancelada',
  })
  async cancelProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<ProposalResponseDto> {
    return this.proposalsService.cancelProposal(
      id,
      req.user.sub,
      req.user.userType,
    );
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aceitar proposta',
    description: 'Permite que um personal trainer aceite uma proposta pendente',
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({
    status: 200,
    description: 'Proposta aceita com sucesso',
    type: ProposalResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Proposta não encontrada',
  })
  @ApiResponse({
    status: 400,
    description: 'Proposta não pode ser aceita',
  })
  @ApiResponse({
    status: 403,
    description: 'Apenas personal trainers podem aceitar propostas',
  })
  @ApiResponse({
    status: 409,
    description: 'Proposta já foi aceita ou nonce já foi usado',
  })
  async acceptProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body('nonce') nonce?: string,
  ): Promise<ProposalResponseDto> {
    // Verificar se o usuário é um personal trainer
    if (req.user.userType !== 'personal') {
      throw new Error('Apenas personal trainers podem aceitar propostas');
    }

    return this.proposalsService.acceptProposal(id, req.user.sub, nonce);
  }

  // ===== WEBHOOK PARA PAGAMENTOS =====

  @Post('webhook/payment-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook para atualização de status de pagamento',
    description:
      'Endpoint interno para receber atualizações de status de pagamento',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do pagamento atualizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Status do pagamento atualizado com sucesso',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  async updatePaymentStatus(
    @Body() webhookData: PaymentStatusWebhookDto,
  ): Promise<{ message: string }> {
    await this.proposalsService.updatePaymentStatus(
      webhookData.proposalId,
      webhookData.paymentStatus,
      webhookData.mpPaymentId,
    );

    return { message: 'Status do pagamento atualizado com sucesso' };
  }

  @Get('by-payment/:paymentId')
  @ApiOperation({
    summary: 'Buscar proposta por ID do pagamento',
    description:
      'Endpoint interno para encontrar proposta pelo ID do pagamento',
  })
  async getProposalByPaymentId(
    @Param('paymentId') paymentId: string,
  ): Promise<any> {
    return this.proposalsService.findProposalByPaymentId(paymentId);
  }

  // ===== LIMPEZA DE PROPOSTAS EXPIRADAS =====

  @Post('cleanup/expired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar propostas expiradas',
    description:
      'Endpoint para cancelar propostas com pagamento pendente há mais de 30 minutos',
  })
  async cancelExpiredProposals(): Promise<{ cancelled: number }> {
    return this.proposalsService.cancelExpiredProposals();
  }

  // ===== SISTEMA DE REEMBOLSO =====

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar reembolso de proposta',
    description:
      'Permite que o aluno solicite reembolso de uma proposta não aceita',
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({
    status: 200,
    description: 'Reembolso processado com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Proposta não pode ser reembolsada',
  })
  @ApiResponse({
    status: 404,
    description: 'Proposta não encontrada',
  })
  async refundProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    // Verificar se o usuário é um aluno
    if (req.user.userType !== 'student') {
      throw new ForbiddenException('Apenas alunos podem solicitar reembolso');
    }

    return this.proposalsService.refundUnacceptedProposal(id, req.user.sub);
  }

  @Post('cleanup/expired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Limpeza manual de propostas expiradas',
    description:
      'Executa limpeza manual de propostas que passaram do horário de início sem match',
  })
  @ApiResponse({
    status: 200,
    description: 'Limpeza executada com sucesso',
  })
  @ApiResponse({
    status: 403,
    description: 'Apenas administradores podem executar limpeza',
  })
  async cleanupExpiredProposals(
    @Request() req: any,
  ): Promise<{ message: string }> {
    // Verificar se o usuário é um administrador (ou personal trainer para testes)
    if (req.user.userType !== 'personal' && req.user.userType !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores podem executar limpeza',
      );
    }

    await this.proposalCleanupService.manualCleanup();
    return { message: 'Limpeza de propostas expiradas executada com sucesso' };
  }

  @Get('background/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Status do serviço de background',
    description:
      'Retorna o status do serviço de verificação contínua de propostas expiradas',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do serviço de background',
  })
  async getBackgroundStatus(): Promise<{
    isRunning: boolean;
    interval: number;
    message: string;
  }> {
    const status = this.proposalBackgroundService.getStatus();
    return {
      ...status,
      message: status.isRunning
        ? 'Serviço de background ativo e verificando propostas expiradas'
        : 'Serviço de background inativo',
    };
  }

  @Get('debug/pending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Debug - Listar propostas pendentes',
    description:
      'Endpoint temporário para debug - lista todas as propostas pendentes com detalhes',
  })
  async debugPendingProposals(): Promise<any> {
    return this.proposalsService.debugPendingProposals();
  }

  @Post('debug/force-expire/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Debug - Forçar expiração de proposta',
    description:
      'Endpoint temporário para debug - força a expiração de uma proposta específica',
  })
  async forceExpireProposal(@Param('id') id: string): Promise<any> {
    return this.proposalsService.forceExpireProposal(id);
  }

  @Post('debug/test-websocket')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Debug - Testar WebSocket',
    description:
      'Endpoint temporário para debug - testa se o WebSocket está funcionando',
  })
  async testWebSocket(): Promise<any> {
    return this.proposalsService.testWebSocket();
  }

  @Post('background/force-cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forçar limpeza de propostas expiradas',
    description:
      'Força uma limpeza imediata de propostas expiradas via serviço de background',
  })
  @ApiResponse({
    status: 200,
    description: 'Limpeza forçada executada com sucesso',
  })
  @ApiResponse({
    status: 403,
    description: 'Apenas administradores podem forçar limpeza',
  })
  async forceBackgroundCleanup(
    @Request() req: any,
  ): Promise<{ message: string }> {
    // Verificar se o usuário é um administrador (ou personal trainer para testes)
    if (req.user.userType !== 'personal' && req.user.userType !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores podem forçar limpeza',
      );
    }

    await this.proposalBackgroundService.forceCleanup();
    return {
      message: 'Limpeza forçada de propostas expiradas executada com sucesso',
    };
  }
}
