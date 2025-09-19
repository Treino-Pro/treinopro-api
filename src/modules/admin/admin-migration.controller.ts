import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Admin Migration')
@Controller('admin-migration')
export class AdminMigrationController {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
  ) {}

  @Post('add-admin-user-type')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Adicionar suporte a user_type admin',
    description: 'Endpoint para adicionar o valor "admin" ao enum user_type no PostgreSQL'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Migração executada com sucesso' 
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Erro durante a migração' 
  })
  async addAdminUserType() {
    console.log('🔧 [MIGRATION] Iniciando migração para adicionar user_type admin...');

    try {
      // Verificar se 'admin' já existe no enum
      console.log('🔍 [MIGRATION] Verificando valores atuais do enum user_type...');
      const checkResult = await this.db.execute(`
        SELECT unnest(enum_range(NULL::user_type)) as user_types 
        ORDER BY user_types
      `);
      
      const currentValues = checkResult.rows.map(row => row.user_types);
      console.log('📋 [MIGRATION] Valores atuais do enum user_type:', currentValues);

      if (currentValues.includes('admin')) {
        console.log('✅ [MIGRATION] Valor "admin" já existe no enum user_type');
        return {
          success: true,
          message: 'Valor "admin" já existe no enum user_type',
          currentValues
        };
      }

      // Adicionar 'admin' ao enum
      console.log('➕ [MIGRATION] Adicionando "admin" ao enum user_type...');
      await this.db.execute(`ALTER TYPE user_type ADD VALUE 'admin'`);
      console.log('✅ [MIGRATION] Valor "admin" adicionado com sucesso ao enum user_type');

      // Verificar novamente
      console.log('🔍 [MIGRATION] Verificando valores após migração...');
      const finalResult = await this.db.execute(`
        SELECT unnest(enum_range(NULL::user_type)) as user_types 
        ORDER BY user_types
      `);
      
      const finalValues = finalResult.rows.map(row => row.user_types);
      console.log('📋 [MIGRATION] Valores finais do enum user_type:', finalValues);

      if (finalValues.includes('admin')) {
        console.log('🎉 [MIGRATION] Migração concluída com sucesso!');
        return {
          success: true,
          message: 'Migração concluída com sucesso! Valor "admin" adicionado ao enum user_type',
          currentValues: finalValues
        };
      } else {
        console.log('❌ [MIGRATION] Erro: Valor "admin" não foi adicionado ao enum');
        return {
          success: false,
          message: 'Erro: Valor "admin" não foi adicionado ao enum',
          currentValues: finalValues
        };
      }

    } catch (error) {
      console.error('❌ [MIGRATION] Erro durante a migração:', error.message);
      
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log('ℹ️ [MIGRATION] O valor "admin" já existe no enum user_type');
        return {
          success: true,
          message: 'Valor "admin" já existe no enum user_type',
          currentValues: []
        };
      } else {
        console.error('💥 [MIGRATION] Falha na migração:', error);
        return {
          success: false,
          message: `Erro durante a migração: ${error.message}`,
          currentValues: []
        };
      }
    }
  }
}
