import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportProblemDto {
  @ApiProperty({
    description: 'Título do problema',
    example: 'Problema com o pagamento',
    minLength: 5,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Título deve ter pelo menos 5 caracteres' })
  @MaxLength(100, { message: 'Título deve ter no máximo 100 caracteres' })
  title: string;

  @ApiProperty({
    description: 'Descrição detalhada do problema',
    example:
      'Estou enfrentando dificuldades para realizar o pagamento da aula. O sistema não está processando minha transação.',
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Descrição deve ter pelo menos 10 caracteres' })
  @MaxLength(1000, { message: 'Descrição deve ter no máximo 1000 caracteres' })
  description: string;
}
