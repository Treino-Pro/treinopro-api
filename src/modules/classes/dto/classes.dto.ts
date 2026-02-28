import {
  IsUUID,
  IsString,
  IsDateString,
  IsInt,
  IsEnum,
  IsOptional,
  Min,
  Max,
  IsArray,
  IsBoolean,
  IsNumber,
  Length,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ClassStatus {
  SCHEDULED = 'scheduled',
  PENDING_CONFIRMATION = 'pending_confirmation', // Personal iniciou, aguardando confirmação do aluno
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW_DISPUTE = 'no_show_dispute', // Em disputa por ausência
  CUSTODY = 'custody', // Em custódia para análise
}

export enum ClassDisputeStatus {
  PENDING = 'pending',
  STUDENT_CONFIRMED_ABSENCE = 'student_confirmed_absence',
  STUDENT_DENIED_ABSENCE = 'student_denied_absence',
  RESOLVED_FOR_STUDENT = 'resolved_for_student',
  RESOLVED_FOR_PERSONAL = 'resolved_for_personal',
  DEFENSE_SUBMITTED_BY_STUDENT = 'defense_submitted_by_student',
  DEFENSE_SUBMITTED_BY_PERSONAL = 'defense_submitted_by_personal',
}

export class CreateClassDto {
  @ApiProperty({
    description: 'ID da proposta de treino',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  proposalId: string;

  @ApiProperty({
    description: 'ID do aluno',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  studentId: string;

  @ApiProperty({
    description: 'ID do personal trainer',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsUUID()
  personalId: string;

  @ApiProperty({
    description: 'Local do treino',
    example: 'Academia Smart Fit - Shopping Iguatemi',
  })
  @IsString()
  location: string;

  @ApiProperty({
    description: 'Data do treino',
    example: '2024-01-15T14:00:00.000Z',
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'Horário do treino',
    example: '14:00',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'O horário deve estar no formato HH:MM (00:00 a 23:59)',
  })
  time: string;

  @ApiProperty({
    description: 'Duração do treino em minutos',
    example: 60,
    minimum: 30,
    maximum: 180,
  })
  @IsInt()
  @Min(30)
  @Max(180)
  duration: number; // em minutos
}

export class UpdateClassDto {
  @ApiPropertyOptional({
    description: 'Local do treino',
    example: 'Academia Smart Fit - Shopping Iguatemi',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Data do treino',
    example: '2024-01-15T14:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Horário do treino',
    example: '14:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'O horário deve estar no formato HH:MM (00:00 a 23:59)',
  })
  time?: string;

  @ApiPropertyOptional({
    description: 'Duração do treino em minutos',
    example: 60,
    minimum: 30,
    maximum: 180,
  })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(180)
  duration?: number;

  @ApiPropertyOptional({
    description: 'Status da aula',
    enum: ClassStatus,
    example: ClassStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;
}

export class CompleteClassDto {
  @IsString()
  @IsOptional()
  notes?: string; // Observações do personal ao finalizar

  @IsString()
  @IsOptional()
  studentNotes?: string; // Observações do aluno
}

export class GetClassesDto {
  @ApiPropertyOptional({
    description: 'Status da aula para filtrar',
    enum: ClassStatus,
    example: ClassStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;

  @ApiPropertyOptional({
    description: 'ID do aluno para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'ID do personal trainer para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsOptional()
  @IsUUID()
  personalId?: string;

  @ApiPropertyOptional({
    description: 'ID da proposta para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174003',
  })
  @IsOptional()
  @IsUUID()
  proposalId?: string;

  @ApiPropertyOptional({
    description: 'Data inicial para filtrar',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Data final para filtrar',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Data específica para filtrar (formato YYYY-MM-DD)',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Faixa de horário para filtrar',
    enum: ['morning', 'afternoon', 'evening'],
    example: 'morning',
  })
  @IsOptional()
  @IsString()
  timeRange?: string;

  @ApiPropertyOptional({
    description: 'Categoria da modalidade para filtrar',
    example: 'Musculação',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Número da página',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Limite de itens por página',
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class ClassResponseDto {
  @ApiProperty({
    description: 'ID único da aula',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'ID da proposta de treino',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  proposalId: string;

  @ApiProperty({
    description: 'ID do aluno',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  studentId: string;

  @ApiProperty({
    description: 'ID do personal trainer',
    example: '123e4567-e89b-12d3-a456-426614174003',
  })
  personalId: string;

  @ApiProperty({
    description: 'Local do treino',
    example: 'Academia Smart Fit - Shopping Iguatemi',
  })
  location: string;

  @ApiProperty({
    description: 'Data do treino',
    example: '2024-01-15T14:00:00.000Z',
  })
  date: Date;

  @ApiProperty({
    description: 'Horário do treino',
    example: '14:00',
  })
  time: string;

  @ApiProperty({
    description: 'Duração do treino em minutos',
    example: 60,
  })
  duration: number;

  @ApiProperty({
    description: 'Status atual da aula',
    enum: ClassStatus,
    example: ClassStatus.SCHEDULED,
  })
  status: ClassStatus;

  @ApiPropertyOptional({
    description: 'Data de início da aula',
    example: '2024-01-15T14:00:00.000Z',
  })
  startedAt?: Date;

  @ApiPropertyOptional({
    description: 'Data de conclusão da aula',
    example: '2024-01-15T15:00:00.000Z',
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    description: 'Data de confirmação pendente',
    example: '2024-01-15T14:00:00.000Z',
  })
  pendingConfirmationAt?: Date;

  @ApiPropertyOptional({
    description: 'Data de confirmação pelo aluno',
    example: '2024-01-15T14:05:00.000Z',
  })
  confirmedAt?: Date;

  @ApiPropertyOptional({
    description: 'Data do reporte de ausência',
    example: '2024-01-15T14:30:00.000Z',
  })
  noShowReportedAt?: Date;

  @ApiPropertyOptional({
    description: 'Quem reportou a ausência',
    enum: ['student', 'personal'],
    example: 'personal',
  })
  noShowReportedBy?: 'student' | 'personal';

  @ApiPropertyOptional({
    description: 'Status da disputa por ausência',
    enum: ClassDisputeStatus,
    example: ClassDisputeStatus.PENDING,
  })
  disputeStatus?: ClassDisputeStatus;

  @ApiPropertyOptional({
    description: 'Data de expiração da custódia',
    example: '2024-01-17T14:00:00.000Z',
  })
  custodyExpiresAt?: Date;

  @ApiPropertyOptional({
    description: 'Prazo para envio de evidências',
    example: '2024-01-16T14:00:00.000Z',
  })
  evidenceDeadline?: Date;

  @ApiPropertyOptional({
    description: 'Evidências enviadas pelo aluno',
    example: ['Foto do local de treino'],
    type: [String],
  })
  studentEvidence?: string[];

  @ApiPropertyOptional({
    description: 'Evidências enviadas pelo personal',
    example: ['Foto do local de treino'],
    type: [String],
  })
  personalEvidence?: string[];

  @ApiPropertyOptional({
    description: 'Resolução da disputa',
    example: 'Disputa resolvida a favor do aluno',
  })
  resolution?: string;

  @ApiPropertyOptional({
    description: 'Data de resolução da disputa',
    example: '2024-01-16T10:00:00.000Z',
  })
  resolvedAt?: Date;

  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-10T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data de atualização',
    example: '2024-01-15T14:00:00.000Z',
  })
  updatedAt: Date;

  // Relacionamentos
  @ApiPropertyOptional({
    description: 'Informações do aluno',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174002' },
      firstName: { type: 'string', example: 'João' },
      lastName: { type: 'string', example: 'Silva' },
      profilePicture: {
        type: 'string',
        example: 'https://example.com/profile.jpg',
      },
    },
  })
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };

  @ApiPropertyOptional({
    description: 'Informações do personal trainer',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174003' },
      firstName: { type: 'string', example: 'Maria' },
      lastName: { type: 'string', example: 'Santos' },
      profilePicture: {
        type: 'string',
        example: 'https://example.com/profile.jpg',
      },
    },
  })
  personal?: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };

  @ApiPropertyOptional({
    description: 'Informações da proposta',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
      modality: { type: 'string', example: 'Musculação' },
      value: { type: 'number', example: 80.0 },
    },
  })
  proposal?: {
    id: string;
    modality: string;
    value: number;
  };

  @ApiPropertyOptional({
    description: 'URL da foto de perfil do personal trainer',
    example: 'https://example.com/profile.jpg',
  })
  personalProfileImageUrl?: string;

  @ApiPropertyOptional({
    description: 'Rating médio do personal trainer (sistema como Uber)',
    example: 4.8,
  })
  personalRating?: number;

  @ApiPropertyOptional({
    description: 'Tempo na plataforma do personal trainer (dinâmico como Uber)',
    example: '4 dias',
  })
  personalTimeOnPlatform?: string;

  @ApiPropertyOptional({
    description: 'Rating médio do aluno (sistema como Uber)',
    example: 4.9,
  })
  studentRating?: number;
}

export class ClassStatsDto {
  @ApiProperty({
    description: 'Total de aulas',
    example: 50,
  })
  total: number;

  @ApiProperty({
    description: 'Aulas agendadas',
    example: 10,
  })
  scheduled: number;

  @ApiProperty({
    description: 'Aulas aguardando confirmação',
    example: 5,
  })
  pendingConfirmation: number;

  @ApiProperty({
    description: 'Aulas ativas',
    example: 2,
  })
  active: number;

  @ApiProperty({
    description: 'Aulas concluídas',
    example: 30,
  })
  completed: number;

  @ApiProperty({
    description: 'Aulas canceladas',
    example: 3,
  })
  cancelled: number;

  @ApiProperty({
    description: 'Aulas em disputa por ausência',
    example: 1,
  })
  noShowDispute: number;

  @ApiProperty({
    description: 'Aulas em custódia',
    example: 0,
  })
  custody: number;

  @ApiProperty({
    description: 'Duração total em minutos',
    example: 3000,
  })
  totalDuration: number; // em minutos

  @ApiProperty({
    description: 'Duração média em minutos',
    example: 60,
  })
  averageDuration: number; // em minutos
}

export class StartClassDto {
  @ApiPropertyOptional({
    description: 'Observações do personal ao iniciar a aula',
    example: 'Aula iniciada com sucesso',
  })
  @IsString()
  @IsOptional()
  notes?: string; // Observações do personal ao iniciar
}

export class ConfirmClassStartDto {
  @ApiProperty({
    description: 'Se o aluno confirmou o início da aula',
    example: true,
  })
  @IsBoolean()
  confirmed: boolean;

  @ApiProperty({
    description: 'Código de 4 dígitos exibido ao personal no início da aula',
    example: '7391',
  })
  @IsString()
  @Length(4, 4)
  confirmationCode: string;

  @ApiPropertyOptional({
    description: 'Observações do aluno ao confirmar início',
    example: 'Confirmado, estou no local',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class DisputeDefenseDto {
  @ApiProperty({
    description: 'Texto da defesa (replica) da parte reportada',
    example: 'Eu estava no local às 14:00 conforme combinado...',
  })
  @IsString()
  text: string;

  @ApiPropertyOptional({
    description: 'URLs de evidências (imagens/vídeos)',
    example: ['https://example.com/foto1.jpg'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidenceUrls?: string[];
}

export class PresenceSnapshotDto {
  @ApiProperty({ description: 'Latitude', example: -23.5505 })
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'Longitude', example: -46.6333 })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ description: 'Precisão em metros', example: 12.5 })
  @IsNumber()
  @IsOptional()
  accuracyMeters?: number;

  @ApiProperty({
    description: 'Timestamp da captura (ISO 8601)',
    example: '2024-01-15T14:00:00.000Z',
  })
  @IsDateString()
  capturedAt: string;

  @ApiProperty({
    description: 'Fonte da captura',
    enum: ['foreground', 'resume', 'background_task'],
  })
  @IsEnum(['foreground', 'resume', 'background_task'])
  captureSource: 'foreground' | 'resume' | 'background_task';

  @ApiProperty({
    description: 'Estado do app no momento da captura',
    enum: ['foreground', 'background', 'resumed'],
  })
  @IsEnum(['foreground', 'background', 'resumed'])
  appState: 'foreground' | 'background' | 'resumed';
}

export class ReportNoShowDto {
  @ApiProperty({
    description: 'Motivo da ausência',
    example: 'Não compareceu ao horário agendado',
  })
  @IsString()
  reason: string; // Motivo da ausência

  @ApiPropertyOptional({
    description: 'Observações adicionais',
    example: 'Aluno não compareceu no horário agendado',
  })
  @IsString()
  @IsOptional()
  notes?: string; // Observações adicionais

  @ApiPropertyOptional({
    description: 'URLs das evidências (imagens) enviadas',
    example: [
      'https://example.com/evidence1.jpg',
      'https://example.com/evidence2.jpg',
    ],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidenceUrls?: string[]; // URLs das evidências (imagens)
}

export class ResolveNoShowDisputeDto {
  @ApiProperty({
    description: 'Resolução da disputa',
    enum: ClassDisputeStatus,
    example: ClassDisputeStatus.RESOLVED_FOR_STUDENT,
  })
  @IsEnum(ClassDisputeStatus)
  resolution: ClassDisputeStatus;

  @ApiPropertyOptional({
    description: 'Evidências enviadas pelo usuário',
    example: 'Foto do local de treino',
  })
  @IsString()
  @IsOptional()
  evidence?: string; // Evidências enviadas pelo usuário
}

export class ClassTimelineDto {
  @ApiProperty({
    description: 'Data do match entre aluno e personal',
    example: '2024-01-10T10:00:00.000Z',
  })
  matchTime: Date;

  @ApiProperty({
    description: 'Data/hora atual',
    example: '2024-01-15T13:30:00.000Z',
  })
  currentTime: Date;

  @ApiProperty({
    description: 'Data/hora da aula',
    example: '2024-01-15T14:00:00.000Z',
  })
  classTime: Date;

  @ApiProperty({
    description: 'Se pode cancelar a aula',
    example: true,
  })
  canCancel: boolean;

  @ApiProperty({
    description: 'Se pode iniciar a aula',
    example: false,
  })
  canStart: boolean;

  @ApiProperty({
    description: 'Se pode reportar ausência',
    example: false,
  })
  canReportNoShow: boolean;

  @ApiProperty({
    description: 'Se pode confirmar início',
    example: false,
  })
  canConfirmStart: boolean;

  @ApiProperty({
    description: 'Se pode reportar ausência do personal',
    example: false,
  })
  canReportPersonalNoShow: boolean;

  @ApiProperty({
    description: 'Se pode finalizar a aula (regra de 1min)',
    example: false,
  })
  canComplete: boolean;

  @ApiProperty({
    description: 'Prazo para cancelamento',
    example: '2024-01-15T12:00:00.000Z',
  })
  cancellationDeadline: Date;

  @ApiProperty({
    description: 'Prazo para reportar ausência',
    example: '2024-01-15T16:00:00.000Z',
  })
  noShowReportDeadline: Date;

  @ApiPropertyOptional({
    description: 'Horário mínimo para finalizar aula (startedAt + 1min)',
    example: '2024-01-15T14:01:00.000Z',
  })
  minimumCompletionAt?: Date;

  @ApiPropertyOptional({
    description: 'Segundos restantes até poder finalizar (0 = já pode)',
    example: 1800,
  })
  remainingToCompleteSeconds?: number;

  @ApiPropertyOptional({
    description: 'Se o usuário atual já registrou snapshot de presença',
    example: false,
  })
  hasPresenceSnapshot?: boolean;
}

export class ClassDisputeDto {
  @ApiProperty({
    description: 'ID da disputa (= ID da aula)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'ID da aula',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  classId: string;

  @ApiProperty({
    description: 'Quem reportou a disputa (role)',
    enum: ['student', 'personal'],
    example: 'personal',
  })
  reportedBy: 'student' | 'personal';

  @ApiProperty({
    description: 'ID do usuário que reportou',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  reporterUserId: string;

  @ApiProperty({
    description: 'ID do usuário reportado',
    example: '123e4567-e89b-12d3-a456-426614174003',
  })
  reportedUserId: string;

  @ApiPropertyOptional({ description: 'Nome do reporter' })
  reporterName?: string;

  @ApiPropertyOptional({ description: 'Nome do reportado' })
  reportedUserName?: string;

  @ApiProperty({
    description: 'Status da disputa',
    enum: ClassDisputeStatus,
    example: ClassDisputeStatus.PENDING,
  })
  status: ClassDisputeStatus;

  @ApiProperty({
    description: 'Data do reporte',
    example: '2024-01-15T14:30:00.000Z',
  })
  reportedAt: Date;

  @ApiPropertyOptional({
    description: 'Evidências do aluno (lista de URLs)',
    type: [String],
  })
  studentEvidence?: string[];

  @ApiPropertyOptional({
    description: 'Evidências do personal (lista de URLs)',
    type: [String],
  })
  personalEvidence?: string[];

  @ApiPropertyOptional({ description: 'Texto de defesa do aluno' })
  studentDefenseText?: string;

  @ApiPropertyOptional({ description: 'Texto de defesa do personal' })
  personalDefenseText?: string;

  @ApiPropertyOptional({ description: 'Data de envio da defesa do aluno' })
  studentDefenseSubmittedAt?: Date;

  @ApiPropertyOptional({ description: 'Data de envio da defesa do personal' })
  personalDefenseSubmittedAt?: Date;

  @ApiPropertyOptional({
    description: 'Resolução da disputa',
  })
  resolution?: string;

  @ApiPropertyOptional({
    description: 'Data de resolução',
  })
  resolvedAt?: Date;

  @ApiProperty({
    description: 'Data de expiração da custódia',
    example: '2024-01-17T14:00:00.000Z',
  })
  custodyExpiresAt: Date;

  @ApiProperty({
    description: 'Prazo para envio de evidências/defesa',
    example: '2024-01-16T14:00:00.000Z',
  })
  evidenceDeadline: Date;

  // Campos de geolocalização/presença
  @ApiPropertyOptional({ description: 'Reporter registrou snapshot de presença' })
  reporterHasSnapshot?: boolean;

  @ApiPropertyOptional({ description: 'Reportado registrou snapshot de presença' })
  reportedHasSnapshot?: boolean;

  @ApiPropertyOptional({ description: 'Data do snapshot do reporter' })
  reporterSnapshotAt?: Date;

  @ApiPropertyOptional({ description: 'Data do snapshot do reportado' })
  reportedSnapshotAt?: Date;
}

export class GetDisputesQueryDto {
  @ApiPropertyOptional({
    description: 'Filtro de status da disputa',
    enum: ['open', 'resolved', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsString()
  status?: 'open' | 'resolved' | 'all' = 'all';
}
