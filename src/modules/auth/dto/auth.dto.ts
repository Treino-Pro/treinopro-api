import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean, IsDateString, IsArray, ValidateIf, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UserType {
  STUDENT = 'student',
  PERSONAL = 'personal',
}

export enum DocumentType {
  RG = 'RG',
  CNH = 'CNH',
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
  documentNumber: string;

  @ApiProperty({ 
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID do arquivo de documento (obtido via upload)'
  })
  @IsString()
  @IsNotEmpty()
  documentImageId: string;

  // Campos específicos para Personal Trainers
  @ApiProperty({ 
    example: 'SP-106227', 
    description: 'CREF no formato UF-NÚMERO (ex: SP-106227)',
    required: false 
  })
  @IsString()
  @IsOptional()
  cref?: string;

  @ApiProperty({ 
    example: 'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    description: 'ID do arquivo CREF (obtido via upload)',
    required: false 
  })
  @IsString()
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
  @ValidateIf(o => o.isMinor === true)
  @IsNotEmpty()
  guardianName?: string;

  @ApiProperty({ example: 'maria@email.com', required: false })
  @IsEmail()
  @ValidateIf(o => o.isMinor === true)
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
