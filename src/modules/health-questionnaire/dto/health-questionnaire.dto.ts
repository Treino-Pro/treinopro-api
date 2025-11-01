import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';

export class CreateHealthQuestionnaireDto {
  @ApiPropertyOptional({
    example: 'Hipertensão',
    description: 'Condição médica preexistente',
  })
  @IsOptional()
  @IsString()
  medicalCondition?: string;

  @ApiPropertyOptional({
    example: 'Sim, regularmente',
    description: 'Medicamentos regulares',
  })
  @IsOptional()
  @IsString()
  regularMedication?: string;

  @ApiPropertyOptional({
    example: 'Lesão no joelho',
    description: 'Lesões ou dores crônicas',
  })
  @IsOptional()
  @IsString()
  chronicInjury?: string;

  @ApiPropertyOptional({
    example: 'Perda de peso',
    description: 'Objetivo principal do treino',
  })
  @IsOptional()
  @IsString()
  trainingGoal?: string;

  @ApiPropertyOptional({
    example: 'Vegetariano',
    description: 'Restrições alimentares ou alergias',
  })
  @IsOptional()
  @IsString()
  dietaryRestrictions?: string;
}

export class UpdateHealthQuestionnaireDto {
  @ApiPropertyOptional({
    example: 'Hipertensão',
    description: 'Condição médica preexistente',
  })
  @IsOptional()
  @IsString()
  medicalCondition?: string;

  @ApiPropertyOptional({
    example: 'Sim, regularmente',
    description: 'Medicamentos regulares',
  })
  @IsOptional()
  @IsString()
  regularMedication?: string;

  @ApiPropertyOptional({
    example: 'Lesão no joelho',
    description: 'Lesões ou dores crônicas',
  })
  @IsOptional()
  @IsString()
  chronicInjury?: string;

  @ApiPropertyOptional({
    example: 'Perda de peso',
    description: 'Objetivo principal do treino',
  })
  @IsOptional()
  @IsString()
  trainingGoal?: string;

  @ApiPropertyOptional({
    example: 'Vegetariano',
    description: 'Restrições alimentares ou alergias',
  })
  @IsOptional()
  @IsString()
  dietaryRestrictions?: string;
}

export class HealthQuestionnaireResponseDto {
  @ApiProperty({ example: 'uuid', description: 'ID do questionário' })
  id: string;

  @ApiProperty({ example: 'uuid', description: 'ID do usuário' })
  userId: string;

  @ApiPropertyOptional({
    example: 'Hipertensão',
    description: 'Condição médica preexistente',
  })
  medicalCondition?: string;

  @ApiPropertyOptional({
    example: 'Sim, regularmente',
    description: 'Medicamentos regulares',
  })
  regularMedication?: string;

  @ApiPropertyOptional({
    example: 'Lesão no joelho',
    description: 'Lesões ou dores crônicas',
  })
  chronicInjury?: string;

  @ApiPropertyOptional({
    example: 'Perda de peso',
    description: 'Objetivo principal do treino',
  })
  trainingGoal?: string;

  @ApiPropertyOptional({
    example: 'Vegetariano',
    description: 'Restrições alimentares ou alergias',
  })
  dietaryRestrictions?: string;

  @ApiPropertyOptional({
    example: '2024-01-15T10:30:00Z',
    description: 'Data de conclusão do questionário',
  })
  completedAt?: Date;

  @ApiProperty({
    example: '2024-01-15T10:00:00Z',
    description: 'Data de criação',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'Data de atualização',
  })
  updatedAt: Date;

  @ApiProperty({
    example: true,
    description: 'Se o questionário foi completado',
  })
  isCompleted: boolean;
}

export class HealthQuestionnaireListResponseDto {
  @ApiProperty({
    type: [HealthQuestionnaireResponseDto],
    description: 'Lista de questionários de saúde',
  })
  questionnaires: HealthQuestionnaireResponseDto[];

  @ApiProperty({ example: 10, description: 'Total de questionários' })
  total: number;

  @ApiProperty({ example: 1, description: 'Página atual' })
  page: number;

  @ApiProperty({ example: 10, description: 'Itens por página' })
  limit: number;
}

export class StudentHealthQuestionnaireDto extends HealthQuestionnaireResponseDto {
  @ApiProperty({ example: 'João Silva', description: 'Nome do aluno' })
  studentName: string;

  @ApiProperty({ example: 'joao@email.com', description: 'Email do aluno' })
  studentEmail: string;
}
