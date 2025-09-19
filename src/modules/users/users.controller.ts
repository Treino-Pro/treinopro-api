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
  NotFoundException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { 
  CreateUserDto, 
  UpdateUserDto, 
  UpdateProfileDto, 
  UserSearchDto, 
  UpdateUserStatusDto,
  UserResponseDto,
  UserListResponseDto
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
    description: 'Cria um novo usuário no sistema. Requer autenticação de admin.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Usuário criado com sucesso',
    type: UserResponseDto
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Email já está em uso'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos'
  })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createUser(createUserDto);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Listar usuários',
    description: 'Lista usuários com filtros e paginação'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de usuários retornada com sucesso',
    type: UserListResponseDto
  })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por nome, email ou CREF' })
  @ApiQuery({ name: 'userType', required: false, enum: ['student', 'personal'], description: 'Filtrar por tipo de usuário' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'suspended'], description: 'Filtrar por status' })
  @ApiQuery({ name: 'specialty', required: false, description: 'Filtrar por especialidade' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página atual' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página' })
  async getUsers(@Query() searchDto: UserSearchDto): Promise<UserListResponseDto> {
    return this.usersService.getUsers(searchDto);
  }

  @Get('personal-trainers')
  @ApiOperation({ 
    summary: 'Listar personal trainers',
    description: 'Lista apenas personal trainers com filtros e paginação'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de personal trainers retornada com sucesso',
    type: UserListResponseDto
  })
  async getPersonalTrainers(@Query() searchDto: UserSearchDto): Promise<UserListResponseDto> {
    return this.usersService.getPersonalTrainers(searchDto);
  }

  @Get('students')
  @ApiOperation({ 
    summary: 'Listar alunos',
    description: 'Lista apenas alunos com filtros e paginação'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de alunos retornada com sucesso',
    type: UserListResponseDto
  })
  async getStudents(@Query() searchDto: UserSearchDto): Promise<UserListResponseDto> {
    return this.usersService.getStudents(searchDto);
  }

  @Get('specialty/:specialty')
  @ApiOperation({ 
    summary: 'Listar usuários por especialidade',
    description: 'Lista usuários filtrados por especialidade'
  })
  @ApiParam({ name: 'specialty', description: 'Especialidade para filtrar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de usuários por especialidade retornada com sucesso',
    type: UserListResponseDto
  })
  async getUsersBySpecialty(
    @Param('specialty') specialty: string,
    @Query() searchDto: UserSearchDto
  ): Promise<UserListResponseDto> {
    return this.usersService.getUsersBySpecialty(specialty, searchDto);
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Estatísticas de usuários',
    description: 'Retorna estatísticas gerais dos usuários'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas retornadas com sucesso'
  })
  async getUserStatistics(): Promise<any> {
    return this.usersService.getUserStatistics();
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obter usuário por ID',
    description: 'Retorna os dados de um usuário específico'
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuário encontrado com sucesso',
    type: UserResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado'
  })
  async getUserById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Atualizar usuário',
    description: 'Atualiza os dados de um usuário específico'
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuário atualizado com sucesso',
    type: UserResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos'
  })
  async updateUser(
    @Param('id') id: string, 
    @Body() updateUserDto: UpdateUserDto
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Patch(':id/status')
  @ApiOperation({ 
    summary: 'Atualizar status do usuário',
    description: 'Atualiza o status de um usuário (active, inactive, suspended)'
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Status atualizado com sucesso',
    type: UserResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado'
  })
  async updateUserStatus(
    @Param('id') id: string, 
    @Body() updateStatusDto: UpdateUserStatusDto
  ): Promise<UserResponseDto> {
    return this.usersService.updateUserStatus(id, updateStatusDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Desativar usuário',
    description: 'Desativa um usuário (soft delete)'
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 204, 
    description: 'Usuário desativado com sucesso'
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado'
  })
  async deleteUser(@Param('id') id: string): Promise<void> {
    return this.usersService.deleteUser(id);
  }

  // ===== GERENCIAMENTO DE PERFIL =====

  @Get('profile/me')
  @ApiOperation({ 
    summary: 'Obter perfil do usuário logado',
    description: 'Retorna os dados do perfil do usuário autenticado'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Perfil retornado com sucesso',
    type: UserResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado'
  })
  async getProfile(@Request() req: any): Promise<UserResponseDto> {
    const userId = req.user.sub;
    return this.usersService.getProfile(userId);
  }

  @Put('profile/me')
  @ApiOperation({ 
    summary: 'Atualizar perfil do usuário logado',
    description: 'Atualiza os dados do perfil do usuário autenticado'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Perfil atualizado com sucesso',
    type: UserResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos'
  })
  async updateProfile(
    @Request() req: any,
    @Body() updateProfileDto: UpdateProfileDto
  ): Promise<UserResponseDto> {
    const userId = req.user.sub;
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  // ===== MÉTODOS AUXILIARES =====

  @Get('email/:email')
  @ApiOperation({ 
    summary: 'Obter usuário por email',
    description: 'Retorna os dados de um usuário pelo email'
  })
  @ApiParam({ name: 'email', description: 'Email do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuário encontrado com sucesso',
    type: UserResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado'
  })
  async getUserByEmail(@Param('email') email: string): Promise<UserResponseDto> {
    const user = await this.usersService.getUserByEmail(email);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  @Get('exists/:id')
  @ApiOperation({ 
    summary: 'Verificar se usuário existe',
    description: 'Verifica se um usuário existe pelo ID'
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Verificação realizada com sucesso'
  })
  async userExists(@Param('id') id: string): Promise<{ exists: boolean }> {
    const exists = await this.usersService.userExists(id);
    return { exists };
  }
}
