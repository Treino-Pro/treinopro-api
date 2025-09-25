import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { eq, and, or, like, desc, asc, count, sql } from 'drizzle-orm';
import { users } from '../../database/schema';
import { 
  CreateUserDto, 
  UpdateUserDto, 
  UpdateProfileDto, 
  UserSearchDto, 
  UpdateUserStatusDto,
  UserResponseDto,
  UserListResponseDto,
  UserType,
  UserStatus
} from './dto/users.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
  ) {}

  // ===== CRUD BÁSICO =====

  /**
   * Criar novo usuário
   */
  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {

    // Verificar se email já existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, createUserDto.email),
    });

    if (existingUser) {
      throw new ConflictException('Email já está em uso');
    }

    // Hash da senha
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(createUserDto.password, saltRounds);

    // Preparar dados para inserção
    const userData = {
      email: createUserDto.email,
      passwordHash,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      birthDate: new Date(createUserDto.birthDate),
      userType: createUserDto.userType,
      documentType: createUserDto.documentType,
      documentNumber: createUserDto.documentNumber,
      documentImageId: createUserDto.documentImageId,
      profileImageId: createUserDto.profileImageId,
      cref: createUserDto.cref,
      crefImageId: createUserDto.crefImageId,
      specialties: createUserDto.specialties,
      isMinor: createUserDto.isMinor || false,
      guardianName: createUserDto.guardianName,
      guardianEmail: createUserDto.guardianEmail,
      termsAccepted: createUserDto.termsAccepted,
      privacyPolicyAccepted: createUserDto.privacyPolicyAccepted,
      termsAcceptedDate: new Date(),
    };

    // Inserir usuário
    const [newUser] = await this.db.insert(users).values(userData).returning();

    return this.mapUserToResponse(newUser);
  }

  /**
   * Listar usuários com filtros e paginação
   */
  async getUsers(searchDto: UserSearchDto): Promise<UserListResponseDto> {

    const { search, userType, status, specialty, page = 1, limit = 10 } = searchDto;
    const offset = (page - 1) * limit;

    // Construir condições de busca
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.cref, `%${search}%`)
        )
      );
    }

    if (userType) {
      conditions.push(eq(users.userType, userType));
    }

    if (status) {
      conditions.push(eq(users.status, status));
    }

    if (specialty) {
      conditions.push(sql`${users.specialties} @> ${JSON.stringify([specialty])}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Buscar usuários
    const usersList = await this.db.query.users.findMany({
      where: whereClause,
      orderBy: [desc(users.createdAt)],
      limit,
      offset,
    });

    // Contar total
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(users)
      .where(whereClause);


    return {
      users: usersList.map(user => this.mapUserToResponse(user)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obter usuário por ID
   */
  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.mapUserToResponse(user);
  }

  /**
   * Atualizar usuário
   */
  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    console.log('👤 [USERS] Atualizando usuário:', id);

    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!existingUser) {
      console.log('❌ [USERS] Usuário não encontrado:', id);
      throw new NotFoundException('Usuário não encontrado');
    }

    // Preparar dados para atualização
    const updateData: any = {
      ...updateUserDto,
      updatedAt: new Date(),
    };

    // Remover campos undefined
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Atualizar usuário
    const [updatedUser] = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    console.log('✅ [USERS] Usuário atualizado com sucesso:', id);
    return this.mapUserToResponse(updatedUser);
  }

  /**
   * Atualizar status do usuário
   */
  async updateUserStatus(id: string, updateStatusDto: UpdateUserStatusDto): Promise<UserResponseDto> {
    console.log('👤 [USERS] Atualizando status do usuário:', id, 'para:', updateStatusDto.status);

    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!existingUser) {
      console.log('❌ [USERS] Usuário não encontrado:', id);
      throw new NotFoundException('Usuário não encontrado');
    }

    // Atualizar status
    const [updatedUser] = await this.db
      .update(users)
      .set({ 
        status: updateStatusDto.status,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();

    console.log('✅ [USERS] Status atualizado com sucesso:', id);
    return this.mapUserToResponse(updatedUser);
  }

  /**
   * Deletar usuário (soft delete - apenas desativar)
   */
  async deleteUser(id: string): Promise<void> {
    console.log('👤 [USERS] Desativando usuário:', id);

    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!existingUser) {
      console.log('❌ [USERS] Usuário não encontrado:', id);
      throw new NotFoundException('Usuário não encontrado');
    }

    // Desativar usuário (soft delete)
    await this.db
      .update(users)
      .set({ 
        status: UserStatus.INACTIVE,
        updatedAt: new Date()
      })
      .where(eq(users.id, id));

    console.log('✅ [USERS] Usuário desativado com sucesso:', id);
  }

  // ===== GERENCIAMENTO DE PERFIL =====

  /**
   * Obter perfil do usuário logado
   */
  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.mapUserToResponse(user);
  }

  /**
   * Atualizar perfil do usuário logado
   */
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<UserResponseDto> {
    console.log('👤 [USERS] Atualizando perfil do usuário:', userId);

    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.log('❌ [USERS] Usuário não encontrado:', userId);
      throw new NotFoundException('Usuário não encontrado');
    }

    // Preparar dados para atualização
    const updateData: any = {
      ...updateProfileDto,
      updatedAt: new Date(),
    };

    // Remover campos undefined
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Atualizar perfil
    const [updatedUser] = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    console.log('✅ [USERS] Perfil atualizado com sucesso:', userId);
    return this.mapUserToResponse(updatedUser);
  }

  // ===== BUSCA ESPECÍFICA =====

  /**
   * Buscar personal trainers
   */
  async getPersonalTrainers(searchDto: UserSearchDto): Promise<UserListResponseDto> {
    console.log('👤 [USERS] Buscando personal trainers...');

    return this.getUsers({
      ...searchDto,
      userType: UserType.PERSONAL,
    });
  }

  /**
   * Buscar alunos
   */
  async getStudents(searchDto: UserSearchDto): Promise<UserListResponseDto> {
    console.log('👤 [USERS] Buscando alunos...');

    return this.getUsers({
      ...searchDto,
      userType: UserType.STUDENT,
    });
  }

  /**
   * Buscar usuários por especialidade
   */
  async getUsersBySpecialty(specialty: string, searchDto: UserSearchDto): Promise<UserListResponseDto> {
    console.log('👤 [USERS] Buscando usuários por especialidade:', specialty);

    return this.getUsers({
      ...searchDto,
      specialty,
    });
  }

  // ===== ESTATÍSTICAS =====

  /**
   * Obter estatísticas gerais de usuários
   */
  async getUserStatistics(): Promise<any> {
    console.log('👤 [USERS] Calculando estatísticas de usuários...');

    const [
      totalUsers,
      activeUsers,
      students,
      personalTrainers,
      verifiedUsers,
      recentUsers
    ] = await Promise.all([
      // Total de usuários
      this.db.select({ count: count() }).from(users),
      
      // Usuários ativos
      this.db.select({ count: count() }).from(users).where(eq(users.status, UserStatus.ACTIVE)),
      
      // Alunos
      this.db.select({ count: count() }).from(users).where(eq(users.userType, UserType.STUDENT)),
      
      // Personal trainers
      this.db.select({ count: count() }).from(users).where(eq(users.userType, UserType.PERSONAL)),
      
      // Usuários verificados
      this.db.select({ count: count() }).from(users).where(eq(users.isVerified, true)),
      
      // Usuários dos últimos 30 dias
      this.db.select({ count: count() }).from(users).where(
        sql`${users.createdAt} >= NOW() - INTERVAL '30 days'`
      ),
    ]);

    const stats = {
      total: totalUsers[0].count,
      active: activeUsers[0].count,
      inactive: totalUsers[0].count - activeUsers[0].count,
      students: students[0].count,
      personalTrainers: personalTrainers[0].count,
      verified: verifiedUsers[0].count,
      recent: recentUsers[0].count,
    };

    console.log('✅ [USERS] Estatísticas calculadas:', stats);
    return stats;
  }

  // ===== MÉTODOS AUXILIARES =====

  /**
   * Mapear usuário para DTO de resposta
   */
  private mapUserToResponse(user: any): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate.toISOString(),
      userType: user.userType,
      status: user.status,
      isVerified: user.isVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      profileImageId: user.profileImageId,
      cref: user.cref,
      crefValidated: user.crefValidated,
      specialties: user.specialties,
      isMinor: user.isMinor,
      guardianName: user.guardianName,
      guardianEmail: user.guardianEmail,
    };
  }

  /**
   * Verificar se usuário existe
   */
  async userExists(id: string): Promise<boolean> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return !!user;
  }

  /**
   * Obter usuário por email
   */
  async getUserByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return null;
    }

    return this.mapUserToResponse(user);
  }
}
