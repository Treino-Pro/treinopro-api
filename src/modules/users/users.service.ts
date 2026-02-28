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
import { eq, and, or, like, desc, count, sql } from 'drizzle-orm';
import { users, files, userPushTokens } from '../../database/schema';
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
          } catch (e) {
            console.error('⚠️ Falha ao normalizar URL da imagem de perfil:', e);
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

    return response;
  }

  /**
   * Atualizar usuário
   */
  async updateUser(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!existingUser) {
      console.error('❌ [USERS] Usuário não encontrado:', id);
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

    return this.mapUserToResponse(updatedUser);
  }

  /**
   * Atualizar status do usuário
   */
  async updateUserStatus(
    id: string,
    updateStatusDto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!existingUser) {
      console.error('❌ [USERS] Usuário não encontrado:', id);
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
    return this.mapUserToResponse(updatedUser);
  }

  /**
   * Deletar usuário (soft delete - apenas desativar)
   */
  async deleteUser(id: string): Promise<void> {
    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!existingUser) {
      console.error('❌ [USERS] Usuário não encontrado:', id);
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
  }

  /**
   * Deletar conta permanentemente (hard delete)
   * Apenas permitido se não houver aulas agendadas
   */
  async deleteAccount(userId: string): Promise<void> {
    // 1. Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.error('❌ [USERS] Usuário não encontrado:', userId);
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
          eq(classes.status, 'no_show_dispute'),
          eq(classes.status, 'custody'),
        ),
      ),
    });

    if (scheduledClasses && scheduledClasses.length > 0) {
      console.error(
        '❌ [USERS] Usuário tem aulas pendentes ou em disputa:',
        scheduledClasses.length,
      );
      throw new BadRequestException(
        'Não é possível excluir a conta. Você possui aulas pendentes ou em disputa de no-show. ' +
          'Resolva todas as pendências antes de excluir sua conta.',
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
    } catch (error) {
      console.warn('⚠️ [USERS] Erro ao invalidar cache:', error);
      // Continuar mesmo se invalidação de cache falhar
    }

    // 4. Deletar usuário permanentemente
    // O histórico de aulas, propostas, avaliações, etc. será mantido
    // pois as foreign keys permitem NULL ou não têm CASCADE DELETE
    await this.db.delete(users).where(eq(users.id, userId));
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
          } catch (e) {
            console.error('⚠️ Falha ao normalizar URL da imagem de perfil:', e);
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
    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.error('❌ [USERS] Usuário não encontrado:', userId);
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

    return this.mapUserToResponse(updatedUser);
  }

  /**
   * Atualizar localização de atendimento do personal trainer
   */
  async updateServiceLocation(
    userId: string,
    updateServiceLocationDto: UpdateServiceLocationDto,
  ): Promise<UserResponseDto> {
    // Verificar se usuário existe e é personal
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.error('❌ [USERS] Usuário não encontrado:', userId);
      throw new NotFoundException('Usuário não encontrado');
    }

    if (existingUser.userType !== 'personal') {
      console.error('❌ [USERS] Usuário não é personal trainer:', userId);
      throw new ForbiddenException(
        'Apenas personal trainers podem atualizar localização de atendimento',
      );
    }

    // Preparar dados para atualização
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updateServiceLocationDto.serviceLocationLat !== undefined) {
      updateData.serviceLocationLat =
        updateServiceLocationDto.serviceLocationLat.toString();
    }
    if (updateServiceLocationDto.serviceLocationLng !== undefined) {
      updateData.serviceLocationLng =
        updateServiceLocationDto.serviceLocationLng.toString();
    }
    if (updateServiceLocationDto.serviceRadiusKm !== undefined) {
      updateData.serviceRadiusKm =
        updateServiceLocationDto.serviceRadiusKm.toString();
    }

    // Atualizar localização
    const [updatedUser] = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return this.mapUserToResponse(updatedUser);
  }

  // ===== BUSCA ESPECÍFICA =====

  /**
   * Buscar personal trainers
   */
  async getPersonalTrainers(
    searchDto: UserSearchDto,
  ): Promise<UserListResponseDto> {
    return this.getUsers({
      ...searchDto,
      userType: UserType.PERSONAL,
    });
  }

  /**
   * Buscar alunos
   */
  async getStudents(searchDto: UserSearchDto): Promise<UserListResponseDto> {
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
   * Salvar token FCM do usuário (multi-device)
   * Registra token na tabela user_push_tokens e mantém retrocompatibilidade com users.fcmToken
   */
  async saveFcmToken(
    userId: string,
    fcmToken: string,
    platform?: string,
    deviceInfo?: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verificar se usuário existe
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      console.error('❌ [USERS] Usuário não encontrado:', userId);
      throw new NotFoundException('Usuário não encontrado');
    }

    // ✅ Retrocompatibilidade: ainda salvar na coluna legacy
    await this.db
      .update(users)
      .set({
        fcmToken: fcmToken,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // ✅ NOVO: Upsert na tabela user_push_tokens
    // Se o token já existe, atualizar userId e lastUsedAt (token pode migrar de usuário em logout/login)
    try {
      const detectedPlatform = platform || 'unknown';

      await this.db
        .insert(userPushTokens)
        .values({
          userId,
          token: fcmToken,
          platform: detectedPlatform,
          deviceInfo: deviceInfo || null,
          lastUsedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userPushTokens.token,
          set: {
            userId,
            platform: detectedPlatform,
            deviceInfo: deviceInfo || null,
            lastUsedAt: new Date(),
          },
        });
    } catch (error) {
      // Não bloquear se a tabela nova ainda não existir (migration pendente)
      // e tentar fallback manual quando faltar índice/constraint para ON CONFLICT.
      const errorMessage = error?.message || String(error);
      console.warn(
        '⚠️ [USERS] Erro ao salvar token na tabela user_push_tokens:',
        errorMessage,
      );

      try {
        const detectedPlatform = platform || 'unknown';
        const existingToken = await this.db.query.userPushTokens.findFirst({
          where: eq(userPushTokens.token, fcmToken),
          columns: { id: true },
        });

        if (existingToken?.id) {
          await this.db
            .update(userPushTokens)
            .set({
              userId,
              platform: detectedPlatform,
              deviceInfo: deviceInfo || null,
              lastUsedAt: new Date(),
            })
            .where(eq(userPushTokens.token, fcmToken));
        } else {
          await this.db.insert(userPushTokens).values({
            userId,
            token: fcmToken,
            platform: detectedPlatform,
            deviceInfo: deviceInfo || null,
            lastUsedAt: new Date(),
          });
        }
      } catch (fallbackError) {
        const fallbackMessage = fallbackError?.message || String(fallbackError);
        console.warn(
          '⚠️ [USERS] Fallback manual para user_push_tokens também falhou:',
          fallbackMessage,
        );
      }
    }

    return {
      success: true,
      message: 'Token FCM salvo com sucesso',
    };
  }
}
