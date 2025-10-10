import { IsString, IsEmail, IsEnum, IsOptional, IsUUID, IsBoolean, IsDateString, IsArray, MinLength, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Enums
export enum UserType {
  STUDENT = 'student',
  PERSONAL = 'personal',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum DocumentType {
  RG = 'RG',
  CNH = 'CNH',
}

// DTOs para criação
export class CreateUserDto {
  @ApiProperty({ example: 'joao@email.com', description: 'Email do usuário' })
  @IsEmail({}, { message: 'Email deve ter um formato válido' })
  email: string;

  @ApiProperty({ example: 'João', description: 'Primeiro nome' })
  @IsString({ message: 'Primeiro nome deve ser uma string' })
  @MinLength(2, { message: 'Primeiro nome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'Primeiro nome deve ter no máximo 100 caracteres' })
  firstName: string;

  @ApiProperty({ example: 'Silva', description: 'Sobrenome' })
  @IsString({ message: 'Sobrenome deve ser uma string' })
  @MinLength(2, { message: 'Sobrenome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'Sobrenome deve ter no máximo 100 caracteres' })
  lastName: string;

  @ApiProperty({ example: 'senha123', description: 'Senha do usuário' })
  @IsString({ message: 'Senha deve ser uma string' })
  @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
  password: string;

  @ApiProperty({ example: '1990-01-15', description: 'Data de nascimento' })
  @IsDateString({}, { message: 'Data de nascimento deve ser uma data válida' })
  birthDate: string;

  @ApiProperty({ enum: UserType, example: UserType.STUDENT, description: 'Tipo de usuário' })
  @IsEnum(UserType, { message: 'Tipo de usuário deve ser student ou personal' })
  userType: UserType;

  @ApiProperty({ enum: DocumentType, example: DocumentType.RG, description: 'Tipo de documento' })
  @IsEnum(DocumentType, { message: 'Tipo de documento deve ser RG ou CNH' })
  documentType: DocumentType;

  @ApiProperty({ example: '123456789', description: 'Número do documento' })
  @IsString({ message: 'Número do documento deve ser uma string' })
  @MinLength(5, { message: 'Número do documento deve ter pelo menos 5 caracteres' })
  @MaxLength(20, { message: 'Número do documento deve ter no máximo 20 caracteres' })
  documentNumber: string;

  @ApiPropertyOptional({ example: 'uuid-da-imagem-documento', description: 'ID da imagem do documento' })
  @IsOptional()
  @IsUUID('4', { message: 'ID da imagem do documento deve ser um UUID válido' })
  documentImageId?: string;

  @ApiPropertyOptional({ example: 'uuid-da-imagem-perfil', description: 'ID da imagem de perfil' })
  @IsOptional()
  @IsUUID('4', { message: 'ID da imagem de perfil deve ser um UUID válido' })
  profileImageId?: string;

  // Campos específicos para Personal Trainers
  @ApiPropertyOptional({ example: 'SP-106227', description: 'Número do CREF' })
  @IsOptional()
  @IsString({ message: 'CREF deve ser uma string' })
  @MaxLength(20, { message: 'CREF deve ter no máximo 20 caracteres' })
  cref?: string;

  @ApiPropertyOptional({ example: 'uuid-da-imagem-cref', description: 'ID da imagem do CREF' })
  @IsOptional()
  @IsUUID('4', { message: 'ID da imagem do CREF deve ser um UUID válido' })
  crefImageId?: string;

  @ApiPropertyOptional({ example: ['Musculação', 'Pilates'], description: 'Especialidades do personal trainer' })
  @IsOptional()
  @IsArray({ message: 'Especialidades deve ser um array' })
  @IsString({ each: true, message: 'Cada especialidade deve ser uma string' })
  specialties?: string[];

  // Campos para menores de idade
  @ApiPropertyOptional({ example: false, description: 'Se é menor de idade' })
  @IsOptional()
  @IsBoolean({ message: 'isMinor deve ser um booleano' })
  isMinor?: boolean;

  @ApiPropertyOptional({ example: 'Maria Silva', description: 'Nome do responsável' })
  @IsOptional()
  @IsString({ message: 'Nome do responsável deve ser uma string' })
  @MaxLength(200, { message: 'Nome do responsável deve ter no máximo 200 caracteres' })
  guardianName?: string;

  @ApiPropertyOptional({ example: 'maria@email.com', description: 'Email do responsável' })
  @IsOptional()
  @IsEmail({}, { message: 'Email do responsável deve ter um formato válido' })
  guardianEmail?: string;

  // Termos e políticas
  @ApiProperty({ example: true, description: 'Se aceitou os termos de uso' })
  @IsBoolean({ message: 'Aceite dos termos deve ser um booleano' })
  termsAccepted: boolean;

  @ApiProperty({ example: true, description: 'Se aceitou a política de privacidade' })
  @IsBoolean({ message: 'Aceite da política de privacidade deve ser um booleano' })
  privacyPolicyAccepted: boolean;
}

// DTOs para atualização
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'João', description: 'Primeiro nome' })
  @IsOptional()
  @IsString({ message: 'Primeiro nome deve ser uma string' })
  @MinLength(2, { message: 'Primeiro nome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'Primeiro nome deve ter no máximo 100 caracteres' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Silva', description: 'Sobrenome' })
  @IsOptional()
  @IsString({ message: 'Sobrenome deve ser uma string' })
  @MinLength(2, { message: 'Sobrenome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'Sobrenome deve ter no máximo 100 caracteres' })
  lastName?: string;

  @ApiPropertyOptional({ example: '1990-01-15', description: 'Data de nascimento' })
  @IsOptional()
  @IsDateString({}, { message: 'Data de nascimento deve ser uma data válida' })
  birthDate?: string;

  @ApiPropertyOptional({ example: 'uuid-da-imagem-perfil', description: 'ID da imagem de perfil' })
  @IsOptional()
  @IsUUID('4', { message: 'ID da imagem de perfil deve ser um UUID válido' })
  profileImageId?: string;

  @ApiPropertyOptional({ example: ['Musculação', 'Pilates'], description: 'Especialidades do personal trainer' })
  @IsOptional()
  @IsArray({ message: 'Especialidades deve ser um array' })
  @IsString({ each: true, message: 'Cada especialidade deve ser uma string' })
  specialties?: string[];

  @ApiPropertyOptional({ example: 'Maria Silva', description: 'Nome do responsável' })
  @IsOptional()
  @IsString({ message: 'Nome do responsável deve ser uma string' })
  @MaxLength(200, { message: 'Nome do responsável deve ter no máximo 200 caracteres' })
  guardianName?: string;

  @ApiPropertyOptional({ example: 'maria@email.com', description: 'Email do responsável' })
  @IsOptional()
  @IsEmail({}, { message: 'Email do responsável deve ter um formato válido' })
  guardianEmail?: string;
}

// DTOs para perfil
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'joao@email.com', description: 'Email do usuário' })
  @IsOptional()
  @IsEmail({}, { message: 'Email deve ter um formato válido' })
  email?: string;

  @ApiPropertyOptional({ example: 'João', description: 'Primeiro nome' })
  @IsOptional()
  @IsString({ message: 'Primeiro nome deve ser uma string' })
  @MinLength(2, { message: 'Primeiro nome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'Primeiro nome deve ter no máximo 100 caracteres' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Silva', description: 'Sobrenome' })
  @IsOptional()
  @IsString({ message: 'Sobrenome deve ser uma string' })
  @MinLength(2, { message: 'Sobrenome deve ter pelo menos 2 caracteres' })
  @MaxLength(100, { message: 'Sobrenome deve ter no máximo 100 caracteres' })
  lastName?: string;

  @ApiPropertyOptional({ example: '1990-01-15', description: 'Data de nascimento' })
  @IsOptional()
  @IsDateString({}, { message: 'Data de nascimento deve ser uma data válida' })
  birthDate?: string;

  @ApiPropertyOptional({ example: 'uuid-da-imagem-perfil', description: 'ID da imagem de perfil' })
  @IsOptional()
  @IsUUID('4', { message: 'ID da imagem de perfil deve ser um UUID válido' })
  profileImageId?: string;

  @ApiPropertyOptional({ example: ['Musculação', 'Pilates'], description: 'Especialidades do personal trainer' })
  @IsOptional()
  @IsArray({ message: 'Especialidades deve ser um array' })
  @IsString({ each: true, message: 'Cada especialidade deve ser uma string' })
  specialties?: string[];

  @ApiPropertyOptional({ example: 'Maria Silva', description: 'Nome do responsável' })
  @IsOptional()
  @IsString({ message: 'Nome do responsável deve ser uma string' })
  @MaxLength(200, { message: 'Nome do responsável deve ter no máximo 200 caracteres' })
  guardianName?: string;

  @ApiPropertyOptional({ example: 'maria@email.com', description: 'Email do responsável' })
  @IsOptional()
  @IsEmail({}, { message: 'Email do responsável deve ter um formato válido' })
  guardianEmail?: string;
}

// DTOs para busca e filtros
export class UserSearchDto {
  @ApiPropertyOptional({ example: 'João', description: 'Buscar por nome' })
  @IsOptional()
  @IsString({ message: 'Termo de busca deve ser uma string' })
  search?: string;

  @ApiPropertyOptional({ enum: UserType, example: UserType.STUDENT, description: 'Filtrar por tipo de usuário' })
  @IsOptional()
  @IsEnum(UserType, { message: 'Tipo de usuário deve ser student ou personal' })
  userType?: UserType;

  @ApiPropertyOptional({ enum: UserStatus, example: UserStatus.ACTIVE, description: 'Filtrar por status' })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'Status deve ser active, inactive ou suspended' })
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'Musculação', description: 'Filtrar por especialidade' })
  @IsOptional()
  @IsString({ message: 'Especialidade deve ser uma string' })
  specialty?: string;

  @ApiPropertyOptional({ example: 1, description: 'Página atual' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Página deve ser um número inteiro' })
  @Min(1, { message: 'Página deve ser maior que 0' })
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Itens por página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limite deve ser um número inteiro' })
  @Min(1, { message: 'Limite deve ser maior que 0' })
  @Max(100, { message: 'Limite deve ser no máximo 100' })
  limit?: number = 10;
}

// DTOs para status
export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE, description: 'Novo status do usuário' })
  @IsEnum(UserStatus, { message: 'Status deve ser active, inactive ou suspended' })
  status: UserStatus;
}

// DTOs para resposta
export class UserResponseDto {
  @ApiProperty({ example: 'uuid', description: 'ID do usuário' })
  id: string;

  @ApiProperty({ example: 'joao@email.com', description: 'Email do usuário' })
  email: string;

  @ApiProperty({ example: 'João', description: 'Primeiro nome' })
  firstName: string;

  @ApiProperty({ example: 'Silva', description: 'Sobrenome' })
  lastName: string;

  @ApiProperty({ example: '1990-01-15', description: 'Data de nascimento' })
  birthDate: string;

  @ApiProperty({ enum: UserType, example: UserType.STUDENT, description: 'Tipo de usuário' })
  userType: UserType;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE, description: 'Status do usuário' })
  status: UserStatus;

  @ApiProperty({ example: true, description: 'Se está verificado' })
  isVerified: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Data de criação' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Data de atualização' })
  updatedAt: string;

  // Campos opcionais
  @ApiPropertyOptional({ example: 'uuid-da-imagem-perfil', description: 'ID da imagem de perfil' })
  profileImageId?: string;

  @ApiPropertyOptional({ example: 'https://api.treinopro.com/files/profile-image.jpg', description: 'URL da imagem de perfil' })
  profileImageUrl?: string;

  @ApiPropertyOptional({ example: 'CPF', description: 'Tipo de documento' })
  documentType?: string;

  @ApiPropertyOptional({ example: '123.456.789-00', description: 'Número do documento (CPF/CNH/RG)' })
  documentNumber?: string;

  @ApiPropertyOptional({ example: 'SP-106227', description: 'Número do CREF' })
  cref?: string;

  @ApiPropertyOptional({ example: true, description: 'Se o CREF está validado' })
  crefValidated?: boolean;

  @ApiPropertyOptional({ example: ['Musculação', 'Pilates'], description: 'Especialidades' })
  specialties?: string[];

  @ApiPropertyOptional({ example: false, description: 'Se é menor de idade' })
  isMinor?: boolean;

  @ApiPropertyOptional({ example: 'Maria Silva', description: 'Nome do responsável' })
  guardianName?: string;

  @ApiPropertyOptional({ example: 'maria@email.com', description: 'Email do responsável' })
  guardianEmail?: string;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto], description: 'Lista de usuários' })
  users: UserResponseDto[];

  @ApiProperty({ example: 100, description: 'Total de usuários' })
  total: number;

  @ApiProperty({ example: 1, description: 'Página atual' })
  page: number;

  @ApiProperty({ example: 10, description: 'Itens por página' })
  limit: number;

  @ApiProperty({ example: 10, description: 'Total de páginas' })
  totalPages: number;
}
