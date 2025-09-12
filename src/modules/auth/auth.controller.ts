import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário registrado com sucesso' })
  @ApiResponse({ status: 409, description: 'Email já está em uso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async register(@Body() registerDto: RegisterDto) {
    console.log('📨 [CONTROLLER] Requisição de registro recebida');
    console.log('📨 [CONTROLLER] Headers:', JSON.stringify(registerDto, null, 2));
    
    try {
      const result = await this.authService.register(registerDto);
      console.log('✅ [CONTROLLER] Registro processado com sucesso');
      return result;
    } catch (error) {
      console.error('❌ [CONTROLLER] Erro no controller:', error);
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fazer login' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar reset de senha' })
  @ApiResponse({ status: 200, description: 'Email de reset enviado' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redefinir senha' })
  @ApiResponse({ status: 200, description: 'Senha redefinida com sucesso' })
  @ApiResponse({ status: 400, description: 'Token inválido' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alterar senha' })
  @ApiResponse({ status: 200, description: 'Senha alterada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async changePassword(@Request() req: any, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, changePasswordDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar token de acesso' })
  @ApiResponse({ status: 200, description: 'Token renovado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token de refresh inválido' })
  async refreshToken(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }
}
