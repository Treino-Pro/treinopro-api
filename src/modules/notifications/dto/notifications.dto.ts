import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendTestPushToUserDto {
  @ApiProperty({
    description: 'ID do usuário que receberá a notificação',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Título da notificação push',
    example: 'Teste de push',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Corpo da notificação push',
    example: 'Esta é uma notificação de teste enviada pela API.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    description: 'Dados extras da notificação (serão convertidos para string)',
    example: {
      type: 'manual_test',
      source: 'api',
      classId: '123e4567-e89b-12d3-a456-426614174001',
    },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

export class SendTestPushToAllUsersDto {
  @ApiProperty({
    description: 'Título da notificação push',
    example: 'Aviso geral',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Corpo da notificação push',
    example: 'Mensagem enviada para todos os usuários.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    description: 'Dados extras da notificação (serão convertidos para string)',
    example: {
      type: 'broadcast_test',
      source: 'api',
    },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}
