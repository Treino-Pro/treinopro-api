import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UserType {
  STUDENT = 'student',
  PERSONAL = 'personal',
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
  firstName: string;

  @ApiProperty({ example: 'Silva' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '11999999999', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '1990-01-01', required: false })
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiProperty({ enum: UserType, example: UserType.STUDENT })
  @IsEnum(UserType)
  userType: UserType;

  // Campos específicos para Personal Trainers
  @ApiProperty({ example: 'CREF: 0111212-9', required: false })
  @IsString()
  @IsOptional()
  cref?: string;

  @ApiProperty({ example: ['Musculação', 'Funcional'], required: false })
  @IsOptional()
  specialties?: string[];
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
