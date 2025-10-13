import { IsString, IsUUID, IsOptional, IsBoolean, IsDateString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ 
    description: 'ID da classe/treino',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  classId: string;

  @ApiProperty({ 
    description: 'ID do destinatário',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @IsUUID()
  receiverId: string;

  @ApiProperty({ 
    description: 'Texto da mensagem',
    example: 'Olá! Estou animado para nosso treino hoje!',
    minLength: 1,
    maxLength: 1000
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  messageText: string;
}

export class GetMessagesDto {
  @ApiProperty({ 
    description: 'ID da classe/treino',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  classId: string;

  @ApiPropertyOptional({ 
    description: 'Número da página para paginação',
    example: 1,
    default: 1
  })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ 
    description: 'Número de mensagens por página',
    example: 50,
    default: 50
  })
  @IsOptional()
  limit?: number = 50;
}

export class MarkAsReadDto {
  @ApiProperty({ 
    description: 'ID da classe/treino',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  classId: string;

  @ApiProperty({ 
    description: 'ID da mensagem',
    example: '123e4567-e89b-12d3-a456-426614174002'
  })
  @IsUUID()
  messageId: string;
}

export class MessageResponseDto {
  @ApiProperty({ 
    description: 'ID da mensagem',
    example: '123e4567-e89b-12d3-a456-426614174002'
  })
  id: string;

  @ApiProperty({ 
    description: 'ID da classe/treino',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  classId: string;

  @ApiProperty({ 
    description: 'ID do remetente',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  senderId: string;

  @ApiProperty({ 
    description: 'ID do destinatário',
    example: '123e4567-e89b-12d3-a456-426614174003'
  })
  receiverId: string;

  @ApiProperty({ 
    description: 'Texto da mensagem',
    example: 'Olá! Estou animado para nosso treino hoje!'
  })
  messageText: string;

  @ApiProperty({ 
    description: 'Data de envio',
    example: '2024-01-15T10:30:00Z'
  })
  sentAt: Date;

  @ApiProperty({ 
    description: 'Se a mensagem foi lida',
    example: false
  })
  isRead: boolean;

  @ApiProperty({ 
    description: 'Data de criação',
    example: '2024-01-15T10:30:00Z'
  })
  createdAt: Date;

  @ApiPropertyOptional({ 
    description: 'Dados do remetente',
    example: { name: 'João Silva', profilePicture: 'https://example.com/photo.jpg' }
  })
  sender?: {
    id: string;
    name: string;
    profilePicture?: string;
  };

  @ApiPropertyOptional({ 
    description: 'Dados do destinatário',
    example: { name: 'Maria Santos', profilePicture: 'https://example.com/photo2.jpg' }
  })
  receiver?: {
    id: string;
    name: string;
    profilePicture?: string;
  };
}

export class ChatStatsDto {
  @ApiProperty({ 
    description: 'Total de mensagens',
    example: 150
  })
  totalMessages: number;

  @ApiProperty({ 
    description: 'Mensagens não lidas',
    example: 5
  })
  unreadMessages: number;

  @ApiProperty({ 
    description: 'Total de conversas',
    example: 12
  })
  totalConversations: number;

  @ApiProperty({ 
    description: 'Conversas ativas (com mensagens recentes)',
    example: 3
  })
  activeConversations: number;
}

export class WebSocketMessageDto {
  @ApiProperty({ 
    description: 'Tipo da mensagem WebSocket',
    example: 'message_sent'
  })
  type: 'message_sent' | 'message_received' | 'typing_start' | 'typing_stop' | 'user_online' | 'user_offline';

  @ApiProperty({ 
    description: 'Dados da mensagem',
    example: { classId: '123e4567-e89b-12d3-a456-426614174000', messageText: 'Olá!' }
  })
  data: any;

  @ApiProperty({ 
    description: 'ID do usuário',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  userId: string;

  @ApiProperty({ 
    description: 'Timestamp da mensagem',
    example: '2024-01-15T10:30:00Z'
  })
  timestamp: Date;
}
