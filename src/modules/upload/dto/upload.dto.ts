import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';

export enum FileCategory {
  PROFILE = 'profile',
  DOCUMENT = 'document',
  TEMP = 'temp',
  DISPUTE_EVIDENCE = 'dispute_evidence',
}

export class UploadFileDto {
  @ApiProperty({ 
    description: 'Categoria do arquivo',
    enum: FileCategory,
    example: FileCategory.PROFILE
  })
  @IsEnum(FileCategory)
  category: FileCategory;

  @ApiProperty({ 
    description: 'ID do usuário (opcional)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ 
    description: 'Metadados adicionais (JSON string)',
    example: '{"description": "Foto de perfil principal"}',
    required: false
  })
  @IsOptional()
  @IsString()
  metadata?: string;
}

export class FileResponseDto {
  @ApiProperty({ description: 'ID único do arquivo' })
  id: string;

  @ApiProperty({ description: 'Nome original do arquivo' })
  originalName: string;

  @ApiProperty({ description: 'Nome armazenado (UUID)' })
  storedName: string;

  @ApiProperty({ description: 'Tipo MIME do arquivo' })
  mimeType: string;

  @ApiProperty({ description: 'Tamanho em bytes' })
  size: number;

  @ApiProperty({ description: 'URL pública do arquivo' })
  url: string;

  @ApiProperty({ description: 'Categoria do arquivo' })
  category: string;

  @ApiProperty({ description: 'Se o arquivo foi processado' })
  isProcessed: boolean;

  @ApiProperty({ description: 'Metadados adicionais' })
  metadata?: any;

  @ApiProperty({ description: 'Data de criação' })
  createdAt: Date;
}
