import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportService } from './support.service';
import { ReportProblemDto } from './dto/support.dto';

@ApiTags('Support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('report-problem')
  @ApiOperation({
    summary: 'Reportar problema',
    description: 'Envia um reporte de problema para o suporte via email',
  })
  @ApiResponse({
    status: 201,
    description: 'Problema reportado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example:
            'Problema reportado com sucesso! Nossa equipe entrará em contato em breve.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Token inválido',
  })
  async reportProblem(
    @Request() req: any,
    @Body(ValidationPipe) reportData: ReportProblemDto,
  ) {
    console.log('🔍 [SUPPORT] Endpoint /support/report-problem chamado');
    console.log('🔍 [SUPPORT] Dados recebidos:', reportData);

    const user = req.user;
    console.log('🔍 [SUPPORT] Usuário completo:', user);
    console.log('🔍 [SUPPORT] firstName:', user.firstName);
    console.log('🔍 [SUPPORT] lastName:', user.lastName);
    console.log('🔍 [SUPPORT] email:', user.email);
    console.log('🔍 [SUPPORT] userType:', user.userType);
    console.log('🔍 [SUPPORT] document:', user.document);
    console.log('🔍 [SUPPORT] cref:', user.cref);

    const fullName =
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Usuário';
    console.log('🔍 [SUPPORT] fullName construído:', fullName);

    return await this.supportService.reportProblem(
      user.id,
      user.email,
      fullName,
      user.userType,
      reportData,
      user.document,
      user.cref,
    );
  }
}
