import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateCrefDto {
  @ApiProperty({ 
    example: 'SP-106227',
    description: 'Número do CREF no formato UF-NÚMERO (ex: SP-106227)'
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2}-\d{6}$/, {
    message: 'Formato de CREF inválido. Use: UF-NÚMERO (ex: SP-106227)'
  })
  crefNumber: string;
}

export class CrefValidationResponseDto {
  @ApiProperty({ example: true })
  isValid: boolean;

  @ApiProperty({ example: 'SP-106227' })
  crefNumber: string;

  @ApiProperty({ example: 'João Silva', required: false })
  nome?: string;

  @ApiProperty({ example: 'BACHAREL', required: false })
  situacao?: string;

  @ApiProperty({ example: 'SP', required: false })
  uf?: string;

  @ApiProperty({ example: '2024-12-09T10:30:00.000Z' })
  validatedAt: Date;

  @ApiProperty({ example: 'Validação bem-sucedida' })
  details: string;
}
