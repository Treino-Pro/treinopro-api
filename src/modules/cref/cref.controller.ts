import { Controller, Post, Body, Get, Query, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CrefService } from './cref.service';
import { CrefCacheService } from './cref-cache.service';
import { CrefQueueService } from './cref-queue.service';
import { ValidateCrefDto, CrefValidationResponseDto } from './dto/cref.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('CREF Validation')
@Controller('cref')
export class CrefController {
  constructor(
    private readonly crefService: CrefService,
    private readonly crefCacheService: CrefCacheService,
    private readonly crefQueueService: CrefQueueService,
  ) {}

  @Post('validate')
  @Public()
  @ApiOperation({
    summary: 'Validar CREF',
    description:
      'Valida um número de CREF no formato UF-NÚMERO (ex: SP-106227)',
  })
  @ApiResponse({
    status: 200,
    description: 'Validação realizada com sucesso',
    type: CrefValidationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Formato inválido ou CREF não encontrado',
  })
  async validateCref(
    @Body() validateCrefDto: ValidateCrefDto,
  ): Promise<CrefValidationResponseDto> {
    return this.crefService.validateCref(validateCrefDto.crefNumber);
  }

  @Get('parse')
  @ApiOperation({
    summary: 'Parsear CREF',
    description:
      'Converte CREF no formato UF-NÚMERO em objeto com UF e número separados',
  })
  @ApiResponse({
    status: 200,
    description: 'CREF parseado com sucesso',
  })
  async parseCref(@Query('cref') cref: string) {
    return this.crefService.parseCrefNumber(cref);
  }

  @Get('cache/health')
  @ApiOperation({
    summary: 'Health Check do Cache',
    description: 'Verifica se o cache Redis está funcionando corretamente',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do cache',
  })
  async cacheHealth() {
    const isHealthy = await this.crefCacheService.healthCheck();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('cache/stats')
  @ApiOperation({
    summary: 'Estatísticas do Cache',
    description: 'Retorna estatísticas de uso do cache',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas do cache',
  })
  async cacheStats() {
    return await this.crefCacheService.getStats();
  }

  @Delete('cache/:crefNumber')
  @ApiOperation({
    summary: 'Remover CREF do Cache',
    description: 'Remove uma validação específica do cache',
  })
  @ApiResponse({
    status: 200,
    description: 'CREF removido do cache com sucesso',
  })
  async removeFromCache(@Query('crefNumber') crefNumber: string) {
    await this.crefCacheService.delete(crefNumber);
    return { message: `CREF ${crefNumber} removido do cache` };
  }

  @Delete('cache')
  @ApiOperation({
    summary: 'Limpar Cache',
    description: 'Remove todas as validações do cache',
  })
  @ApiResponse({
    status: 200,
    description: 'Cache limpo com sucesso',
  })
  async clearCache() {
    await this.crefCacheService.clear();
    return { message: 'Cache limpo com sucesso' };
  }

  // ===== ENDPOINTS DA FILA =====

  @Post('queue/validate')
  @ApiOperation({
    summary: 'Adicionar Validação à Fila',
    description:
      'Adiciona uma validação CREF à fila de processamento assíncrono',
  })
  @ApiResponse({
    status: 201,
    description: 'Validação adicionada à fila com sucesso',
  })
  async addToQueue(@Body() validateCrefDto: ValidateCrefDto) {
    const job = await this.crefQueueService.addValidationJob(
      validateCrefDto.crefNumber,
      validateCrefDto.userType || 'personal',
      'normal',
    );

    return {
      message: 'Validação adicionada à fila',
      jobId: job.id,
      crefNumber: validateCrefDto.crefNumber,
      status: 'queued',
    };
  }

  @Get('queue/stats')
  @ApiOperation({
    summary: 'Estatísticas da Fila',
    description: 'Retorna estatísticas da fila de validações CREF',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas da fila',
  })
  async getQueueStats() {
    return await this.crefQueueService.getQueueStats();
  }

  @Get('queue/jobs')
  @ApiOperation({
    summary: 'Listar Jobs da Fila',
    description: 'Lista jobs por status (waiting, active, completed, failed)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de jobs',
  })
  async getQueueJobs(
    @Query('status')
    status: 'waiting' | 'active' | 'completed' | 'failed' = 'waiting',
  ) {
    const jobs = await this.crefQueueService.getJobsByStatus(status);
    return {
      status,
      count: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        data: job.data,
        progress: job.progress(),
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      })),
    };
  }

  @Delete('queue/clear')
  @ApiOperation({
    summary: 'Limpar Fila',
    description: 'Remove todos os jobs da fila',
  })
  @ApiResponse({
    status: 200,
    description: 'Fila limpa com sucesso',
  })
  async clearQueue() {
    await this.crefQueueService.clearQueue();
    return { message: 'Fila limpa com sucesso' };
  }

  @Post('queue/pause')
  @ApiOperation({
    summary: 'Pausar Fila',
    description: 'Pausa o processamento da fila',
  })
  @ApiResponse({
    status: 200,
    description: 'Fila pausada com sucesso',
  })
  async pauseQueue() {
    await this.crefQueueService.pauseQueue();
    return { message: 'Fila pausada com sucesso' };
  }

  @Post('queue/resume')
  @ApiOperation({
    summary: 'Retomar Fila',
    description: 'Retoma o processamento da fila',
  })
  @ApiResponse({
    status: 200,
    description: 'Fila retomada com sucesso',
  })
  async resumeQueue() {
    await this.crefQueueService.resumeQueue();
    return { message: 'Fila retomada com sucesso' };
  }

  @Delete('queue/job/:jobId')
  @ApiOperation({
    summary: 'Remover Job da Fila',
    description: 'Remove um job específico da fila',
  })
  @ApiResponse({
    status: 200,
    description: 'Job removido com sucesso',
  })
  async removeJob(@Query('jobId') jobId: string) {
    await this.crefQueueService.removeJob(jobId);
    return { message: `Job ${jobId} removido com sucesso` };
  }
}
