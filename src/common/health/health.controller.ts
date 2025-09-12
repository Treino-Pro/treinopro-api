import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check da API' })
  @ApiResponse({ status: 200, description: 'API funcionando corretamente' })
  check() {
    return {
      status: 'ok',
      message: 'TreinoPRO API está funcionando!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }
}
