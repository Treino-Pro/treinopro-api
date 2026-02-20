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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClassesService } from './classes.service';
import { ClassesCleanupService } from './classes-cleanup.service';
import {
  CreateClassDto,
  UpdateClassDto,
  GetClassesDto,
  ClassResponseDto,
  ClassStatsDto,
  StartClassDto,
  CompleteClassDto,
  ConfirmClassStartDto,
  ReportNoShowDto,
  ResolveNoShowDisputeDto,
  ClassTimelineDto,
  ClassDisputeDto,
  DisputeDefenseDto,
  PresenceSnapshotDto,
  GetDisputesQueryDto,
} from './dto/classes.dto';

@ApiTags('Classes')
@Controller('classes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly classesCleanupService: ClassesCleanupService,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Criar nova aula' })
  @ApiResponse({
    status: 201,
    description: 'Aula criada com sucesso',
    type: ClassResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async createClass(
    @Body() createClassDto: CreateClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.createClass(createClassDto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar aulas com filtros' })
  @ApiResponse({
    status: 200,
    description: 'Lista de aulas retornada com sucesso',
    schema: {
      type: 'object',
      properties: {
        classes: {
          type: 'array',
          items: { $ref: '#/components/schemas/ClassResponseDto' },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async getClasses(
    @Query() getClassesDto: GetClassesDto,
    @Request() req: any,
  ): Promise<{
    classes: ClassResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.classesService.getClasses(getClassesDto, req.user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas das aulas' })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas retornadas com sucesso',
    type: ClassStatsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async getClassStats(@Request() req: any): Promise<ClassStatsDto> {
    return this.classesService.getClassStats(req.user.sub);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Listar disputas do usuário' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'resolved', 'all'], description: 'Filtro de status' })
  @ApiResponse({
    status: 200,
    description: 'Disputas listadas com sucesso',
    type: [ClassDisputeDto],
  })
  async getClassDisputes(
    @Query() queryDto: GetDisputesQueryDto,
    @Request() req: any,
  ): Promise<any[]> {
    return this.classesService.getClassDisputes(req.user.sub, queryDto.status);
  }

  @Get('disputes/:disputeId')
  @ApiOperation({ summary: 'Obter disputa por ID (= classId)' })
  @ApiParam({ name: 'disputeId', description: 'ID da disputa (= ID da aula)' })
  @ApiResponse({ status: 200, description: 'Disputa encontrada', type: ClassDisputeDto })
  @ApiResponse({ status: 404, description: 'Disputa não encontrada' })
  async getClassDisputeById(
    @Param('disputeId') disputeId: string,
    @Request() req: any,
  ): Promise<any> {
    return this.classesService.getClassDisputeById(disputeId, req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter aula por ID' })
  @ApiParam({ name: 'id', description: 'ID da aula' })
  @ApiResponse({
    status: 200,
    description: 'Aula encontrada com sucesso',
    type: ClassResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Aula não encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async getClassById(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.getClassById(id, req.user.sub);
  }

  @Put(':id')
  async updateClass(
    @Param('id') id: string,
    @Body() updateClassDto: UpdateClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.updateClass(id, updateClassDto, req.user.sub);
  }

  @Post(':id/start')
  async startClass(
    @Param('id') id: string,
    @Body() startClassDto: StartClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.startClass(id, startClassDto, req.user.sub);
  }

  @Post(':id/complete')
  async completeClass(
    @Param('id') id: string,
    @Body() completeClassDto: CompleteClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.completeClass(
      id,
      completeClassDto,
      req.user.sub,
    );
  }

  @Post(':id/test-completion')
  @UseGuards(JwtAuthGuard)
  async testClassCompletion(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.sub;
    console.log(
      `🧪 [TEST_COMPLETION] Testando finalização completa para aula ${id}`,
    );

    try {
      const completeClassDto = {
        notes: 'Teste de finalização completa',
      };

      const result = await this.classesService.completeClass(
        id,
        completeClassDto,
        userId,
      );

      return {
        success: true,
        message: 'Aula finalizada com sucesso - XP e repasse processados',
        class: result,
        classId: id,
        userId: userId,
      };
    } catch (error) {
      console.error(`❌ [TEST_COMPLETION] Erro ao finalizar aula:`, error);
      throw new BadRequestException(`Erro ao finalizar aula: ${error.message}`);
    }
  }

  @Post(':id/cancel')
  async cancelClass(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.cancelClass(id, req.user.sub);
  }

  @Get(':id/timeline')
  async getClassTimeline(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ClassTimelineDto> {
    return this.classesService.getClassTimeline(id, req.user.sub);
  }

  @Post(':id/confirm-start')
  async confirmClassStart(
    @Param('id') id: string,
    @Body() confirmDto: ConfirmClassStartDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.confirmClassStart(id, confirmDto, req.user.sub);
  }

  @Post(':id/timer-expired')
  async completeClassByTimerExpiration(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.completeClassByTimerExpiration(id);
  }

  @Post(':id/report-no-show')
  async reportNoShow(
    @Param('id') id: string,
    @Body() reportDto: ReportNoShowDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.reportNoShow(id, reportDto, req.user.sub);
  }

  @Post(':id/report-personal-no-show')
  async reportPersonalNoShow(
    @Param('id') id: string,
    @Body() reportDto: ReportNoShowDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.reportPersonalNoShow(
      id,
      reportDto,
      req.user.sub,
    );
  }

  @Post(':id/resolve-dispute')
  async resolveNoShowDispute(
    @Param('id') id: string,
    @Body() resolveDto: ResolveNoShowDisputeDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.resolveNoShowDispute(
      id,
      resolveDto,
      req.user.sub,
    );
  }

  @Post(':id/dispute-defense')
  @ApiOperation({ summary: 'Enviar defesa (replica) na disputa' })
  @ApiParam({ name: 'id', description: 'ID da aula em disputa' })
  @ApiResponse({ status: 200, description: 'Defesa registrada com sucesso', type: ClassResponseDto })
  @ApiResponse({ status: 400, description: 'Prazo expirado ou aula não está em disputa' })
  @ApiResponse({ status: 403, description: 'Apenas a parte reportada pode enviar defesa' })
  async submitDisputeDefense(
    @Param('id') id: string,
    @Body() defenseDto: DisputeDefenseDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.submitDisputeDefense(id, defenseDto, req.user.sub);
  }

  @Post(':id/presence-snapshot')
  @ApiOperation({ summary: 'Registrar snapshot de geolocalização de presença (1x por participante)' })
  @ApiParam({ name: 'id', description: 'ID da aula' })
  @ApiResponse({ status: 200, description: 'Snapshot registrado (ou existente retornado)' })
  async createPresenceSnapshot(
    @Param('id') id: string,
    @Body() snapshotDto: PresenceSnapshotDto,
    @Request() req: any,
  ): Promise<any> {
    return this.classesService.createPresenceSnapshot(id, snapshotDto, req.user.sub);
  }

  @Post(':id/cleanup')
  @ApiOperation({ summary: 'Limpar aula expirada manualmente' })
  @ApiParam({ name: 'id', description: 'ID da aula' })
  @ApiResponse({
    status: 200,
    description: 'Aula limpa com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Aula não encontrada',
  })
  @ApiResponse({
    status: 400,
    description: 'Aula ainda não expirou',
  })
  async cleanupExpiredClass(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{ message: string; classId: string }> {
    await this.classesCleanupService.cleanupSpecificClass(id);
    return {
      message: 'Aula expirada limpa com sucesso',
      classId: id,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar aula (temporário para limpeza)' })
  @ApiParam({ name: 'id', description: 'ID da aula' })
  @ApiResponse({
    status: 200,
    description: 'Aula deletada com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Aula não encontrada',
  })
  async deleteClass(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{ message: string; classId: string }> {
    await this.classesService.deleteClass(id, req.user.sub);
    return {
      message: 'Aula deletada com sucesso',
      classId: id,
    };
  }
}
