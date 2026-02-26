import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '../../database/schema';

/**
 * Guard de Fase 2: bloqueia rotas de personal trainer quando o cadastro
 * não está aprovado (approval_status != 'approved').
 *
 * Usuários que não são personal trainers passam sem verificação.
 * Retorna 403 com código semântico PERSONAL_PENDING_APPROVAL.
 */
@Injectable()
export class PersonalApprovalGuard implements CanActivate {
  constructor(@Inject('DATABASE_CONNECTION') private db: any) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Não é personal trainer — skip (estudantes e admins passam livre)
    if (!user || user.userType !== 'personal') {
      return true;
    }

    // Verificar status de aprovação diretamente no banco (não confia só no JWT)
    const dbUser = await this.db.query.users.findFirst({
      where: eq(users.id, user.sub),
      columns: { approvalStatus: true },
    });

    if (!dbUser || dbUser.approvalStatus !== 'approved') {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: 'PERSONAL_PENDING_APPROVAL',
        message:
          'Seu cadastro está em análise. Aguarde a aprovação para acessar esta funcionalidade.',
      });
    }

    return true;
  }
}
