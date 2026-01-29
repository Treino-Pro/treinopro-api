import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { PaymentsService } from '../payments/payments.service';
import {
  DashboardSummaryResponseDto,
  UserListResponseDto,
  UserItemDto,
  UpdateUserDto,
  FinancialSummaryResponseDto,
  MissionListResponseDto,
  UpdateMissionDto,
  AnalyticsResponseDto,
} from './dto/admin.dto';
import {
  ApproveWithdrawalDto,
  RejectWithdrawalDto,
  WithdrawalResponseDto,
} from '../payments/dto/payments.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Obter resumo do painel administrativo',
    description:
      'Retorna estatísticas gerais da plataforma, usuários recentes e atividades',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumo do dashboard retornado com sucesso',
    type: DashboardSummaryResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async getDashboard(): Promise<DashboardSummaryResponseDto> {
    return this.adminService.getDashboardSummary();
  }

  @Get('users')
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número da página (padrão: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Itens por página (padrão: 20)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Busca por nome ou email',
  })
  @ApiQuery({
    name: 'userType',
    required: false,
    enum: ['student', 'personal', 'admin'],
    description: 'Filtro por tipo de usuário',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'suspended'],
    description: 'Filtro por status',
  })
  @ApiQuery({
    name: 'isVerified',
    required: false,
    type: Boolean,
    description: 'Filtro por verificação (true/false)',
  })
  @ApiOperation({
    summary: 'Listar usuários da plataforma',
    description: 'Retorna lista paginada de usuários com filtros e busca',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários retornada com sucesso',
    type: UserListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('userType') userType?: string,
    @Query('status') status?: string,
    @Query('isVerified') isVerified?: string,
  ): Promise<UserListResponseDto> {
    const filters = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      userType,
      status,
      isVerified: isVerified === 'true' ? true : isVerified === 'false' ? false : undefined,
    };
    return this.adminService.listUsers(filters);
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Obter detalhes de um usuário',
    description: 'Retorna informações completas de um usuário específico',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do usuário',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes do usuário retornados com sucesso',
    type: UserItemDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async getUserById(@Param('id') id: string): Promise<any> {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id')
  @ApiOperation({
    summary: 'Atualizar informações do usuário',
    description:
      'Permite atualizar status, verificação e notas administrativas de um usuário',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do usuário a ser atualizado',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuário atualizado com sucesso',
    type: UserItemDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserItemDto> {
    return this.adminService.updateUser(id, body);
  }

  // ===== FINANCIAL =====
  @Get('financial')
  @ApiOperation({
    summary: 'Obter resumo financeiro',
    description:
      'Retorna estatísticas financeiras da plataforma, receitas e transações recentes',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumo financeiro retornado com sucesso',
    type: FinancialSummaryResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async getFinancialSummary(): Promise<FinancialSummaryResponseDto> {
    return this.adminService.getFinancialSummary();
  }

  // ===== MISSIONS (Gamification) =====
  @Get('missions')
  @ApiOperation({
    summary: 'Listar missões de gamificação',
    description: 'Retorna lista de todas as missões disponíveis na plataforma',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de missões retornada com sucesso',
    type: [MissionListResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async listMissions(): Promise<MissionListResponseDto[]> {
    return this.adminService.listMissions();
  }

  @Put('missions/:id')
  @ApiOperation({
    summary: 'Atualizar missão de gamificação',
    description: 'Permite atualizar informações de uma missão específica',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da missão a ser atualizada',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Missão atualizada com sucesso',
    type: MissionListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  @ApiResponse({
    status: 404,
    description: 'Missão não encontrada',
  })
  async updateMission(
    @Param('id') id: string,
    @Body() body: UpdateMissionDto,
  ): Promise<MissionListResponseDto> {
    return this.adminService.updateMission(id, body);
  }

  // ===== ANALYTICS =====
  @Get('analytics')
  @ApiOperation({
    summary: 'Obter análises da plataforma',
    description:
      'Retorna métricas agregadas de usuários, propostas, aulas e pagamentos',
  })
  @ApiResponse({
    status: 200,
    description: 'Análises retornadas com sucesso',
    type: AnalyticsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async getAnalytics(): Promise<AnalyticsResponseDto> {
    return this.adminService.getAnalytics();
  }

  @Get('charts')
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Número de dias para buscar dados (padrão: 30)',
  })
  @ApiOperation({
    summary: 'Obter dados para gráficos',
    description:
      'Retorna dados de séries temporais para gráficos: receita, atividade de aulas e cadastros',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados de gráficos retornados com sucesso',
    schema: {
      type: 'object',
      properties: {
        revenue: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              revenue: { type: 'number' },
            },
          },
        },
        classesActivity: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              scheduled: { type: 'number' },
              pending_confirmation: { type: 'number' },
              active: { type: 'number' },
              completed: { type: 'number' },
              cancelled: { type: 'number' },
              no_show_dispute: { type: 'number' },
            },
          },
        },
        registrations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              count: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async getChartsData(@Query('days') days?: string): Promise<any> {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.adminService.getChartsData(daysNum);
  }

  // ===== ENDPOINTS DE TRANSFERÊNCIA REAL =====

  @Get('withdrawals/pending')
  @ApiOperation({
    summary: 'Listar solicitações de saque pendentes',
    description:
      'Retorna todas as solicitações de saque que aguardam aprovação administrativa',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de saques pendentes retornada com sucesso',
    type: [WithdrawalResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async getPendingWithdrawals(): Promise<WithdrawalResponseDto[]> {
    return this.paymentsService.getPendingWithdrawals();
  }

  @Post('withdrawals/:id/approve')
  @ApiOperation({
    summary: 'Aprovar solicitação de saque',
    description:
      'Aprova uma solicitação de saque e processa a transferência real para o personal trainer',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da solicitação de saque',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Saque aprovado e transferência processada com sucesso',
    type: WithdrawalResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou erro na transferência',
  })
  @ApiResponse({
    status: 404,
    description: 'Solicitação de saque não encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async approveWithdrawal(
    @Param('id') id: string,
    @Body() approveDto: ApproveWithdrawalDto,
    @Request() req: any,
  ): Promise<WithdrawalResponseDto> {
    approveDto.withdrawalId = id;
    return this.paymentsService.approveWithdrawal(approveDto, req.user.sub);
  }

  @Post('withdrawals/:id/reject')
  @ApiOperation({
    summary: 'Rejeitar solicitação de saque',
    description:
      'Rejeita uma solicitação de saque e devolve o saldo para a carteira do personal',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da solicitação de saque',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Saque rejeitado com sucesso',
    type: WithdrawalResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Solicitação de saque não encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async rejectWithdrawal(
    @Param('id') id: string,
    @Body() rejectDto: RejectWithdrawalDto,
    @Request() req: any,
  ): Promise<WithdrawalResponseDto> {
    rejectDto.withdrawalId = id;
    return this.paymentsService.rejectWithdrawal(rejectDto, req.user.sub);
  }

  @Get('withdrawals/stats')
  @ApiOperation({
    summary: 'Obter estatísticas de saques',
    description: 'Retorna estatísticas detalhadas sobre saques processados',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas de saques retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalWithdrawals: {
          type: 'number',
          example: 150,
          description: 'Total de saques processados',
        },
        totalAmount: {
          type: 'number',
          example: 50000.0,
          description: 'Valor total transferido',
        },
        pendingWithdrawals: {
          type: 'number',
          example: 5,
          description: 'Saques pendentes',
        },
        approvedWithdrawals: {
          type: 'number',
          example: 140,
          description: 'Saques aprovados',
        },
        rejectedWithdrawals: {
          type: 'number',
          example: 5,
          description: 'Saques rejeitados',
        },
        averageWithdrawal: {
          type: 'number',
          example: 333.33,
          description: 'Valor médio por saque',
        },
        monthlyWithdrawals: {
          type: 'number',
          example: 25,
          description: 'Saques no mês atual',
        },
        monthlyAmount: {
          type: 'number',
          example: 8500.0,
          description: 'Valor transferido no mês',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido ou expirado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - apenas administradores',
  })
  async getWithdrawalStats(): Promise<any> {
    // TODO: Implementar estatísticas de saques
    return {
      totalWithdrawals: 0,
      totalAmount: 0,
      pendingWithdrawals: 0,
      approvedWithdrawals: 0,
      rejectedWithdrawals: 0,
      averageWithdrawal: 0,
      monthlyWithdrawals: 0,
      monthlyAmount: 0,
    };
  }
}
