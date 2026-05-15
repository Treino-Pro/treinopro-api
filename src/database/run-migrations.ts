import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from './connection';
import { join } from 'path';

export async function runMigrations() {
  if (!db || !client) {
    console.log('⚠️ [DATABASE] Conexão com o banco de dados não disponível. Pulando migrações.');
    return;
  }

  console.log('🔄 [DATABASE] Iniciando migrações...');
  
  try {
    // Tenta encontrar a pasta de migrações
    // Em desenvolvimento: ./drizzle
    // Em produção (dist): ./drizzle (copiado para dist) ou ../../drizzle
    const migrationsPath = join(process.cwd(), 'drizzle');
    
    await migrate(db, { migrationsFolder: migrationsPath });
    
    console.log('✅ [DATABASE] Migrações concluídas com sucesso!');
  } catch (error) {
    console.error('❌ [DATABASE] Erro ao rodar migrações:', error);
    // Não paramos a aplicação, apenas logamos o erro para análise
    // Se o erro for "folder not found", é o que o usuário quer ("se tiver roda se n tiver n roda")
  }
}
