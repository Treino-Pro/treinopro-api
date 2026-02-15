import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsArray,
  ValidateIf,
  IsNotEmpty,
  IsUUID,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UserType {
  STUDENT = 'student',
  PERSONAL = 'personal',
  ADMIN = 'admin',
}

export enum DocumentType {
  CPF = 'CPF',
  RG = 'RG',
  CNH = 'CNH',
}

// ===== Validadores de documento =====

function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false; // sequência repetida

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i]) * (10 - i);
  }
  let rest = sum % 11;
  const dv1 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(clean[9]) !== dv1) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i]) * (11 - i);
  }
  rest = sum % 11;
  const dv2 = rest < 2 ? 0 : 11 - rest;
  return parseInt(clean[10]) === dv2;
}

function isValidCNH(cnh: string): boolean {
  const clean = cnh.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  const digits = clean.split('').map(Number);

  // DV1 (pesos 9 -> 1)
  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += digits[i] * (9 - i);
  }
  const rest1 = sum1 % 11;
  let desc = 0;
  let dv1: number;
  if (rest1 > 9) {
    dv1 = 0;
    desc = 2;
  } else {
    dv1 = rest1;
  }

  // DV2 (pesos 1 -> 9)
  let sum2 = 0;
  for (let i = 0; i < 9; i++) {
    sum2 += digits[i] * (1 + i);
  }
  const rest2 = sum2 % 11;
  let dv2 = rest2 - desc;
  if (dv2 < 0 || dv2 > 9) {
    dv2 = 0;
  }

  return digits[9] === dv1 && digits[10] === dv2;
}

/**
 * Decorator customizado que valida documentNumber baseado no documentType.
 * CPF: algoritmo módulo 11 com 2 dígitos verificadores.
 * CNH: algoritmo módulo 11 com ajuste desc.
 * RG: apenas valida formato básico (7 a 11 dígitos).
 */
function IsValidDocument(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidDocument',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          const docType = obj.documentType;
          const clean = (value || '').replace(/\D/g, '');

          switch (docType) {
            case DocumentType.CPF:
              return isValidCPF(clean);
            case DocumentType.CNH:
              return isValidCNH(clean);
            case DocumentType.RG:
              return clean.length >= 7 && clean.length <= 14;
            default:
              return clean.length >= 7 && clean.length <= 14;
          }
        },
        defaultMessage(args: ValidationArguments) {
          const obj = args.object as any;
          const docType = obj.documentType;
          switch (docType) {
            case DocumentType.CPF:
              return 'CPF inválido. Verifique os dígitos e tente novamente.';
            case DocumentType.CNH:
              return 'CNH inválida. Verifique o número de registro e tente novamente.';
            default:
              return 'Número de documento inválido.';
          }
        },
      },
    });
  };
}

export class RegisterDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'João' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Silva' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '1990-01-01' })
  @IsDateString()
  @IsNotEmpty()
  birthDate: string;

  @ApiProperty({ enum: UserType, example: UserType.STUDENT })
  @IsEnum(UserType)
  userType: UserType;

  // Documentos de identificação (obrigatórios)
  @ApiProperty({ enum: DocumentType, example: DocumentType.RG })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  @IsNotEmpty()
  @IsValidDocument({
    message: 'Número de documento inválido para o tipo selecionado.',
  })
  documentNumber: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID do arquivo de documento (obtido via upload)',
  })
  @IsUUID()
  @IsNotEmpty()
  documentImageId: string;

  // Campos específicos para Personal Trainers
  @ApiProperty({
    example: 'SP-106227',
    description: 'CREF no formato UF-NÚMERO (ex: SP-106227)',
    required: false,
  })
  @IsString()
  @IsOptional()
  cref?: string;

  @ApiProperty({
    example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    description: 'ID do arquivo CREF (obtido via upload)',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  crefImageId?: string;

  @ApiProperty({ example: ['Musculação', 'Funcional'], required: false })
  @IsArray()
  @IsOptional()
  specialties?: string[];

  // Campos para menores de idade
  @ApiProperty({ example: false })
  @IsBoolean()
  isMinor: boolean;

  @ApiProperty({ example: 'Maria Silva', required: false })
  @IsString()
  @ValidateIf((o) => o.isMinor === true)
  @IsNotEmpty()
  guardianName?: string;

  @ApiProperty({ example: 'maria@email.com', required: false })
  @IsEmail()
  @ValidateIf((o) => o.isMinor === true)
  @IsNotEmpty()
  guardianEmail?: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  guardianConsent: boolean;

  // Termos e políticas (obrigatórios)
  @ApiProperty({ example: true })
  @IsBoolean()
  termsAccepted: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  privacyPolicyAccepted: boolean;
}

// DTO específico para criação de admin (campos mínimos)
export class CreateAdminDto {
  @ApiProperty({ example: 'admin@treinopro.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'João' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Silva' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '1990-01-01' })
  @IsDateString()
  @IsNotEmpty()
  birthDate: string;
}

export class LoginDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'newpassword123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'token123' })
  @IsString()
  token: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'oldpassword123' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'newpassword123' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class CheckEmailDto {
  @ApiProperty({ example: 'usuario@exemplo.com', description: 'Email para verificar disponibilidade' })
  @IsEmail({}, { message: 'Formato de email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;
}

export class SendVerificationCodeDto {
  @ApiProperty({ example: 'usuario@exemplo.com', description: 'Email para enviar código de verificação' })
  @IsEmail({}, { message: 'Formato de email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;
}

export class VerifyCodeDto {
  @ApiProperty({ example: 'usuario@exemplo.com', description: 'Email cadastrado' })
  @IsEmail({}, { message: 'Formato de email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @ApiProperty({ example: '123456', description: 'Código de verificação de 6 dígitos' })
  @IsString()
  @IsNotEmpty({ message: 'Código é obrigatório' })
  @MinLength(6, { message: 'Código deve ter 6 dígitos' })
  code: string;
}

export class CheckDocumentDto {
  @ApiProperty({ example: 'CPF', description: 'Tipo de documento', enum: DocumentType })
  @IsEnum(DocumentType, { message: 'Tipo de documento inválido' })
  @IsNotEmpty({ message: 'Tipo de documento é obrigatório' })
  documentType: DocumentType;

  @ApiProperty({ example: '12345678900', description: 'Número do documento' })
  @IsString()
  @IsNotEmpty({ message: 'Número do documento é obrigatório' })
  documentNumber: string;
}
