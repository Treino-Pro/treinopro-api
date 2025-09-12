import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CrefService } from './cref.service';
import { ValidateCrefDto, CrefValidationResponseDto } from './dto/cref.dto';

@ApiTags('CREF Validation')
@Controller('cref')
export class CrefController {
  constructor(private readonly crefService: CrefService) {}

  @Post('validate')
  @ApiOperation({ 
    summary: 'Validar CREF',
    description: 'Valida um número de CREF no formato UF-NÚMERO (ex: SP-106227)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Validação realizada com sucesso',
    type: CrefValidationResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Formato inválido ou CREF não encontrado'
  })
  async validateCref(@Body() validateCrefDto: ValidateCrefDto): Promise<CrefValidationResponseDto> {
    return this.crefService.validateCref(validateCrefDto.crefNumber);
  }

  @Get('parse')
  @ApiOperation({ 
    summary: 'Parsear CREF',
    description: 'Converte CREF no formato UF-NÚMERO em objeto com UF e número separados'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'CREF parseado com sucesso'
  })
  async parseCref(@Query('cref') cref: string) {
    return this.crefService.parseCrefNumber(cref);
  }
}
