import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Create connection - SEMPRE usar DATABASE_URL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL não está definida nas variáveis de ambiente');
}

console.log(
  '🔗 [DATABASE] Connection string:',
  connectionString.replace(/:([^@]+)@/, ':***@'),
);

// Verificar se deve usar mock database
const useMockDatabase =
  connectionString.startsWith('mock://') || process.env.NODE_ENV === 'test';

let client = null;

if (useMockDatabase) {
  console.log('🔌 [DATABASE] Usando mock database para testes');
} else {
  // Use require for postgres to avoid import issues
  const postgres = require('postgres');

  // Create connection with better error handling
  // ✅ OTIMIZAÇÃO: Connection pool aumentado para suportar alta concorrência
  // Para 500k usuários simultâneos, precisamos de um pool maior
  // Fórmula recomendada: (cores * 2) + effective_spindle_count
  // Para produção com alta carga: 20-100 conexões
  const maxConnections = parseInt(process.env.DATABASE_MAX_CONNECTIONS || '50', 10);
  
  try {
    client = postgres(connectionString, {
      max: maxConnections, // ✅ Aumentado de 1 para suportar alta concorrência
      idle_timeout: 20,
      connect_timeout: 10, // ✅ Reduzido para 10s (timeout menor = falha rápida)
      command_timeout: 5, // ✅ Reduzido para 5s (queries devem ser rápidas)
      onnotice: () => {}, // Silenciar notices
      timezone: 'America/Sao_Paulo', // Forçar timezone
      onconnect: async (connection: any) => {
        // Definir timezone na conexão
        await connection.query("SET timezone = 'America/Sao_Paulo'");
      },
    });
  } catch (error) {
    console.error(
      '❌ [DATABASE] Erro ao conectar com o banco de dados:',
      error.message,
    );

    // Fallback para conexão local sem autenticação
    try {
      const maxConnections = parseInt(process.env.DATABASE_MAX_CONNECTIONS || '50', 10);
      client = postgres('postgresql://localhost:5432/treinopro', {
        max: maxConnections, // ✅ Aumentado de 1 para suportar alta concorrência
        idle_timeout: 20,
        connect_timeout: 10, // ✅ Reduzido para 10s
        command_timeout: 5, // ✅ Reduzido para 5s
        onnotice: () => {},
        timezone: 'America/Sao_Paulo', // Forçar timezone
        onconnect: async (connection) => {
          // Definir timezone na conexão
          await connection.query("SET timezone = 'America/Sao_Paulo'");
        },
      });
    } catch (fallbackError) {
      console.error(
        '❌ [DATABASE] Erro na conexão de fallback:',
        fallbackError.message,
      );
      console.log('🔄 [DATABASE] Usando banco mock para desenvolvimento...');
      // Criar cliente mock para desenvolvimento
      client = null;
    }
  }
}

export const db = client ? drizzle(client, { schema }) : null;
