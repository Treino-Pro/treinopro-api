import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { eq, and, or, like, desc, asc, count, sql } from 'drizzle-orm';
import { users, files } from '../../database/schema';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UpdateServiceLocationDto,
  UserSearchDto,
  UpdateUserStatusDto,
  UserResponseDto,
  UserListResponseDto,
  UserType,
  UserStatus,
} from './dto/users.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly USER_CACHE_PREFIX = 'user:';
  private readonly USER_EMAIL_CACHE_PREFIX = 'user:email:';

  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
    const {
      search,
      userType,
      status,
      specialty,
      page = 1,
      limit = 10,
    } = searchDto;
    const offset = (page - 1) * limit;

    // Construir condições de busca
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.cref, `%${search}%`),
        ),
      );
    }

    if (userType) {
      conditions.push(eq(users.userType, userType));
    }

    if (status) {
      conditions.push(eq(users.status, status));
    }

    if (specialty) {
      conditions.push(
        sql`${users.specialties} @> ${JSON.stringify([specialty])}`,
      );
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
      users: usersList.map((user) => this.mapUserToResponse(user)),
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

    // Enriquecer com URL da imagem de perfil, se existir
    if (user.profileImageId) {
      try {
        const file = await this.db.query.files.findFirst({
          where: eq(files.id, user.profileImageId),
        });
        if (file?.url) {
          const baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';
          // Reescrever a base da URL para garantir que use o BASE_URL atual
          try {
            const original = new URL(file.url);
            const normalizedBase = new URL(baseUrl);
            const normalizedUrl = `${normalizedBase.origin}${original.pathname}`;
            (user as any).profileImageUrl = normalizedUrl;
          } catch (_) {
            // Se parsing falhar, usar fallback simples
            (user as any).profileImageUrl = file.url.replace(
              'https://api.treinopro.com',
              baseUrl,
            );
          }
        }
      } catch (e) {
        console.error('⚠️ Falha ao buscar URL da imagem de perfil:', e);
      }
    }

    const response = this.mapUserToResponse(user);
    try {
      console.log('👤 [USERS] getUserById - Response DTO:', {
        id: response.id,
        email: response.email,
        firstName: response.firstName,
        lastName: response.lastName,
        documentType: response.documentType,
        documentNumber: response.documentNumber,
        profileImageId: response.profileImageId,
        profileImageUrl: (response as any).profileImageUrl,
        userType: response.userType,
        status: response.status,
      });
    } catch (_) {}

    return response;
  }

  /**
   * Atualizar usuário
   */
  async updateUser(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
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
    Object.keys(updateData).forEach((key) => {
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
  async updateUserStatus(
    id: string,
    updateStatusDto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    console.log(
      '👤 [USERS] Atualizando status do usuário:',
      id,
      'para:',
      updateStatusDto.status,
    );

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
        updatedAt: new Date(),
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
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    console.log('✅ [USERS] Usuário desativado com sucesso:', id);
  }

  /**
   * Deletar conta permanentemente (hard delete)
   * Apenas permitido se não houver aulas agendadas
   */
  async deleteAccount(userId: string): Promise<void> {
    console.log('🗑️ [USERS] Iniciando exclusão permanente da conta:', userId);

    // 1. Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.log('❌ [USERS] Usuário não encontrado:', userId);
      throw new NotFoundException('Usuário não encontrado');
    }

    // 2. Verificar se há aulas agendadas (como aluno ou personal)
    const { classes } = await import('../../database/schema');

    const scheduledClasses = await this.db.query.classes.findMany({
      where: and(
        or(eq(classes.studentId, userId), eq(classes.personalId, userId)),
        or(
          eq(classes.status, 'scheduled'),
          eq(classes.status, 'pending_confirmation'),
          eq(classes.status, 'active'),
        ),
      ),
    });

    if (scheduledClasses && scheduledClasses.length > 0) {
      console.log(
        '❌ [USERS] Usuário tem aulas agendadas:',
        scheduledClasses.length,
      );
      throw new BadRequestException(
        'Não é possível excluir a conta. Você possui aulas agendadas. ' +
          'Cancele ou complete todas as aulas antes de excluir sua conta.',
      );
    }

    // 3. ✅ CORREÇÃO: Invalidar cache ANTES de deletar usuário
    // Isso previne problemas se usuário criar nova conta com mesmo email
    try {
      await this.cacheManager.del(`${this.USER_CACHE_PREFIX}${userId}`);
      if (existingUser.email) {
        await this.cacheManager.del(
          `${this.USER_EMAIL_CACHE_PREFIX}${existingUser.email.toLowerCase()}`,
        );
      }
      console.log('✅ [USERS] Cache invalidado para usuário deletado');
    } catch (error) {
      console.warn('⚠️ [USERS] Erro ao invalidar cache:', error);
      // Continuar mesmo se invalidação de cache falhar
    }

    // 4. Deletar usuário permanentemente
    // O histórico de aulas, propostas, avaliações, etc. será mantido
    // pois as foreign keys permitem NULL ou não têm CASCADE DELETE
    await this.db.delete(users).where(eq(users.id, userId));

    console.log('✅ [USERS] Conta excluída permanentemente:', userId);
    console.log('ℹ️ [USERS] Histórico de aulas e propostas foi mantido');
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

    // Debug de documentos
    try {
      console.log('👤 [USERS] getProfile - userId:', userId);
      console.log('👤 [USERS] documentType:', user.documentType);
      console.log('👤 [USERS] documentNumber:', user.documentNumber);
      console.log('👤 [USERS] completo:', user);
    } catch (_) {}

    // Enriquecer com URL da imagem de perfil, se existir
    if (user.profileImageId) {
      try {
        const file = await this.db.query.files.findFirst({
          where: eq(files.id, user.profileImageId),
        });
        if (file?.url) {
          const baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';
          // Reescrever a base da URL para garantir que use o BASE_URL atual
          try {
            const original = new URL(file.url);
            const normalizedBase = new URL(baseUrl);
            const normalizedUrl = `${normalizedBase.origin}${original.pathname}`;
            (user as any).profileImageUrl = normalizedUrl;
          } catch (_) {
            // Se parsing falhar, usar fallback simples
            (user as any).profileImageUrl = file.url.replace(
              'https://api.treinopro.com',
              baseUrl,
            );
          }
        }
      } catch (e) {
        console.error('⚠️ Falha ao buscar URL da imagem de perfil:', e);
      }
    }

    return this.mapUserToResponse(user);
  }

  /**
   * Atualizar perfil do usuário logado
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
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
    Object.keys(updateData).forEach((key) => {
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

  /**
   * Atualizar localização de atendimento do personal trainer
   */
  async updateServiceLocation(
    userId: string,
    updateServiceLocationDto: UpdateServiceLocationDto,
  ): Promise<UserResponseDto> {
    console.log('📍 [USERS] Atualizando localização de atendimento:', userId);
    console.log('📍 [USERS] Dados recebidos:', updateServiceLocationDto);

    // Verificar se usuário existe e é personal
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.log('❌ [USERS] Usuário não encontrado:', userId);
      throw new NotFoundException('Usuário não encontrado');
    }

    if (existingUser.userType !== 'personal') {
      console.log('❌ [USERS] Usuário não é personal trainer:', userId);
      throw new ForbiddenException(
        'Apenas personal trainers podem atualizar localização de atendimento',
      );
    }

    // Preparar dados para atualização
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updateServiceLocationDto.serviceLocationLat !== undefined) {
      updateData.serviceLocationLat = updateServiceLocationDto.serviceLocationLat.toString();
    }
    if (updateServiceLocationDto.serviceLocationLng !== undefined) {
      updateData.serviceLocationLng = updateServiceLocationDto.serviceLocationLng.toString();
    }
    if (updateServiceLocationDto.serviceRadiusKm !== undefined) {
      updateData.serviceRadiusKm = updateServiceLocationDto.serviceRadiusKm.toString();
    }

    // Atualizar localização
    const [updatedUser] = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    console.log('✅ [USERS] Localização de atendimento atualizada:', {
      userId,
      lat: updateData.serviceLocationLat,
      lng: updateData.serviceLocationLng,
      radius: updateData.serviceRadiusKm,
    });

    return this.mapUserToResponse(updatedUser);
  }

  // ===== BUSCA ESPECÍFICA =====

  /**
   * Buscar personal trainers
   */
  async getPersonalTrainers(
    searchDto: UserSearchDto,
  ): Promise<UserListResponseDto> {
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
  async getUsersBySpecialty(
    specialty: string,
    searchDto: UserSearchDto,
  ): Promise<UserListResponseDto> {
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
      recentUsers,
    ] = await Promise.all([
      // Total de usuários
      this.db.select({ count: count() }).from(users),

      // Usuários ativos
      this.db
        .select({ count: count() })
        .from(users)
        .where(eq(users.status, UserStatus.ACTIVE)),

      // Alunos
      this.db
        .select({ count: count() })
        .from(users)
        .where(eq(users.userType, UserType.STUDENT)),

      // Personal trainers
      this.db
        .select({ count: count() })
        .from(users)
        .where(eq(users.userType, UserType.PERSONAL)),

      // Usuários verificados
      this.db
        .select({ count: count() })
        .from(users)
        .where(eq(users.isVerified, true)),

      // Usuários dos últimos 30 dias
      this.db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.createdAt} >= NOW() - INTERVAL '30 days'`),
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
    // Se houver profileImageId, tentar buscar URL pública do arquivo
    const profileImageUrl =
      user.profileImageUrl || user.profileImage?.url || user.imageUrl || null;
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
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      // Campo adicional amigável ao app:
      ...(profileImageUrl ? { profileImageUrl } : {}),
      cref: user.cref,
      crefValidated: user.crefValidated,
      specialties: user.specialties,
      isMinor: user.isMinor,
      guardianName: user.guardianName,
      guardianEmail: user.guardianEmail,
      // Rating do usuário (todos começam com 5.0)
      rating: user.rating ? parseFloat(user.rating) : 5.0,
      totalRatings: user.totalRatings || 0,
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

  /**
   * Salvar token FCM do usuário
   */
  async saveFcmToken(
    userId: string,
    fcmToken: string,
  ): Promise<{ success: boolean; message: string }> {
    console.log('🔥 [USERS] Salvando token FCM para usuário:', userId);

    // Verificar se usuário existe
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      console.log('❌ [USERS] Usuário não encontrado:', userId);
      throw new NotFoundException('Usuário não encontrado');
    }

    // Atualizar token FCM
    await this.db
      .update(users)
      .set({
        fcmToken: fcmToken,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    console.log('✅ [USERS] Token FCM salvo com sucesso para usuário:', userId);
    return {
      success: true,
      message: 'Token FCM salvo com sucesso',
    };
  }
}
