import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import {
  SendMessageDto,
  GetMessagesDto,
  MarkAsReadDto,
  MessageResponseDto,
  ChatStatsDto,
} from './dto/chat.dto';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Enviar mensagem',
    description: 'Envia uma nova mensagem em uma conversa de classe'
  })
  @ApiResponse({
    status: 201,
    description: 'Mensagem enviada com sucesso',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou destinatário incorreto',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuário não tem acesso à classe',
  })
  @ApiResponse({
    status: 404,
    description: 'Classe ou destinatário não encontrado',
  })
  async sendMessage(
    @Request() req: any,
    @Body() sendMessageDto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    return this.chatService.sendMessage(req.user.sub, sendMessageDto);
  }

  @Get('messages')
  @ApiOperation({ 
    summary: 'Listar mensagens',
    description: 'Lista mensagens de uma conversa de classe com paginação'
  })
  @ApiQuery({ name: 'classId', description: 'ID da classe', type: String })
  @ApiQuery({ name: 'page', description: 'Número da página', required: false, type: Number })
  @ApiQuery({ name: 'limit', description: 'Mensagens por página', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Lista de mensagens retornada com sucesso',
    schema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: { $ref: '#/components/schemas/MessageResponseDto' },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Usuário não tem acesso à classe',
  })
  @ApiResponse({
    status: 404,
    description: 'Classe não encontrada',
  })
  async getMessages(
    @Request() req: any,
    @Query() getMessagesDto: GetMessagesDto,
  ) {
    return this.chatService.getMessages(req.user.sub, getMessagesDto);
  }

  @Put('messages/:messageId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Marcar mensagem como lida',
    description: 'Marca uma mensagem específica como lida'
  })
  @ApiParam({ name: 'messageId', description: 'ID da mensagem' })
  @ApiResponse({
    status: 200,
    description: 'Mensagem marcada como lida com sucesso',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Mensagem não encontrada ou usuário não é o destinatário',
  })
  async markAsRead(
    @Request() req: any,
    @Param('messageId') messageId: string,
    @Body() markAsReadDto: Omit<MarkAsReadDto, 'messageId'>,
  ) {
    return this.chatService.markAsRead(req.user.sub, {
      ...markAsReadDto,
      messageId,
    });
  }

  @Put('classes/:classId/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Marcar todas as mensagens como lidas',
    description: 'Marca todas as mensagens não lidas de uma classe como lidas'
  })
  @ApiParam({ name: 'classId', description: 'ID da classe' })
  @ApiResponse({
    status: 200,
    description: 'Mensagens marcadas como lidas com sucesso',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        updatedCount: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Usuário não tem acesso à classe',
  })
  @ApiResponse({
    status: 404,
    description: 'Classe não encontrada',
  })
  async markAllAsRead(
    @Request() req: any,
    @Param('classId') classId: string,
  ) {
    return this.chatService.markAllAsRead(req.user.sub, classId);
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Estatísticas do chat',
    description: 'Retorna estatísticas gerais do chat do usuário'
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas retornadas com sucesso',
    type: ChatStatsDto,
  })
  async getChatStats(@Request() req: any): Promise<ChatStatsDto> {
    return this.chatService.getChatStats(req.user.sub);
  }

  @Get('conversations')
  @ApiOperation({ 
    summary: 'Listar conversas',
    description: 'Lista todas as conversas do usuário com última mensagem e contadores'
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de conversas retornada com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          classId: { type: 'string' },
          otherParticipant: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              profilePicture: { type: 'string' },
            },
          },
          lastMessage: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              messageText: { type: 'string' },
              sentAt: { type: 'string', format: 'date-time' },
              isRead: { type: 'boolean' },
            },
          },
          unreadCount: { type: 'number' },
        },
      },
    },
  })
  async getConversations(@Request() req: any) {
    return this.chatService.getConversations(req.user.sub);
  }

  @Get('classes/:classId/messages')
  @ApiOperation({ 
    summary: 'Mensagens de uma classe específica',
    description: 'Lista mensagens de uma classe específica (alias para GET /messages)'
  })
  @ApiParam({ name: 'classId', description: 'ID da classe' })
  @ApiQuery({ name: 'page', description: 'Número da página', required: false, type: Number })
  @ApiQuery({ name: 'limit', description: 'Mensagens por página', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Lista de mensagens retornada com sucesso',
  })
  async getClassMessages(
    @Request() req: any,
    @Param('classId') classId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(req.user.sub, {
      classId,
      page: page || 1,
      limit: limit || 50,
    });
  }
}
