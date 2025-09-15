import { IsUUID, IsString, IsDateString, IsInt, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

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
}

export class CreateClassDto {
  @IsUUID()
  proposalId: string;

  @IsUUID()
  studentId: string;

  @IsUUID()
  personalId: string;

  @IsString()
  location: string;

  @IsDateString()
  date: string;

  @IsString()
  time: string;

  @IsInt()
  @Min(30)
  @Max(180)
  duration: number; // em minutos
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(180)
  duration?: number;

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
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  personalId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class ClassResponseDto {
  id: string;
  proposalId: string;
  studentId: string;
  personalId: string;
  location: string;
  date: Date;
  time: string;
  duration: number;
  status: ClassStatus;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Relacionamentos
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
  
  personal?: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
  
  proposal?: {
    id: string;
    modality: string;
    value: number;
  };
}

export class ClassStatsDto {
  total: number;
  scheduled: number;
  pendingConfirmation: number;
  active: number;
  completed: number;
  cancelled: number;
  noShowDispute: number;
  custody: number;
  totalDuration: number; // em minutos
  averageDuration: number; // em minutos
}

export class StartClassDto {
  @IsString()
  @IsOptional()
  notes?: string; // Observações do personal ao iniciar
}

export class ConfirmClassStartDto {
  @IsString()
  @IsOptional()
  notes?: string; // Observações do aluno ao confirmar
}

export class ReportNoShowDto {
  @IsString()
  @IsOptional()
  notes?: string; // Observações do personal ao reportar ausência
}

export class ResolveNoShowDisputeDto {
  @IsEnum(ClassDisputeStatus)
  resolution: ClassDisputeStatus;

  @IsString()
  @IsOptional()
  evidence?: string; // Evidências enviadas pelo usuário
}

export class ClassTimelineDto {
  matchTime: Date;
  currentTime: Date;
  classTime: Date;
  canCancel: boolean;
  canStart: boolean;
  canReportNoShow: boolean;
  canConfirmStart: boolean;
  canReportPersonalNoShow: boolean;
  cancellationDeadline: Date;
  noShowReportDeadline: Date;
}

export class ClassDisputeDto {
  id: string;
  classId: string;
  reportedBy: 'student' | 'personal';
  status: ClassDisputeStatus;
  reportedAt: Date;
  studentEvidence?: string;
  personalEvidence?: string;
  resolution?: string;
  resolvedAt?: Date;
  custodyExpiresAt: Date;
  evidenceDeadline: Date;
}
