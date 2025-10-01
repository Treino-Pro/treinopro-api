import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '../../database/schema';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, CreateAdminDto } from './dto/auth.dto';
import { CrefService } from '../cref/cref.service';
import { EmailVerificationService } from './services/email-verification.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('DATABASE_CONNECTION') private db: any,
    private crefService: CrefService,
    private emailVerificationService: EmailVerificationService,
    private gamificationService: GamificationService,
  ) {}

  async register(registerDto: RegisterDto) {
    console.log('🚀 [AUTH] Iniciando processo de registro...');
    console.log('📝 [AUTH] Dados recebidos:', JSON.stringify(registerDto, null, 2));
    
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
        privacyPolicyAccepted
      } = registerDto;

      console.log('🔍 [AUTH] Verificando se usuário já existe...');
      console.log('🔍 [AUTH] Email a verificar:', email);
      console.log('🔍 [AUTH] Tipo de usuário:', userType);

      // Verificar se o usuário já existe
      const existingUser = await this.db.query.users.findFirst({
        where: eq(users.email, email),
      });

      console.log('🔍 [AUTH] Resultado da busca:', existingUser ? 'Usuário encontrado' : 'Usuário não encontrado');

      if (existingUser) {
        console.log('❌ [AUTH] Email já está em uso:', email);
        throw new ConflictException('Email já está em uso');
      }

      console.log('✅ [AUTH] Email disponível, prosseguindo com validações...');

      // Validar CREF para Personal Trainers
      if (userType === 'personal' && !cref) {
        console.log('❌ [AUTH] CREF obrigatório para Personal Trainers');
        throw new BadRequestException('CREF é obrigatório para Personal Trainers');
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
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
        age--;
      }
      
      const isActuallyMinor = age < 18;

      // Se isMinor não foi fornecido, usar o valor calculado
      const finalIsMinor = isMinor !== undefined ? isMinor : isActuallyMinor;

      // Validar apenas se isMinor foi explicitamente fornecido e não confere
      // Permitir uma margem de tolerância para casos limítrofes
      if (isMinor !== undefined && isActuallyMinor !== isMinor) {
        console.log(`🔍 [AUTH] Validação de idade: calculado=${isActuallyMinor} (${age} anos), informado=${isMinor}`);
        // Só validar se a diferença for significativa (mais de 1 ano)
        if (Math.abs(age - (isMinor ? 17 : 18)) > 1) {
          throw new BadRequestException('A idade informada não confere com a data de nascimento');
        }
      }

      if (finalIsMinor) {
        if (!guardianName || !guardianEmail) {
          throw new BadRequestException('Nome e email do responsável são obrigatórios para menores de idade');
        }
        if (!guardianConsent) {
          throw new BadRequestException('Consentimento do responsável é obrigatório para menores de idade');
        }
      }

      // Validar termos e políticas
      if (!termsAccepted || !privacyPolicyAccepted) {
        throw new BadRequestException('Aceite dos Termos de Uso e Política de Privacidade é obrigatório');
      }

      // Validar CREF para Personal Trainers
      let crefValidation = null;
      let crefParsed = null;
      
      if (userType === 'personal') {
        if (!cref) {
          throw new BadRequestException('CREF é obrigatório para Personal Trainers');
        }
        if (!crefImageId) {
          throw new BadRequestException('Imagem da carteirinha do CREF é obrigatória para Personal Trainers');
        }
        
        console.log('🔍 [AUTH] Validando CREF:', cref);
        
        // Validar CREF via API do CONFEF
        try {
          crefValidation = await this.crefService.validateCref(cref);
          crefParsed = this.crefService.parseCrefNumber(cref);
          console.log('✅ [AUTH] CREF validado com sucesso:', crefValidation);
        } catch (error) {
          console.error('❌ [AUTH] Erro na validação do CREF:', error.message);
          throw new BadRequestException(`Erro na validação do CREF: ${error.message}`);
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

      const [newUser] = await this.db.insert(users).values({
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
        crefNumber: userType === 'personal' && crefParsed ? crefParsed.numero : null,
        crefImageId,
        crefValidated: userType === 'personal' && crefValidation ? true : false,
        crefValidatedAt: userType === 'personal' && crefValidation ? new Date() : null,
        crefValidatedName: userType === 'personal' && crefValidation ? crefValidation.nome : null,
        crefValidatedSituation: userType === 'personal' && crefValidation ? crefValidation.categoria : null,
        specialties,
        isMinor: finalIsMinor,
        guardianName: finalIsMinor ? guardianName : null,
        guardianEmail: finalIsMinor ? guardianEmail : null,
        guardianConsent: finalIsMinor ? guardianConsent : false,
        guardianConsentDate: finalIsMinor && guardianConsent ? new Date() : null,
        termsAccepted,
        privacyPolicyAccepted,
        termsAcceptedDate: new Date(),
      }).returning();

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
        console.error('⚠️ [AUTH] Erro ao criar perfil de gamificação (não crítico):', error.message);
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
        crefParsed
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
      console.log('📤 [AUTH] Resposta final:', JSON.stringify(response, null, 2));

      return response;
    } catch (error) {
      console.error('💥 [AUTH] Erro durante o registro:', error);
      console.error('💥 [AUTH] Stack trace:', error.stack);
      throw error;
    }
  }


  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Buscar usuário
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Nota: Verificação de email é apenas no cadastro, não no login

    // Gerar tokens
    const tokens = await this.generateTokens(
      user.id, 
      user.email, 
      user.userType,
      user.firstName,
      user.lastName,
      user.document,
      user.cref
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      // Por segurança, não revelar se o email existe ou não
      return { message: 'Se o email existir, você receberá instruções para redefinir sua senha' };
    }

    // TODO: Implementar envio de email com token de reset
    // Por enquanto, apenas retornar sucesso
    return { message: 'Se o email existir, você receberá instruções para redefinir sua senha' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { password, token } = resetPasswordDto;

    // TODO: Validar token de reset
    // Por enquanto, apenas retornar erro
    throw new BadRequestException('Funcionalidade de reset de senha ainda não implementada');
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
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    // Hash da nova senha
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Atualizar senha
    await this.db.update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { message: 'Senha alterada com sucesso' };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.db.query.users.findFirst({
        where: eq(users.id, payload.sub),
      });

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado');
      }

      const tokens = await this.generateTokens(
        user.id, 
        user.email, 
        user.userType,
        user.firstName,
        user.lastName,
        user.document,
        user.cref
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          isVerified: user.isVerified,
        },
        ...tokens,
      };
    } catch (error) {
      throw new UnauthorizedException('Token de refresh inválido');
    }
  }

  private async generateTokens(userId: string, email: string, userType: string, firstName?: string, lastName?: string, document?: string, cref?: string) {
    const payload = { 
      sub: userId, 
      email, 
      userType,
      firstName: firstName || '',
      lastName: lastName || '',
      document: document || '',
      cref: cref || ''
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

  async sendVerificationCode(email: string): Promise<{ message: string; expiresAt: Date }> {
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
      throw new BadRequestException('Este email já está em uso. Use outro email ou faça login.');
    }

    // Enviar código de verificação (usar email como firstName temporariamente)
    return this.emailVerificationService.sendVerificationCode(email, email.split('@')[0]);
  }

  async verifyCode(email: string, code: string): Promise<{ message: string; verified: boolean }> {
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
    const [newAdmin] = await this.db.insert(users).values(adminData).returning();

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
      }
    };
  }
}
