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
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HealthQuestionnaireService } from './health-questionnaire.service';
import {
  CreateHealthQuestionnaireDto,
  UpdateHealthQuestionnaireDto,
  HealthQuestionnaireResponseDto,
  HealthQuestionnaireListResponseDto,
  StudentHealthQuestionnaireDto,
} from './dto/health-questionnaire.dto';

@ApiTags('Health Questionnaire')
@Controller('health-questionnaire')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HealthQuestionnaireController {
  constructor(private readonly healthQuestionnaireService: HealthQuestionnaireService) {}

  /**
   * Criar ou atualizar questionário de saúde do usuário
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar ou atualizar questionário de saúde' })
  @ApiResponse({ 
    status: 201, 
    description: 'Questionário criado/atualizado com sucesso',
    type: HealthQuestionnaireResponseDto
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async createOrUpdateQuestionnaire(
    @Request() req: any,
    @Body() dto: CreateHealthQuestionnaireDto
  ): Promise<HealthQuestionnaireResponseDto> {
    const userId = req.user.sub;
    console.log(`🏥 [HEALTH_CONTROLLER] Criando/atualizando questionário para usuário: ${userId}`);
    
    return this.healthQuestionnaireService.createOrUpdateQuestionnaire(userId, dto);
  }

  /**
   * Obter questionário de saúde do usuário
   */
  @Get('me')
  @ApiOperation({ summary: 'Obter questionário de saúde do usuário logado' })
  @ApiResponse({ 
    status: 200, 
    description: 'Questionário encontrado',
    type: HealthQuestionnaireResponseDto
  })
  @ApiResponse({ status: 404, description: 'Questionário não encontrado' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async getMyQuestionnaire(@Request() req: any): Promise<HealthQuestionnaireResponseDto> {
    const userId = req.user.sub;
    console.log(`🏥 [HEALTH_CONTROLLER] Buscando questionário do usuário: ${userId}`);
    
    const result = await this.healthQuestionnaireService.getQuestionnaireByUserId(userId);
    
    if (!result) {
      throw new NotFoundException('Questionário de saúde não encontrado');
    }
    
    return result;
  }

  /**
   * Verificar se questionário foi completado
   */
  @Get('me/status')
  @ApiOperation({ summary: 'Verificar se questionário foi completado' })
  @ApiResponse({ 
    status: 200, 
    description: 'Status do questionário',
    schema: {
      type: 'object',
      properties: {
        isCompleted: { type: 'boolean' },
        hasQuestionnaire: { type: 'boolean' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async getQuestionnaireStatus(@Request() req: any) {
    const userId = req.user.sub;
    console.log(`🏥 [HEALTH_CONTROLLER] Verificando status do questionário do usuário: ${userId}`);
    
    const questionnaire = await this.healthQuestionnaireService.getQuestionnaireByUserId(userId);
    const isCompleted = await this.healthQuestionnaireService.isQuestionnaireCompleted(userId);
    
    return {
      isCompleted,
      hasQuestionnaire: !!questionnaire,
    };
  }

  /**
   * Listar questionários de saúde dos alunos (para personal trainers)
   */
  @Get('students')
  @ApiOperation({ summary: 'Listar questionários de saúde dos alunos' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página atual' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de questionários dos alunos',
    type: HealthQuestionnaireListResponseDto
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Acesso negado - apenas personal trainers' })
  async getStudentQuestionnaires(
    @Request() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<HealthQuestionnaireListResponseDto> {
    const personalTrainerId = req.user.sub;
    const userType = req.user.userType;
    
    console.log(`🏥 [HEALTH_CONTROLLER] Listando questionários dos alunos para personal: ${personalTrainerId}`);
    
    // Verificar se é personal trainer
    if (userType !== 'personal') {
      throw new ForbiddenException('Apenas personal trainers podem acessar esta funcionalidade');
    }
    
    return this.healthQuestionnaireService.getStudentQuestionnaires(
      personalTrainerId, 
      page, 
      limit
    );
  }

  /**
   * Obter questionário específico de um aluno (para personal trainer)
   */
  @Get('students/:studentId')
  @ApiOperation({ summary: 'Obter questionário de saúde de um aluno específico' })
  @ApiParam({ name: 'studentId', description: 'ID do aluno' })
  @ApiResponse({ 
    status: 200, 
    description: 'Questionário do aluno encontrado',
    type: StudentHealthQuestionnaireDto
  })
  @ApiResponse({ status: 404, description: 'Questionário não encontrado' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Acesso negado - apenas personal trainers' })
  async getStudentQuestionnaire(
    @Request() req: any,
    @Param('studentId', ParseUUIDPipe) studentId: string
  ): Promise<StudentHealthQuestionnaireDto | null> {
    const personalTrainerId = req.user.sub;
    const userType = req.user.userType;
    
    console.log(`🏥 [HEALTH_CONTROLLER] Buscando questionário do aluno ${studentId} para personal ${personalTrainerId}`);
    
    // Verificar se é personal trainer
    if (userType !== 'personal') {
      throw new ForbiddenException('Apenas personal trainers podem acessar esta funcionalidade');
    }
    
    return this.healthQuestionnaireService.getStudentQuestionnaire(personalTrainerId, studentId);
  }

  /**
   * Deletar questionário de saúde do usuário
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar questionário de saúde' })
  @ApiParam({ name: 'id', description: 'ID do questionário' })
  @ApiResponse({ status: 204, description: 'Questionário deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Questionário não encontrado' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async deleteQuestionnaire(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) questionnaireId: string
  ): Promise<void> {
    const userId = req.user.sub;
    console.log(`🏥 [HEALTH_CONTROLLER] Deletando questionário ${questionnaireId} do usuário ${userId}`);
    
    await this.healthQuestionnaireService.deleteQuestionnaire(userId, questionnaireId);
  }
}
