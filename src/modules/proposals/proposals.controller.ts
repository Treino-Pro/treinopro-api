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
  ParseUUIDPipe
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { ProposalsService } from './proposals.service';
import { 
  CreateProposalDto, 
  UpdateProposalDto, 
  ProposalQueryDto, 
  ProposalResponseDto, 
  ProposalListResponseDto 
} from './dto/proposals.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Proposals')
@Controller('proposals')
@ApiBearerAuth()
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Criar nova proposta de treino',
    description: 'Permite que um aluno crie uma nova proposta de treino'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Proposta criada com sucesso',
    type: ProposalResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou data no passado'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Apenas alunos podem criar propostas'
  })
  async createProposal(
    @Body() createProposalDto: CreateProposalDto,
    @Request() req: any
  ): Promise<ProposalResponseDto> {
    console.log('📝 [PROPOSALS CONTROLLER] ===== INÍCIO DA CRIAÇÃO DE PROPOSTA =====');
    console.log('📝 [PROPOSALS CONTROLLER] Dados recebidos:', JSON.stringify(createProposalDto, null, 2));
    console.log('📝 [PROPOSALS CONTROLLER] User do request:', JSON.stringify(req.user, null, 2));
    console.log('📝 [PROPOSALS CONTROLLER] User ID:', req.user?.sub);
    
    try {
      const result = await this.proposalsService.createProposal(createProposalDto, req.user.sub);
      console.log('✅ [PROPOSALS CONTROLLER] Proposta criada com sucesso:', JSON.stringify(result, null, 2));
      console.log('📝 [PROPOSALS CONTROLLER] ===== CRIAÇÃO CONCLUÍDA COM SUCESSO =====');
      return result;
    } catch (error) {
      console.log('❌ [PROPOSALS CONTROLLER] Erro ao criar proposta:', error.message);
      console.log('❌ [PROPOSALS CONTROLLER] Stack trace:', error.stack);
      console.log('📝 [PROPOSALS CONTROLLER] ===== CRIAÇÃO FALHOU =====');
      throw error;
    }
  }

  @Get()
  @ApiOperation({ 
    summary: 'Listar propostas',
    description: 'Lista propostas com filtros e paginação. Alunos veem suas propostas, personal trainers veem propostas pendentes'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de propostas retornada com sucesso',
    type: ProposalListResponseDto
  })
  @ApiQuery({ name: 'page', required: false, description: 'Página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Itens por página (padrão: 10)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status' })
  @ApiQuery({ name: 'modality', required: false, description: 'Filtrar por modalidade' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Data mínima (ISO string)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Data máxima (ISO string)' })
  async getProposals(
    @Query() query: ProposalQueryDto,
    @Request() req: any
  ): Promise<ProposalListResponseDto> {
    return this.proposalsService.getProposals(query, req.user.sub, req.user.userType);
  }

  @Get('my')
  @ApiOperation({ 
    summary: 'Listar minhas propostas',
    description: 'Lista apenas as propostas do usuário logado (aluno)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de propostas do usuário retornada com sucesso',
    type: ProposalListResponseDto
  })
  async getMyProposals(
    @Query() query: ProposalQueryDto,
    @Request() req: any
  ): Promise<ProposalListResponseDto> {
    // Forçar que apenas o usuário veja suas próprias propostas
    const userQuery = { ...query };
    return this.proposalsService.getProposals(userQuery, req.user.sub, 'student');
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Estatísticas das propostas',
    description: 'Retorna estatísticas das propostas do usuário'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas retornadas com sucesso'
  })
  async getProposalStats(@Request() req: any) {
    return this.proposalsService.getProposalStats(req.user.sub, req.user.userType);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obter proposta por ID',
    description: 'Retorna os detalhes de uma proposta específica'
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({ 
    status: 200, 
    description: 'Proposta encontrada com sucesso',
    type: ProposalResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Proposta não encontrada'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Sem permissão para visualizar esta proposta'
  })
  async getProposalById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any
  ): Promise<ProposalResponseDto> {
    return this.proposalsService.getProposalById(id, req.user.sub, req.user.userType);
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Atualizar proposta',
    description: 'Atualiza uma proposta existente'
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({ 
    status: 200, 
    description: 'Proposta atualizada com sucesso',
    type: ProposalResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Proposta não encontrada'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Sem permissão para editar esta proposta'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Proposta não pode ser editada'
  })
  async updateProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProposalDto: UpdateProposalDto,
    @Request() req: any
  ): Promise<ProposalResponseDto> {
    return this.proposalsService.updateProposal(id, updateProposalDto, req.user.sub, req.user.userType);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Cancelar proposta',
    description: 'Cancela uma proposta existente'
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({ 
    status: 200, 
    description: 'Proposta cancelada com sucesso',
    type: ProposalResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Proposta não encontrada'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Sem permissão para cancelar esta proposta'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Proposta não pode ser cancelada'
  })
  async cancelProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any
  ): Promise<ProposalResponseDto> {
    return this.proposalsService.cancelProposal(id, req.user.sub, req.user.userType);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Aceitar proposta',
    description: 'Permite que um personal trainer aceite uma proposta pendente'
  })
  @ApiParam({ name: 'id', description: 'ID da proposta' })
  @ApiResponse({ 
    status: 200, 
    description: 'Proposta aceita com sucesso',
    type: ProposalResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Proposta não encontrada'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Proposta não pode ser aceita'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Apenas personal trainers podem aceitar propostas'
  })
  async acceptProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any
  ): Promise<ProposalResponseDto> {
    // Verificar se o usuário é um personal trainer
    if (req.user.userType !== 'personal') {
      throw new Error('Apenas personal trainers podem aceitar propostas');
    }
    
    return this.proposalsService.acceptProposal(id, req.user.sub);
  }
}
