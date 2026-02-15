import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { eq } from 'drizzle-orm';
import { users } from '../../database/schema';
import { files } from '../../database/schema/files';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  CreateAdminDto,
} from './dto/auth.dto';
import { CrefService } from '../cref/cref.service';
import { EmailVerificationService } from './services/email-verification.service';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  private readonly USER_CACHE_TTL = 300; // 5 minutos em segundos
  private readonly USER_CACHE_PREFIX = 'user:';
  private readonly USER_EMAIL_CACHE_PREFIX = 'user:email:';

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('DATABASE_CONNECTION') private db: any,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private crefService: CrefService,
    private emailVerificationService: EmailVerificationService,
    private gamificationService: GamificationService,
    private notificationsService: NotificationsService,
  ) {}

  async register(registerDto: RegisterDto) {
    console.log('🚀 [AUTH] Iniciando processo de registro...');
    console.log(
      '📝 [AUTH] Dados recebidos:',
      JSON.stringify({
        email: registerDto.email,
        userType: registerDto.userType,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        documentType: registerDto.documentType,
        isMinor: registerDto.isMinor,
      }),
    );

    try {
      const {
        email,
        password,
        firstName,
        lastName,
        birthDate,
        userType,
        documentType,
        documentNumber,
        documentImageId,
        cref,
        crefImageId,
        specialties,
        isMinor,
        guardianName,
        guardianEmail,
        guardianConsent,
        termsAccepted,
        privacyPolicyAccepted,
      } = registerDto;

      console.log('🔍 [AUTH] Verificando se usuário já existe...');
      console.log('🔍 [AUTH] Email a verificar:', email);
      console.log('🔍 [AUTH] Tipo de usuário:', userType);

      // Verificar se o usuário já existe
      const existingUser = await this.db.query.users.findFirst({
        where: eq(users.email, email),
      });

      console.log(
        '🔍 [AUTH] Resultado da busca:',
        existingUser ? 'Usuário encontrado' : 'Usuário não encontrado',
      );

      if (existingUser) {
        console.log('❌ [AUTH] Email já está em uso:', email);
        throw new ConflictException('Email já está em uso');
      }

      console.log('✅ [AUTH] Email disponível, prosseguindo com validações...');

      // ✅ CORREÇÃO: Invalidar cache do email antes de criar novo usuário
      // Isso previne problemas se usuário deletou conta e está recriando com mesmo email
      try {
        await this.invalidateUserCache(undefined, email);
        console.log('✅ [AUTH] Cache invalidado para email antes de criar novo usuário');
      } catch (error) {
        console.warn('⚠️ [AUTH] Erro ao invalidar cache:', error);
        // Continuar mesmo se invalidação de cache falhar
      }

      // Validar CREF para Personal Trainers
      if (userType === 'personal' && !cref) {
        console.log('❌ [AUTH] CREF obrigatório para Personal Trainers');
        throw new BadRequestException(
          'CREF é obrigatório para Personal Trainers',
        );
      }

      // CREF deve ser null para estudantes
      if (userType === 'student' && cref) {
        console.log('❌ [AUTH] CREF não permitido para estudantes');
        throw new BadRequestException('CREF não é permitido para estudantes');
      }

      console.log('✅ [AUTH] Validações de CREF passaram');

      // Validar idade e campos para menores
      const birthDateObj = new Date(birthDate);
      const today = new Date();

      // Calcular idade de forma mais precisa
      let age = today.getFullYear() - birthDateObj.getFullYear();
      const monthDiff = today.getMonth() - birthDateObj.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDateObj.getDate())
      ) {
        age--;
      }

      const isActuallyMinor = age < 18;

      // Se isMinor não foi fornecido, usar o valor calculado
      const finalIsMinor = isMinor !== undefined ? isMinor : isActuallyMinor;

      // Validar apenas se isMinor foi explicitamente fornecido e não confere
      // Permitir uma margem de tolerância para casos limítrofes
      if (isMinor !== undefined && isActuallyMinor !== isMinor) {
        console.log(
          `🔍 [AUTH] Validação de idade: calculado=${isActuallyMinor} (${age} anos), informado=${isMinor}`,
        );
        // Só validar se a diferença for significativa (mais de 1 ano)
        if (Math.abs(age - (isMinor ? 17 : 18)) > 1) {
          throw new BadRequestException(
            'A idade informada não confere com a data de nascimento',
          );
        }
      }

      if (finalIsMinor) {
        if (!guardianName || !guardianEmail) {
          throw new BadRequestException(
            'Nome e email do responsável são obrigatórios para menores de idade',
          );
        }
        if (!guardianConsent) {
          throw new BadRequestException(
            'Consentimento do responsável é obrigatório para menores de idade',
          );
        }
      }

      // Validar termos e políticas
      if (!termsAccepted || !privacyPolicyAccepted) {
        throw new BadRequestException(
          'Aceite dos Termos de Uso e Política de Privacidade é obrigatório',
        );
      }

      // Validar CREF para Personal Trainers
      let crefValidation = null;
      let crefParsed = null;

      if (userType === 'personal') {
        if (!cref) {
          throw new BadRequestException(
            'CREF é obrigatório para Personal Trainers',
          );
        }
        if (!crefImageId) {
          throw new BadRequestException(
            'Imagem da carteirinha do CREF é obrigatória para Personal Trainers',
          );
        }

        console.log('🔍 [AUTH] Validando CREF:', cref);

        // Validar CREF via API do CONFEF
        try {
          crefValidation = await this.crefService.validateCref(cref);
          crefParsed = this.crefService.parseCrefNumber(cref);
          console.log('✅ [AUTH] CREF validado com sucesso:', crefValidation);
        } catch (error) {
          console.error('❌ [AUTH] Erro na validação do CREF:', error.message);
          throw new BadRequestException(
            `Erro na validação do CREF: ${error.message}`,
          );
        }
      }

      console.log('✅ [AUTH] Todas as validações passaram');

      // Hash da senha
      console.log('🔐 [AUTH] Gerando hash da senha...');
      const passwordHash = await bcrypt.hash(password, 12);
      console.log('✅ [AUTH] Hash da senha gerado com sucesso');

      // Criar usuário
      console.log('👤 [AUTH] Criando usuário no banco de dados...');
      console.log('👤 [AUTH] Dados para inserção:', {
        email,
        firstName,
        lastName,
        birthDate: birthDate ? new Date(birthDate) : null,
        userType,
        cref,
        specialties,
      });

      const [newUser] = await this.db
        .insert(users)
        .values({
          email,
          passwordHash,
          firstName,
          lastName,
          birthDate: new Date(birthDate),
          userType,
          documentType,
          documentNumber,
          documentImageId,
          cref,
          crefUf: userType === 'personal' && crefParsed ? crefParsed.uf : null,
          crefNumber:
            userType === 'personal' && crefParsed ? crefParsed.numero : null,
          crefImageId,
          crefValidated:
            userType === 'personal' && crefValidation ? true : false,
          crefValidatedAt:
            userType === 'personal' && crefValidation ? new Date() : null,
          crefValidatedName:
            userType === 'personal' && crefValidation
              ? crefValidation.nome
              : null,
          crefValidatedSituation:
            userType === 'personal' && crefValidation
              ? crefValidation.categoria
              : null,
          specialties,
          isMinor: finalIsMinor,
          guardianName: finalIsMinor ? guardianName : null,
          guardianEmail: finalIsMinor ? guardianEmail : null,
          guardianConsent: finalIsMinor ? guardianConsent : false,
          guardianConsentDate:
            finalIsMinor && guardianConsent ? new Date() : null,
          termsAccepted,
          privacyPolicyAccepted,
          termsAcceptedDate: new Date(),
        })
        .returning();

      console.log('✅ [AUTH] Usuário criado com sucesso:', {
        id: newUser.id,
        email: newUser.email,
        userType: newUser.userType,
      });

      // Criar perfil de gamificação automaticamente
      try {
        console.log('🎮 [AUTH] Criando perfil de gamificação...');
        await this.gamificationService.getUserProfile(newUser.id);
        console.log('✅ [AUTH] Perfil de gamificação criado com sucesso');
      } catch (error) {
        console.error(
          '⚠️ [AUTH] Erro ao criar perfil de gamificação (não crítico):',
          error.message,
        );
        // Não falha o registro se houver erro na gamificação
      }

      // Gerar tokens
      console.log('🎫 [AUTH] Gerando tokens JWT...');
      const tokens = await this.generateTokens(
        newUser.id,
        newUser.email,
        newUser.userType,
        firstName,
        lastName,
        documentNumber,
        crefParsed,
      );
      console.log('✅ [AUTH] Tokens gerados com sucesso');

      const response = {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          userType: newUser.userType,
          isVerified: newUser.isVerified,
        },
        ...tokens,
      };

      console.log('🎉 [AUTH] Registro concluído com sucesso!');
      console.log(
        '📤 [AUTH] Resposta final:',
        JSON.stringify(response, null, 2),
      );

      return response;
    } catch (error) {
      console.error('💥 [AUTH] Erro durante o registro:', error);
      console.error('💥 [AUTH] Stack trace:', error.stack);
      throw error;
    }
  }

  /**
   * Busca usuário do cache ou do banco de dados
   */
  private async getUserByEmail(email: string): Promise<any> {
    const cacheKey = `${this.USER_EMAIL_CACHE_PREFIX}${email.toLowerCase()}`;
    
    // Tentar buscar do cache primeiro
    try {
      const cachedUser = await this.cacheManager.get<any>(cacheKey);
      if (cachedUser) {
        console.log('✅ [AUTH][Service] Usuário encontrado no cache');
        // ✅ CORREÇÃO: Validar que usuário ainda existe no banco antes de retornar do cache
        // Isso previne problemas se usuário foi deletado após ser cacheado
        const userStillExists = await this.db.query.users.findFirst({
          where: eq(users.id, cachedUser.id),
          columns: { id: true },
        });
        
        if (!userStillExists) {
          console.warn('⚠️ [AUTH][Service] Usuário no cache não existe mais no banco, invalidando cache');
          await this.invalidateUserCache(cachedUser.id, email);
          // Continuar para buscar do banco (retornará null)
        } else {
          return cachedUser;
        }
      }
    } catch (error) {
      console.warn('⚠️ [AUTH][Service] Erro ao buscar do cache:', error);
      // Continuar para buscar do banco
    }

    // Buscar do banco de dados
    // ✅ OTIMIZAÇÃO: Buscar apenas campos necessários para login
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
      columns: {
        id: true,
        email: true,
        passwordHash: true,
        userType: true,
        firstName: true,
        lastName: true,
        document: true,
        cref: true,
        isVerified: true,
        profileImageId: true,
      },
    });

    // Salvar no cache se encontrado
    if (user) {
      try {
        await this.cacheManager.set(cacheKey, user, this.USER_CACHE_TTL);
        // Também cachear por ID
        await this.cacheManager.set(
          `${this.USER_CACHE_PREFIX}${user.id}`,
          user,
          this.USER_CACHE_TTL,
        );
      } catch (error) {
        console.warn('⚠️ [AUTH][Service] Erro ao salvar no cache:', error);
        // Não falhar se cache falhar
      }
    }

    return user;
  }

  /**
   * Invalida cache de um usuário (por ID ou email)
   */
  private async invalidateUserCache(userId?: string, email?: string): Promise<void> {
    try {
      if (userId) {
        await this.cacheManager.del(`${this.USER_CACHE_PREFIX}${userId}`);
      }
      if (email) {
        await this.cacheManager.del(`${this.USER_EMAIL_CACHE_PREFIX}${email.toLowerCase()}`);
      }
      console.log('✅ [AUTH][Service] Cache invalidado para usuário');
    } catch (error) {
      console.warn('⚠️ [AUTH][Service] Erro ao invalidar cache:', error);
      // Não falhar se invalidação de cache falhar
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    console.log('🔐 [AUTH][Service] Iniciando login para:', email);

    try {
      const startTime = Date.now();
      
      // ✅ OTIMIZAÇÃO: Buscar usuário com cache
      const user = await this.getUserByEmail(email);

      const queryTime = Date.now() - startTime;
      console.log(`🔐 [AUTH][Service] Usuário buscado em ${queryTime}ms`);

      if (!user) {
        console.log('❌ [AUTH][Service] Usuário não encontrado');
        throw new UnauthorizedException('Credenciais inválidas');
      }

      console.log('🔐 [AUTH][Service] Verificando senha...');
      // Verificar senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        console.log('❌ [AUTH][Service] Senha inválida');
        throw new UnauthorizedException('Credenciais inválidas');
      }

      console.log('🔐 [AUTH][Service] Gerando tokens...');
      // Gerar tokens
      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.userType,
        user.firstName,
        user.lastName,
        user.document,
        user.cref,
      );

      console.log('✅ [AUTH][Service] Tokens gerados com sucesso');

      // ✅ Buscar profileImage separadamente se necessário (após query principal)
      let profileImageUrl: string | undefined;
      if (user.profileImageId) {
        try {
          const profileImage = await this.db.query.files.findFirst({
            where: eq(files.id, user.profileImageId),
            columns: { url: true },
          });
          profileImageUrl = profileImage?.url;
        } catch (e) {
          console.warn('⚠️ [AUTH][Service] Erro ao buscar profileImage:', e);
          // Não falhar login se não conseguir buscar imagem
        }
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          isVerified: user.isVerified,
          profileImageUrl: profileImageUrl,
        },
        ...tokens,
      };
    } catch (error) {
      console.error('❌ [AUTH][Service] Erro no login:', error);
      
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new BadRequestException(
        'Erro ao processar login. Tente novamente em alguns instantes.',
      );
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    console.log(
      `🔐 [AUTH] Iniciando processo de recuperação de senha para: ${email}`,
    );

    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      console.log(`❌ [AUTH] Usuário não encontrado para email: ${email}`);
      // Por segurança, não revelar se o email existe ou não
      return {
        message:
          'Se o email existir, você receberá instruções para redefinir sua senha',
      };
    }

    console.log(
      `✅ [AUTH] Usuário encontrado: ${user.firstName} ${user.lastName}`,
    );

    try {
      // Usar o método específico para recuperação de senha
      const result = await this.emailVerificationService.sendPasswordResetCode(
        email,
        user.firstName,
      );

      console.log(`📧 [AUTH] Código de recuperação enviado para ${email}`);
      console.log(`⏰ [AUTH] Expira em: ${result.expiresAt}`);

      return {
        message: 'Código de recuperação enviado para seu email',
        expiresAt: result.expiresAt,
      };
    } catch (error) {
      console.error(
        `❌ [AUTH] Erro ao enviar código de recuperação para ${email}:`,
        error,
      );
      // Por segurança, não revelar o erro específico
      return {
        message:
          'Se o email existir, você receberá instruções para redefinir sua senha',
      };
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { password, token } = resetPasswordDto;

    console.log(`🔐 [AUTH] Iniciando reset de senha com token: ${token}`);

    // TODO: Implementar validação de token de reset
    // Por enquanto, apenas retornar erro
    throw new BadRequestException(
      'Funcionalidade de reset de senha ainda não implementada',
    );
  }

  async resetPasswordWithCode(
    email: string,
    code: string,
    newPassword: string,
  ) {
    console.log(`🔐 [AUTH] Iniciando reset de senha para: ${email}`);

    try {
      // Verificar se o código já foi verificado anteriormente
      const isVerified =
        await this.emailVerificationService.isCodeVerified(email);

      if (!isVerified) {
        console.log(`❌ [AUTH] Código não foi verificado para ${email}`);
        throw new BadRequestException(
          'Código não foi verificado. Complete a verificação primeiro',
        );
      }

      console.log(`✅ [AUTH] Código já verificado para ${email}`);

      // Buscar usuário
      const user = await this.db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (!user) {
        console.log(`❌ [AUTH] Usuário não encontrado para email: ${email}`);
        throw new BadRequestException('Usuário não encontrado');
      }

      // Hash da nova senha
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Atualizar senha no banco
      await this.db
        .update(users)
        .set({ passwordHash: hashedPassword, updatedAt: new Date() })
        .where(eq(users.email, email));

      // ✅ OTIMIZAÇÃO: Invalidar cache após reset de senha
      await this.invalidateUserCache(user.id, email);

      console.log(`✅ [AUTH] Senha atualizada com sucesso para ${email}`);

      return { message: 'Senha alterada com sucesso' };
    } catch (error) {
      console.error(`❌ [AUTH] Erro ao resetar senha para ${email}:`, error);
      throw error;
    }
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    // Buscar usuário
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    // Verificar senha atual
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    // Hash da nova senha
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Atualizar senha
    await this.db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // ✅ OTIMIZAÇÃO: Invalidar cache após mudança de senha
    await this.invalidateUserCache(userId, user.email);

    return { message: 'Senha alterada com sucesso' };
  }

  async refreshToken(refreshToken: string) {
    try {
      // ✅ OTIMIZAÇÃO: Verificar token primeiro (mais rápido que query no banco)
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // ✅ OTIMIZAÇÃO: Tentar buscar do cache primeiro
      const cacheKey = `${this.USER_CACHE_PREFIX}${payload.sub}`;
      let user: any;

      try {
        user = await this.cacheManager.get<any>(cacheKey);
        if (!user) {
          // Se não estiver no cache, buscar do banco
          user = await this.db.query.users.findFirst({
            where: eq(users.id, payload.sub),
            columns: {
              id: true,
              email: true,
              userType: true,
              firstName: true,
              lastName: true,
              document: true,
              cref: true,
              isVerified: true,
            },
          });

          // Salvar no cache se encontrado
          if (user) {
            await this.cacheManager.set(cacheKey, user, this.USER_CACHE_TTL);
          }
        }
      } catch (error) {
        console.warn('⚠️ [AUTH][Service] Erro ao buscar usuário (cache/banco):', error);
        // Se cache/banco falhar, usar dados do token (já validado)
        user = {
          id: payload.sub,
          email: payload.email,
          userType: payload.userType,
          firstName: payload.firstName || '',
          lastName: payload.lastName || '',
          document: payload.document || '',
          cref: payload.cref || '',
          isVerified: true, // Assumir verificado se token é válido
        };
      }

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado');
      }

      // Gerar novos tokens
      const tokens = await this.generateTokens(
        user.id,
        user.email || payload.email,
        user.userType || payload.userType,
        user.firstName || payload.firstName,
        user.lastName || payload.lastName,
        user.document || payload.document,
        user.cref || payload.cref,
      );

      return {
        user: {
          id: user.id,
          email: user.email || payload.email,
          firstName: user.firstName || payload.firstName || '',
          lastName: user.lastName || payload.lastName || '',
          userType: user.userType || payload.userType,
          isVerified: user.isVerified !== undefined ? user.isVerified : true,
        },
        ...tokens,
      };
    } catch (error) {
      console.error('❌ [AUTH][Service] Erro ao renovar token:', error);
      throw new UnauthorizedException('Token de refresh inválido');
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    userType: string,
    firstName?: string,
    lastName?: string,
    document?: string,
    cref?: string,
  ) {
    const payload = {
      sub: userId,
      email,
      userType,
      firstName: firstName || '',
      lastName: lastName || '',
      document: document || '',
      cref: cref || '',
    };

    // Usar explicitamente o secret do .env para access token
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN') || '24h',
    });

    // Para refresh token, usar configurações específicas
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async sendVerificationCode(
    email: string,
  ): Promise<{ message: string; expiresAt: Date }> {
    console.log('📧 [AUTH] Enviando código de verificação para:', email);

    // Validar formato do email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Formato de email inválido');
    }

    // Verificar se o email já está em uso
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      throw new BadRequestException(
        'Este email já está em uso. Use outro email ou faça login.',
      );
    }

    // Enviar código de verificação (usar email como firstName temporariamente)
    return this.emailVerificationService.sendVerificationCode(
      email,
      email.split('@')[0],
    );
  }

  async verifyCode(
    email: string,
    code: string,
  ): Promise<{ message: string; verified: boolean }> {
    console.log('🔍 [AUTH] Verificando código para:', email, 'Código:', code);
    return this.emailVerificationService.verifyCode(email, code);
  }

  async isEmailVerified(email: string): Promise<boolean> {
    return this.emailVerificationService.isEmailVerified(email);
  }

  // ===== MÉTODOS PARA ADMIN =====

  /**
   * Criar usuário admin (método interno/sistema)
   */
  async createAdmin(createAdminDto: CreateAdminDto) {
    console.log('👑 [AUTH] Criando usuário admin...');
    console.log('👑 [AUTH] Email:', createAdminDto.email);

    // Verificar se email já existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, createAdminDto.email),
    });

    if (existingUser) {
      console.log('❌ [AUTH] Email já existe:', createAdminDto.email);
      throw new ConflictException('Email já está em uso');
    }

    // Hash da senha
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(createAdminDto.password, saltRounds);

    // Preparar dados para inserção (campos mínimos para admin)
    const adminData = {
      email: createAdminDto.email,
      passwordHash,
      firstName: createAdminDto.firstName,
      lastName: createAdminDto.lastName,
      birthDate: new Date(createAdminDto.birthDate),
      userType: 'admin' as const,
      // Campos obrigatórios com valores padrão para admin
      documentType: 'RG' as const,
      documentNumber: 'ADMIN-' + Date.now(), // Número único para admin
      termsAccepted: true,
      privacyPolicyAccepted: true,
      termsAcceptedDate: new Date(),
      isVerified: true, // Admin é verificado automaticamente
    };

    // Inserir admin
    const [newAdmin] = await this.db
      .insert(users)
      .values(adminData)
      .returning();

    console.log('✅ [AUTH] Admin criado com sucesso:', newAdmin.id);

    return {
      message: 'Usuário admin criado com sucesso',
      user: {
        id: newAdmin.id,
        email: newAdmin.email,
        firstName: newAdmin.firstName,
        lastName: newAdmin.lastName,
        userType: newAdmin.userType,
        isVerified: newAdmin.isVerified,
      },
    };
  }

  async sendGuardianAuthorizationEmail(
    guardianName: string,
    guardianEmail: string,
    studentName: string,
  ) {
    console.log('📧 [AUTH] Enviando email de autorização para responsável...');
    console.log(`📧 [AUTH] Responsável: ${guardianName} (${guardianEmail})`);
    console.log(`📧 [AUTH] Aluno: ${studentName}`);

    try {
      // Gerar OTP de 6 dígitos
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Armazenar OTP temporariamente (em produção, usar Redis ou banco de dados)
      // Por enquanto, vamos usar um Map em memória
      if (!this.guardianOtpStorage) {
        this.guardianOtpStorage = new Map();
      }

      this.guardianOtpStorage.set(guardianEmail, {
        code: otpCode,
        createdAt: new Date(),
        studentName: studentName,
        guardianName: guardianName,
      });

      // Enviar email usando o serviço de notificações
      await this.notificationsService.sendEmailToAddress(
        guardianEmail,
        'guardian-authorization',
        {
          guardianName: guardianName,
          studentName: studentName,
          otpCode: otpCode,
        },
      );

      console.log(
        `✅ [AUTH] Email de autorização enviado para ${guardianEmail}`,
      );

      return {
        message: 'Email de autorização enviado com sucesso',
        otpCode: otpCode, // Apenas para desenvolvimento/teste
      };
    } catch (error) {
      console.error('❌ [AUTH] Erro ao enviar email de autorização:', error);
      throw new BadRequestException('Erro ao enviar email de autorização');
    }
  }

  async verifyGuardianOtp(guardianEmail: string, otpCode: string) {
    console.log('🔐 [AUTH] Verificando OTP do responsável...');
    console.log(`🔐 [AUTH] Email: ${guardianEmail}`);
    console.log(`🔐 [AUTH] Código: ${otpCode}`);

    try {
      if (!this.guardianOtpStorage) {
        throw new BadRequestException('Código não encontrado ou expirado');
      }

      const storedData = this.guardianOtpStorage.get(guardianEmail);

      if (!storedData) {
        throw new BadRequestException('Código não encontrado ou expirado');
      }

      // Verificar se o código expirou (24 horas)
      const now = new Date();
      const timeDiff = now.getTime() - storedData.createdAt.getTime();
      const hoursDiff = timeDiff / (1000 * 3600);

      if (hoursDiff > 24) {
        this.guardianOtpStorage.delete(guardianEmail);
        throw new BadRequestException(
          'Código expirado. Solicite um novo código.',
        );
      }

      if (storedData.code !== otpCode) {
        throw new BadRequestException('Código inválido');
      }

      // Remover o código após verificação bem-sucedida
      this.guardianOtpStorage.delete(guardianEmail);

      console.log(`✅ [AUTH] OTP do responsável verificado com sucesso`);

      return {
        message: 'Autorização confirmada com sucesso',
        verified: true,
      };
    } catch (error) {
      console.error('❌ [AUTH] Erro ao verificar OTP do responsável:', error);
      throw error;
    }
  }

  // Map temporário para armazenar OTPs (em produção, usar Redis)
  private guardianOtpStorage: Map<
    string,
    {
      code: string;
      createdAt: Date;
      studentName: string;
      guardianName: string;
    }
  > | null = null;
}
