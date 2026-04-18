import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UpdateServiceLocationDto,
  UserSearchDto,
  UpdateUserStatusDto,
  UserResponseDto,
  UserListResponseDto,
} from './dto/users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Usuários')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ===== CRUD BÁSICO =====

  @Post()
  @ApiOperation({
    summary: 'Criar novo usuário',
    description:
      'Cria um novo usuário no sistema. Requer autenticação de admin.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuário criado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email já está em uso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  async createUser(
    @Body() createUserDto: CreateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.createUser(createUserDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar usuários',
    description: 'Lista usuários com filtros e paginação',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários retornada com sucesso',
    type: UserListResponseDto,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Buscar por nome, email ou CREF',
  })
  @ApiQuery({
    name: 'userType',
    required: false,
    enum: ['student', 'personal'],
    description: 'Filtrar por tipo de usuário',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'suspended'],
    description: 'Filtrar por status',
  })
  @ApiQuery({
    name: 'specialty',
    required: false,
    description: 'Filtrar por especialidade',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Página atual',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Itens por página',
  })
  async getUsers(
    @Query() searchDto: UserSearchDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.getUsers(searchDto);
  }

  @Get('personal-trainers')
  @ApiOperation({
    summary: 'Listar personal trainers',
    description: 'Lista apenas personal trainers com filtros e paginação',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de personal trainers retornada com sucesso',
    type: UserListResponseDto,
  })
  async getPersonalTrainers(
    @Query() searchDto: UserSearchDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.getPersonalTrainers(searchDto);
  }

  @Get('students')
  @ApiOperation({
    summary: 'Listar alunos',
    description: 'Lista apenas alunos com filtros e paginação',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de alunos retornada com sucesso',
    type: UserListResponseDto,
  })
  async getStudents(
    @Query() searchDto: UserSearchDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.getStudents(searchDto);
  }

  @Get('specialty/:specialty')
  @ApiOperation({
    summary: 'Listar usuários por especialidade',
    description: 'Lista usuários filtrados por especialidade',
  })
  @ApiParam({ name: 'specialty', description: 'Especialidade para filtrar' })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários por especialidade retornada com sucesso',
    type: UserListResponseDto,
  })
  async getUsersBySpecialty(
    @Param('specialty') specialty: string,
    @Query() searchDto: UserSearchDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.getUsersBySpecialty(specialty, searchDto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Estatísticas de usuários',
    description: 'Retorna estatísticas gerais dos usuários',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas retornadas com sucesso',
  })
  async getUserStatistics(): Promise<any> {
    return this.usersService.getUserStatistics();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter usuário por ID',
    description: 'Retorna os dados de um usuário específico',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Usuário encontrado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async getUserById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualizar usuário',
    description: 'Atualiza os dados de um usuário específico',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Usuário atualizado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Atualizar status do usuário',
    description:
      'Atualiza o status de um usuário (active, inactive, suspended)',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Status atualizado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async updateUserStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUserStatus(id, updateStatusDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desativar usuário',
    description: 'Desativa um usuário (soft delete)',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 204,
    description: 'Usuário desativado com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async deleteUser(@Param('id') id: string): Promise<void> {
    return this.usersService.deleteUser(id);
  }

  // ===== GERENCIAMENTO DE PERFIL =====

  @Get('profile/me')
  @ApiOperation({
    summary: 'Obter perfil do usuário logado',
    description: 'Retorna os dados do perfil do usuário autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil retornado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async getProfile(@Request() req: any): Promise<UserResponseDto> {
    const userId = req.user?.id ?? req.user?.sub;
    const response = await this.usersService.getProfile(userId);
    return response;
  }

  @Put('profile/me')
  @ApiOperation({
    summary: 'Atualizar perfil do usuário logado',
    description: 'Atualiza os dados do perfil do usuário autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil atualizado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  async updateProfile(
    @Request() req: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const userId = req.user.sub;
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  @Patch('profile/me/service-location')
  @ApiOperation({
    summary: 'Atualizar localização de atendimento do personal',
    description:
      'Atualiza a localização e raio de atendimento do personal trainer',
  })
  @ApiResponse({
    status: 200,
    description: 'Localização atualizada com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'Apenas personal trainers podem atualizar localização de atendimento',
  })
  async updateServiceLocation(
    @Request() req: any,
    @Body() updateServiceLocationDto: UpdateServiceLocationDto,
  ): Promise<UserResponseDto> {
    const userId = req.user.sub;
    const userType = req.user.userType;

    // ✅ Apenas personals podem atualizar localização de atendimento
    if (userType !== 'personal') {
      throw new ForbiddenException(
        'Apenas personal trainers podem atualizar localização de atendimento',
      );
    }

    return this.usersService.updateServiceLocation(
      userId,
      updateServiceLocationDto,
    );
  }

  // ===== MÉTODOS AUXILIARES =====

  @Get('email/:email')
  @ApiOperation({
    summary: 'Obter usuário por email',
    description: 'Retorna os dados de um usuário pelo email',
  })
  @ApiParam({ name: 'email', description: 'Email do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Usuário encontrado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async getUserByEmail(
    @Param('email') email: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.getUserByEmail(email);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  @Get('exists/:id')
  @ApiOperation({
    summary: 'Verificar se usuário existe',
    description: 'Verifica se um usuário existe pelo ID',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Verificação realizada com sucesso',
  })
  async userExists(@Param('id') id: string): Promise<{ exists: boolean }> {
    const exists = await this.usersService.userExists(id);
    return { exists };
  }

  @Delete('account/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir conta permanentemente',
    description:
      'Exclui a conta do usuário autenticado permanentemente. ' +
      'Não é permitido se houver aulas agendadas. ' +
      'O histórico de aulas e propostas será mantido.',
  })
  @ApiResponse({
    status: 204,
    description: 'Conta excluída com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Não é possível excluir - usuário possui aulas agendadas',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async deleteAccount(@Request() req: any): Promise<void> {
    const userId = req.user?.id ?? req.user?.sub;
    console.log(
      '🗑️ [USERS][Controller] Solicitação de exclusão de conta:',
      userId,
    );
    return this.usersService.deleteAccount(userId);
  }

  // ===== ENDPOINT PARA TOKEN FCM =====

  @Post(':id/fcm-token')
  @UseGuards(JwtAuthGuard) // ✅ Exigir autenticação
  @ApiOperation({
    summary: 'Salvar token FCM do usuário',
    description:
      'Salva o token Firebase Cloud Messaging do usuário para receber notificações push. Usuário só pode atualizar seu próprio token.',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Token FCM salvo com sucesso',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autenticado',
  })
  @ApiResponse({
    status: 403,
    description: 'Não autorizado - só pode atualizar seu próprio token',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  @HttpCode(HttpStatus.OK)
  async saveFcmToken(
    @Param('id') userId: string,
    @Body() body: { token: string; platform?: string; deviceInfo?: string },
    @Request() req: any,
  ) {
    // ✅ Validar que usuário só pode atualizar seu próprio token
    if (req.user.sub !== userId) {
      throw new ForbiddenException(
        'Você só pode atualizar seu próprio token FCM',
      );
    }

    return this.usersService.saveFcmToken(
      userId,
      body.token,
      body.platform,
      body.deviceInfo,
    );
  }

  @Delete(':id/fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Remover token FCM do usuário (logout)',
    description:
      'Remove o token FCM do dispositivo ao fazer logout, evitando notificações para usuários deslogados.',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiQuery({ name: 'token', description: 'Token FCM a remover' })
  @ApiResponse({ status: 200, description: 'Token FCM removido com sucesso' })
  @ApiResponse({ status: 400, description: 'Token não informado' })
  @ApiResponse({ status: 403, description: 'Não autorizado' })
  @HttpCode(HttpStatus.OK)
  async removeFcmToken(
    @Param('id') userId: string,
    @Query('token') token: string,
    @Request() req: any,
  ) {
    if (req.user.sub !== userId) {
      throw new ForbiddenException(
        'Você só pode remover seu próprio token FCM',
      );
    }
    if (!token) {
      throw new BadRequestException('Token FCM não informado');
    }
    return this.usersService.removeFcmToken(userId, token);
  }

  // ===== ENDPOINT PARA TOKEN DE LIVE ACTIVITY =====

  @Put(':id/live-activity-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Salvar token de Live Activity do usuário',
    description:
      'Salva o token APNs da Live Activity para receber push-to-update de propostas (iOS only).',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Token salvo com sucesso' })
  @ApiResponse({ status: 403, description: 'Não autorizado' })
  @HttpCode(HttpStatus.OK)
  async saveLiveActivityToken(
    @Param('id') userId: string,
    @Body() body: { token: string; proposalId?: string },
    @Request() req: any,
  ) {
    if (req.user.sub !== userId) {
      throw new ForbiddenException(
        'Você só pode atualizar seu próprio token de Live Activity',
      );
    }

    return this.usersService.saveLiveActivityToken(
      userId,
      body.token,
      body.proposalId,
    );
  }
}
