import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Admin Migration')
@Controller('admin-migration')
export class AdminMigrationController {
  constructor(@Inject('DATABASE_CONNECTION') private db: any) {}

  @Post('add-admin-user-type')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adicionar suporte a user_type admin',
    description:
      'Endpoint para adicionar o valor "admin" ao enum user_type no PostgreSQL',
  })
  @ApiResponse({
    status: 200,
    description: 'Migração executada com sucesso',
  })
  @ApiResponse({
    status: 500,
    description: 'Erro durante a migração',
  })
  async addAdminUserType() {
    try {
      // Verificar se 'admin' já existe no enum
      const checkResult = await this.db.execute(`
        SELECT unnest(enum_range(NULL::user_type)) as user_types 
        ORDER BY user_types
      `);

      const currentValues = checkResult.rows.map((row) => row.user_types);

      if (currentValues.includes('admin')) {
        return {
          success: true,
          message: 'Valor "admin" já existe no enum user_type',
          currentValues,
        };
      }

      // Adicionar 'admin' ao enum
      await this.db.execute(`ALTER TYPE user_type ADD VALUE 'admin'`);

      // Verificar novamente
      const finalResult = await this.db.execute(`
        SELECT unnest(enum_range(NULL::user_type)) as user_types 
        ORDER BY user_types
      `);

      const finalValues = finalResult.rows.map((row) => row.user_types);

      if (finalValues.includes('admin')) {
        return {
          success: true,
          message:
            'Migração concluída com sucesso! Valor "admin" adicionado ao enum user_type',
          currentValues: finalValues,
        };
      } else {
        return {
          success: false,
          message: 'Erro: Valor "admin" não foi adicionado ao enum',
          currentValues: finalValues,
        };
      }
    } catch (error) {
      console.error('❌ [MIGRATION] Erro durante a migração:', error.message);

      if (
        error.message.includes('already exists') ||
        error.message.includes('duplicate')
      ) {
        return {
          success: true,
          message: 'Valor "admin" já existe no enum user_type',
          currentValues: [],
        };
      } else {
        console.error('💥 [MIGRATION] Falha na migração:', error);
        return {
          success: false,
          message: `Erro durante a migração: ${error.message}`,
          currentValues: [],
        };
      }
    }
  }
}
