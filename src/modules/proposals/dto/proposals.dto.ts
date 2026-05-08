import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  IsDateString,
  IsEnum,
  IsUUID,
  Min,
  MaxLength,
  IsIn,
  IsBoolean,
  IsEmail,
  Length,
  Matches,
  ValidateNested,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { isValidCPF } from '../../../common/utils/document.utils';

function IsCpfValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCpfValid',
      target: object.constructor,
      propertyName,
      options: {
        message: 'CPF inválido',
        ...validationOptions,
      },
      constraints: [],
      validator: {
        validate(value: any) {
          if (!value) return true; // campo opcional, deixar @IsOptional lidar
          return isValidCPF(String(value));
        },
      },
    });
  };
}

export enum ProposalStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class ProposalCardDataDto {
  @ApiProperty({
    description: 'Número do cartão',
    example: '4111111111111111',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{13,19}$/, {
    message: 'Número do cartão deve conter entre 13 e 19 dígitos',
  })
  cardNumber: string;

  @ApiProperty({
    description: 'Nome impresso no cartão',
    example: 'JOAO SILVA',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  cardHolderName: string;

  @ApiProperty({
    description: 'Data de expiração no formato MM/YY',
    example: '12/28',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, {
    message: 'Data deve estar no formato MM/YY',
  })
  expirationDate: string;

  @ApiProperty({
    description: 'CVV do cartão novo',
    example: '123',
  })
  @IsString()
  @IsNotEmpty({
    message:
      'Por motivos de segurança, o código de segurança (CVV) do seu cartão é obrigatório para confirmar o pagamento.',
  })
  @Matches(/^\d{3,4}$/, { message: 'CVV deve ter 3 ou 4 dígitos' })
  cvv: string;

  @ApiProperty({
    description: 'Tipo do cartão',
    example: 'credit',
    enum: ['credit', 'debit'],
  })
  @IsString()
  @IsIn(['credit', 'debit'])
  cardType: 'credit' | 'debit';
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
    description: 'Latitude do local de treino (opcional, mas recomendado)',
    example: -23.5505,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  locationLat?: number;

  @ApiProperty({
    description: 'Longitude do local de treino (opcional, mas recomendado)',
    example: -46.6333,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  locationLng?: number;

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
    example: 80.0,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  price: number;

  @ApiProperty({
    description: 'Observações adicionais',
    example: 'Preferência por personal trainer especializado em reabilitação',
    required: false,
  })
  @IsOptional()
  @IsString()
  additionalNotes?: string;

  // ===== NOVOS CAMPOS PARA PAGAMENTO =====

  @ApiProperty({
    description: 'Método de pagamento escolhido',
    example: 'credit_card',
    enum: ['credit_card', 'debit_card', 'pix'],
  })
  @IsString()
  @IsIn(['credit_card', 'debit_card', 'pix'])
  paymentMethod: string;

  @ApiProperty({
    description: 'ID do cartão salvo (se aplicável)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  cardId?: string;

  @ApiProperty({
    description: 'Dados do cartão (se não usar cartão salvo)',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProposalCardDataDto)
  cardData?: ProposalCardDataDto;

  @ApiProperty({
    description: 'Número de parcelas (1-12)',
    example: '1',
    required: false,
  })
  @IsOptional()
  @IsString()
  installments?: string;

  @ApiProperty({
    description: 'CVV do cartão salvo',
    example: '1234',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'CVV deve ter 3 ou 4 dígitos' })
  savedCardCvv?: string;

  @ApiProperty({
    description: 'Salvar cartão para futuras compras',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;

  @ApiProperty({
    description: 'Apelido para o cartão (se salvar)',
    example: 'Cartão Principal',
    required: false,
  })
  @IsOptional()
  @IsString()
  cardNickname?: string;

  @ApiProperty({
    description: 'Email do pagador (aluno)',
    example: 'aluno@email.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  payerEmail?: string;

  @ApiProperty({
    description: 'CPF do pagador (aluno) - apenas dígitos',
    example: '12345678901',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(11, 11, { message: 'CPF deve ter 11 dígitos' })
  @Matches(/^\d+$/, { message: 'CPF deve conter apenas dígitos' })
  @IsCpfValid()
  payerCpf?: string;
}

export class CreateRecontractDto extends CreateProposalDto {
  @ApiProperty({
    description: 'ID do personal trainer para recontratação direta',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  personalId: string;
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
    description: 'Dados do estudante',
    example: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'João Silva',
      email: 'joao@email.com',
      firstName: 'João',
      lastName: 'Silva',
    },
  })
  student: {
    id: string;
    name: string;
    email: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };

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
    example: 80.0,
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
    description: 'Status do pagamento',
    example: 'pending',
    required: false,
  })
  paymentStatus?: string;

  @ApiProperty({
    description: 'Indica se a proposta é uma recontratação direta',
    example: true,
    required: false,
  })
  isRecontract?: boolean;

  @ApiProperty({
    description: 'ID do personal alvo na recontratação direta',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  targetPersonalId?: string;

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

  // ===== CAMPOS DE PAGAMENTO (OPCIONAIS) =====

  @ApiProperty({
    description: 'Dados do pagamento processado',
    required: false,
  })
  payment?: {
    paymentId: string;
    status: string;
    method: string;
    amount: number;
    provider?: string;
    stripePaymentIntentId?: string;
    clientSecret?: string;
    customerId?: string;
    customerEphemeralKeySecret?: string;
    publishableKey?: string;
    qrCode?: string;
    qrCodeImageUrl?: string;
    qrCodeSvgUrl?: string;
    hostedInstructionsUrl?: string;
    processingModel?: string;
    platformFee?: number; // Taxa da plataforma
    personalAmount?: number; // Valor para o personal
    message?: string;
    expiresAt?: Date; // Quando o pagamento expira
  };
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
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiProperty({
    description: 'Itens por página',
    example: 10,
    required: false,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
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

export class PaymentStatusWebhookDto {
  @ApiProperty({
    description: 'ID da proposta',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsUUID()
  proposalId: string;

  @ApiProperty({
    description: 'Status do pagamento',
    example: 'approved',
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'captured'],
  })
  @IsString()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled', 'captured'])
  paymentStatus: string;

  @ApiProperty({
    description: 'ID do PaymentIntent Stripe',
    example: 'pi_1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  stripePaymentIntentId?: string;
}
