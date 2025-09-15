import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Lista de rotas que não precisam de autenticação
    const publicRoutes = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/refresh',
      '/health',
      '/api/docs',
      '/api/docs-json',
    ];

    // Verificar se a rota é pública
    const isPublicRoute = publicRoutes.some(route => 
      request.url.startsWith(route) || 
      request.url === route ||
      request.url.includes('/api/docs')
    );

    if (isPublicRoute) {
      console.log('🔓 [JWT GUARD] Rota pública - permitindo acesso:', request.url);
      return true;
    }

    console.log('🔐 [JWT GUARD] ===== INÍCIO DA VERIFICAÇÃO =====');
    const token = this.extractTokenFromHeader(request);

    console.log('🔐 [JWT GUARD] URL:', request.url);
    console.log('🔐 [JWT GUARD] Method:', request.method);
    console.log('🔐 [JWT GUARD] Authorization header:', request.headers.authorization);
    console.log('🔐 [JWT GUARD] Token extraído:', token ? `Presente (${token.substring(0, 20)}...)` : 'AUSENTE');

    if (!token) {
      console.log('❌ [JWT GUARD] Token não fornecido - BLOQUEANDO');
      throw new UnauthorizedException('Token não fornecido');
    }

    try {
      const secret = this.configService.get('JWT_SECRET');
      console.log('🔐 [JWT GUARD] JWT_SECRET configurado:', secret ? 'SIM' : 'NÃO');
      console.log('🔐 [JWT GUARD] Tentando verificar token...');
      
      const payload = this.jwtService.verify(token, {
        secret: secret,
      });
      console.log('✅ [JWT GUARD] Token válido! Payload:', JSON.stringify(payload, null, 2));
      request.user = payload;
      console.log('🔐 [JWT GUARD] ===== VERIFICAÇÃO CONCLUÍDA COM SUCESSO =====');
      return true;
    } catch (error) {
      console.log('❌ [JWT GUARD] Erro ao verificar token:', error.message);
      console.log('🔐 [JWT GUARD] ===== VERIFICAÇÃO FALHOU =====');
      throw new UnauthorizedException('Token inválido');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
