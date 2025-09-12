import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '../../database/schema';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from './dto/auth.dto';
import { CrefService } from '../cref/cref.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('DATABASE_CONNECTION') private db: any,
    private crefService: CrefService,
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
        phone, 
        birthDate, 
        userType, 
        documentType,
        documentNumber,
        documentImageUrl,
        cref, 
        crefImageUrl,
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
      const age = today.getFullYear() - birthDateObj.getFullYear();
      const isActuallyMinor = age < 18;

      if (isActuallyMinor !== isMinor) {
        throw new BadRequestException('A idade informada não confere com a data de nascimento');
      }

      if (isMinor) {
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
        if (!crefImageUrl) {
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
        phone,
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
        phone,
        birthDate: new Date(birthDate),
        userType,
        documentType,
        documentNumber,
        documentImageUrl,
        cref,
        crefUf: userType === 'personal' && crefParsed ? crefParsed.uf : null,
        crefNumber: userType === 'personal' && crefParsed ? crefParsed.numero : null,
        crefImageUrl,
        crefValidated: userType === 'personal' && crefValidation ? true : false,
        crefValidatedAt: userType === 'personal' && crefValidation ? new Date() : null,
        crefValidatedName: userType === 'personal' && crefValidation ? crefValidation.nome : null,
        crefValidatedSituation: userType === 'personal' && crefValidation ? crefValidation.categoria : null,
        specialties,
        isMinor,
        guardianName: isMinor ? guardianName : null,
        guardianEmail: isMinor ? guardianEmail : null,
        guardianConsent: isMinor ? guardianConsent : false,
        guardianConsentDate: isMinor && guardianConsent ? new Date() : null,
        termsAccepted,
        privacyPolicyAccepted,
        termsAcceptedDate: new Date(),
      }).returning();

      console.log('✅ [AUTH] Usuário criado com sucesso:', {
        id: newUser.id,
        email: newUser.email,
        userType: newUser.userType,
      });

      // Gerar tokens
      console.log('🎫 [AUTH] Gerando tokens JWT...');
      const tokens = await this.generateTokens(newUser.id, newUser.email, newUser.userType);
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

    // Gerar tokens
    const tokens = await this.generateTokens(user.id, user.email, user.userType);

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

      const tokens = await this.generateTokens(user.id, user.email, user.userType);

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

  private async generateTokens(userId: string, email: string, userType: string) {
    const payload = { sub: userId, email, userType };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRES_IN'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
