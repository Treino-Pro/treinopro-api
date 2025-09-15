import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, IsUUID, Min, MaxLength } from 'class-validator';

export enum ProposalStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class CreateProposalDto {
  @ApiProperty({
    description: 'ID do local de treino',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiProperty({
    description: 'Nome do local de treino',
    example: 'Academia Smart Fit - Shopping Iguatemi',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  locationName: string;

  @ApiProperty({
    description: 'Endereço do local de treino',
    example: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
  })
  @IsString()
  locationAddress: string;

  @ApiProperty({
    description: 'Data do treino',
    example: '2024-01-15T14:00:00.000Z',
  })
  @IsDateString()
  trainingDate: string;

  @ApiProperty({
    description: 'Horário do treino',
    example: '14:00',
    maxLength: 10,
  })
  @IsString()
  @MaxLength(10)
  trainingTime: string;

  @ApiProperty({
    description: 'Duração do treino em minutos',
    example: 60,
    minimum: 30,
  })
  @IsNumber()
  @Min(30)
  durationMinutes: number;

  @ApiProperty({
    description: 'ID da modalidade de treino',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  modalityId?: string;

  @ApiProperty({
    description: 'Nome da modalidade de treino',
    example: 'Musculação',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  modalityName: string;

  @ApiProperty({
    description: 'Preço da proposta em reais',
    example: 80.00,
    minimum: 20,
  })
  @IsNumber()
  @Min(20)
  price: number;

  @ApiProperty({
    description: 'Observações adicionais',
    example: 'Preferência por personal trainer especializado em reabilitação',
    required: false,
  })
  @IsOptional()
  @IsString()
  additionalNotes?: string;
}

export class UpdateProposalDto {
  @ApiProperty({
    description: 'Status da proposta',
    enum: ProposalStatus,
    example: ProposalStatus.MATCHED,
    required: false,
  })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

  @ApiProperty({
    description: 'Observações adicionais',
    example: 'Personal trainer confirmado para o horário',
    required: false,
  })
  @IsOptional()
  @IsString()
  additionalNotes?: string;
}

export class ProposalResponseDto {
  @ApiProperty({
    description: 'ID da proposta',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'ID do aluno',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  studentId: string;

  @ApiProperty({
    description: 'Nome do local de treino',
    example: 'Academia Smart Fit - Shopping Iguatemi',
  })
  locationName: string;

  @ApiProperty({
    description: 'Endereço do local de treino',
    example: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
  })
  locationAddress: string;

  @ApiProperty({
    description: 'Data do treino',
    example: '2024-01-15T14:00:00.000Z',
  })
  trainingDate: Date;

  @ApiProperty({
    description: 'Horário do treino',
    example: '14:00',
  })
  trainingTime: string;

  @ApiProperty({
    description: 'Duração do treino em minutos',
    example: 60,
  })
  durationMinutes: number;

  @ApiProperty({
    description: 'Nome da modalidade de treino',
    example: 'Musculação',
  })
  modalityName: string;

  @ApiProperty({
    description: 'Preço da proposta em reais',
    example: 80.00,
  })
  price: number;

  @ApiProperty({
    description: 'Observações adicionais',
    example: 'Preferência por personal trainer especializado em reabilitação',
  })
  additionalNotes?: string;

  @ApiProperty({
    description: 'Status da proposta',
    enum: ProposalStatus,
    example: ProposalStatus.PENDING,
  })
  status: ProposalStatus;

  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-10T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data de atualização',
    example: '2024-01-10T10:00:00.000Z',
  })
  updatedAt: Date;
}

export class ProposalListResponseDto {
  @ApiProperty({
    description: 'Lista de propostas',
    type: [ProposalResponseDto],
  })
  proposals: ProposalResponseDto[];

  @ApiProperty({
    description: 'Total de propostas',
    example: 25,
  })
  total: number;

  @ApiProperty({
    description: 'Página atual',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Itens por página',
    example: 10,
  })
  limit: number;
}

export class ProposalQueryDto {
  @ApiProperty({
    description: 'Página',
    example: 1,
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({
    description: 'Itens por página',
    example: 10,
    required: false,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  limit?: number = 10;

  @ApiProperty({
    description: 'Status da proposta',
    enum: ProposalStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

  @ApiProperty({
    description: 'Modalidade de treino',
    example: 'Musculação',
    required: false,
  })
  @IsOptional()
  @IsString()
  modality?: string;

  @ApiProperty({
    description: 'Data mínima do treino',
    example: '2024-01-01T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({
    description: 'Data máxima do treino',
    example: '2024-12-31T23:59:59.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
