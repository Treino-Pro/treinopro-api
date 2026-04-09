import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import {
  NotificationsService,
  NotificationData,
} from './notifications.service';
import {
  SendTestPushToAllUsersDto,
  SendTestPushToUserDto,
} from './dto/notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ===== ENVIO MANUAL DE NOTIFICAÇÕES =====

  @Post('send/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar email',
    description:
      'Envia um email baseado em template para um usuário específico',
  })
  @ApiResponse({ status: 200, description: 'Email enviado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async sendEmail(
    @Body()
    body: { userId: string; template: string; data: Record<string, any> },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendEmail(
      body.userId,
      body.template,
      body.data,
    );
    return { message: 'Email enviado com sucesso' };
  }

  @Post('send/in-app')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Criar notificação in-app',
    description: 'Cria uma notificação in-app para um usuário específico',
  })
  @ApiResponse({
    status: 200,
    description: 'Notificação in-app criada com sucesso',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async sendInAppNotification(
    @Body()
    body: { userId: string; template: string; data: Record<string, any> },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendInAppNotification(
      body.userId,
      body.template,
      body.data,
    );
    return { message: 'Notificação in-app criada com sucesso' };
  }

  @Post('send/push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar push notification',
    description: 'Envia uma push notification para um usuário específico',
  })
  @ApiResponse({
    status: 200,
    description: 'Push notification enviado com sucesso',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async sendPushNotification(
    @Body()
    body: { userId: string; template: string; data: Record<string, any> },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendPushNotification(
      body.userId,
      body.template,
      body.data,
    );
    return { message: 'Push notification enviado com sucesso' };
  }

  @Post('send/multi-channel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar notificação multi-canal',
    description: 'Envia notificação por múltiplos canais (email, push, sms)',
  })
  @ApiResponse({
    status: 200,
    description: 'Notificações enviadas com sucesso',
  })
  async sendMultiChannelNotification(
    @Body()
    body: {
      userId: string;
      template: string;
      data: Record<string, any>;
      channels?: ('email' | 'in-app' | 'push')[];
    },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendMultiChannelNotification(
      body.userId,
      body.template,
      body.data,
      body.channels,
    );
    return { message: 'Notificações multi-canal enviadas com sucesso' };
  }

  @Post('send/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar notificações em lote',
    description: 'Envia múltiplas notificações de uma vez',
  })
  @ApiResponse({
    status: 200,
    description: 'Notificações em lote enviadas com sucesso',
  })
  async sendBulkNotifications(
    @Body() body: { notifications: NotificationData[] },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendBulkNotifications(body.notifications);
    return {
      message: `${body.notifications.length} notificações em lote enviadas com sucesso`,
    };
  }

  // ===== TEMPLATES ESPECÍFICOS =====

  @Post('proposal-match')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Notificar match de proposta',
    description:
      'Envia notificação quando uma proposta é disponibilizada para um personal',
  })
  async sendProposalMatchNotification(
    @Body() body: { personalId: string; proposalData: any },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendProposalMatchNotification(
      body.personalId,
      body.proposalData,
    );
    return { message: 'Notificação de match de proposta enviada' };
  }

  @Post('payment-confirmation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Notificar confirmação de pagamento',
    description: 'Envia notificação quando um pagamento é confirmado',
  })
  async sendPaymentConfirmationNotification(
    @Body() body: { userId: string; paymentData: any },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendPaymentConfirmationNotification(
      body.userId,
      body.paymentData,
    );
    return { message: 'Notificação de confirmação de pagamento enviada' };
  }

  @Post('class-reminder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar lembrete de aula',
    description: 'Envia lembrete sobre uma aula próxima',
  })
  async sendClassReminderNotification(
    @Body() body: { userId: string; classData: any },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendClassReminderNotification(
      body.userId,
      body.classData,
    );
    return { message: 'Lembrete de aula enviado' };
  }

  @Post('class-cancellation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Notificar cancelamento de aula',
    description: 'Envia notificação quando uma aula é cancelada',
  })
  async sendClassCancellationNotification(
    @Body() body: { userId: string; classData: any; reason: string },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendClassCancellationNotification(
      body.userId,
      body.classData,
      body.reason,
    );
    return { message: 'Notificação de cancelamento enviada' };
  }

  @Post('refund-processed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Notificar reembolso processado',
    description: 'Envia notificação quando um reembolso é processado',
  })
  async sendRefundNotification(
    @Body() body: { userId: string; refundData: any },
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendRefundNotification(
      body.userId,
      body.refundData,
    );
    return { message: 'Notificação de reembolso enviada' };
  }

  // ===== GERENCIAMENTO DE NOTIFICAÇÕES IN-APP =====

  @Get('in-app')
  @ApiOperation({
    summary: 'Obter notificações in-app do usuário',
    description: 'Retorna as notificações in-app do usuário autenticado',
  })
  @ApiResponse({ status: 200, description: 'Notificações obtidas com sucesso' })
  async getUserNotifications(
    @Request() req: any,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    return this.notificationsService.getUserNotifications(req.user.sub, limit);
  }

  @Get('in-app/unread')
  @ApiOperation({
    summary: 'Obter notificações não lidas',
    description:
      'Retorna apenas as notificações não lidas do usuário autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Notificações não lidas obtidas com sucesso',
  })
  async getUnreadNotifications(@Request() req: any): Promise<any[]> {
    return this.notificationsService.getUnreadNotifications(req.user.sub);
  }

  @Get('in-app/unread/count')
  @ApiOperation({
    summary: 'Obter contagem de notificações não lidas',
    description: 'Retorna o número de notificações não lidas do usuário',
  })
  @ApiResponse({ status: 200, description: 'Contagem obtida com sucesso' })
  async getUnreadCount(@Request() req: any): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(req.user.sub);
    return { count };
  }

  @Put('in-app/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar notificação como lida',
    description: 'Marca uma notificação específica como lida',
  })
  @ApiResponse({ status: 200, description: 'Notificação marcada como lida' })
  async markNotificationAsRead(
    @Param('id') notificationId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.markNotificationAsRead(
      notificationId,
      req.user.sub,
    );
    return { message: 'Notificação marcada como lida' };
  }

  @Put('in-app/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar todas as notificações como lidas',
    description: 'Marca todas as notificações do usuário como lidas',
  })
  @ApiResponse({
    status: 200,
    description: 'Todas as notificações marcadas como lidas',
  })
  async markAllNotificationsAsRead(
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.markAllNotificationsAsRead(req.user.sub);
    return { message: 'Todas as notificações marcadas como lidas' };
  }

  @Delete('in-app/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deletar notificação',
    description: 'Remove uma notificação específica',
  })
  @ApiResponse({ status: 200, description: 'Notificação deletada com sucesso' })
  async deleteNotification(
    @Param('id') notificationId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.deleteNotification(
      notificationId,
      req.user.sub,
    );
    return { message: 'Notificação deletada com sucesso' };
  }

  @Delete('in-app')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Limpar todas as notificações',
    description: 'Remove todas as notificações in-app do usuário autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Todas as notificações removidas com sucesso',
  })
  async clearAllNotifications(@Request() req: any): Promise<{ message: string }> {
    await this.notificationsService.clearAllNotifications(req.user.sub);
    return { message: 'Todas as notificações removidas com sucesso' };
  }

  // ===== PREFERÊNCIAS DO USUÁRIO =====

  @Get('preferences')
  @ApiOperation({
    summary: 'Obter preferências de notificação',
    description:
      'Retorna as preferências de notificação do usuário autenticado',
  })
  @ApiResponse({ status: 200, description: 'Preferências obtidas com sucesso' })
  async getUserNotificationPreferences(@Request() req: any): Promise<any> {
    return this.notificationsService.getUserNotificationPreferences(
      req.user.sub,
    );
  }

  @Post('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atualizar preferências de notificação',
    description:
      'Atualiza as preferências de notificação do usuário autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferências atualizadas com sucesso',
  })
  async updateUserNotificationPreferences(
    @Body() preferences: any,
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.updateUserNotificationPreferences(
      req.user.sub,
      preferences,
    );
    return { message: 'Preferências de notificação atualizadas com sucesso' };
  }

  // ===== ESTATÍSTICAS =====

  @Get('stats')
  @ApiOperation({
    summary: 'Obter estatísticas de notificações',
    description: 'Retorna estatísticas de notificações do usuário autenticado',
  })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  async getNotificationStats(@Request() req: any): Promise<any> {
    return this.notificationsService.getNotificationStats(req.user.sub);
  }

  @Get('stats/global')
  @ApiOperation({
    summary: 'Obter estatísticas globais de notificações',
    description: 'Retorna estatísticas globais de notificações (apenas admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas globais obtidas com sucesso',
  })
  async getGlobalNotificationStats(@Request() req: any): Promise<any> {
    // TODO: Verificar se usuário é admin
    return this.notificationsService.getNotificationStats();
  }

  // ===== TESTE DE NOTIFICAÇÕES =====

  @Post('test/push/all')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Testar push para todos os usuários',
    description:
      'Envia push notification de teste para todos os usuários cadastrados',
  })
  @ApiResponse({
    status: 200,
    description: 'Broadcast push processado',
  })
  @ApiResponse({
    status: 400,
    description: 'Payload inválido',
  })
  async testPushNotificationToAllUsers(
    @Body(ValidationPipe) body: SendTestPushToAllUsersDto,
  ): Promise<{
    message: string;
    totalUsers: number;
    deliveredUsers: number;
    skippedUsers: number;
    failedUsers: number;
  }> {
    const result =
      await this.notificationsService.sendDirectPushNotificationToAllUsers(
        body.title,
        body.body,
        body.data ?? {},
      );

    return {
      message: 'Broadcast push processado',
      ...result,
    };
  }

  @Post('test/push/user')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Testar push para um usuário específico',
    description:
      'Envia push notification de teste para um usuário específico informando userId, title e body',
  })
  @ApiResponse({
    status: 200,
    description: 'Push de teste processado',
  })
  @ApiResponse({
    status: 400,
    description: 'Payload inválido',
  })
  async testPushNotificationToUser(
    @Body(ValidationPipe) body: SendTestPushToUserDto,
  ): Promise<{ message: string; delivered: boolean; reason?: string }> {
    const result = await this.notificationsService.sendDirectPushNotification(
      body.userId,
      body.title,
      body.body,
      body.data ?? {},
    );

    if (!result.delivered) {
      return {
        message:
          'Push processado, mas não entregue (usuário sem token FCM ou Firebase indisponível)',
        delivered: false,
        reason: result.reason,
      };
    }

    return {
      message: 'Push notification de teste enviada com sucesso',
      delivered: true,
    };
  }

  @Post('test/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Testar envio de email',
    description: 'Envia um email de teste para o usuário autenticado',
  })
  async testEmail(@Request() req: any): Promise<{ message: string }> {
    await this.notificationsService.sendEmail(
      req.user.sub,
      'profile-reminder',
      {
        firstName: 'Teste',
        userType: 'student',
        profileUrl: `${process.env.FRONTEND_URL}/profile`,
      },
    );
    return { message: 'Email de teste enviado' };
  }

  @Post('test/in-app')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Testar notificação in-app',
    description:
      'Cria uma notificação in-app de teste para o usuário autenticado',
  })
  async testInAppNotification(
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendInAppNotification(
      req.user.sub,
      'profile-reminder',
      {
        title: 'Teste de Notificação',
        message: 'Esta é uma notificação de teste!',
      },
    );
    return { message: 'Notificação in-app de teste criada' };
  }

  @Post('test/push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Testar push notification',
    description:
      'Envia uma push notification de teste para o usuário autenticado',
  })
  async testPushNotification(
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.notificationsService.sendPushNotification(
      req.user.sub,
      'profile-reminder',
      {
        title: 'Teste de Push Notification',
        body: 'Esta é uma notificação de teste!',
      },
    );
    return { message: 'Push notification de teste enviada' };
  }
}
