import { IsString, IsNotEmpty, Matches, IsOptional, IsIn } from 'class-validator';
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

  @ApiProperty({ 
    example: 'personal',
    description: 'Tipo de usuário (personal ou student)',
    required: false,
    enum: ['personal', 'student']
  })
  @IsOptional()
  @IsIn(['personal', 'student'], {
    message: 'userType deve ser "personal" ou "student"'
  })
  userType?: 'personal' | 'student';
}

export class CrefValidationResponseDto {
  @ApiProperty({ example: true })
  isValid: boolean;

  @ApiProperty({ example: 'SP-106227' })
  crefNumber: string;

  @ApiProperty({ example: 'João Silva', required: false })
  nome?: string;

  @ApiProperty({ example: 'BACHAREL', required: false })
  categoria?: string;

  @ApiProperty({ example: 'LICENCIADO/BACHAREL', required: false })
  naturezaTitulo?: string;

  @ApiProperty({ example: 'SP', required: false })
  uf?: string;

  @ApiProperty({ example: '2024-12-09T10:30:00.000Z' })
  validatedAt: Date;

  @ApiProperty({ example: 'Validação bem-sucedida' })
  details: string;
}
