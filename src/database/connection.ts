import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Create connection
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASSWORD || 'postgres'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'treinopro'}`;

// Verificar se deve usar mock database
const useMockDatabase = connectionString.startsWith('mock://') || process.env.NODE_ENV === 'test';

let client = null;

if (useMockDatabase) {
  console.log('🔌 [DATABASE] Usando mock database para testes');
} else {
  // Use require for postgres to avoid import issues
  const postgres = require('postgres');

  // Create connection with better error handling
  try {
    client = postgres(connectionString, { 
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {}, // Silenciar notices
      timezone: 'America/Sao_Paulo', // Forçar timezone
      onconnect: async (connection) => {
        // Definir timezone na conexão
        await connection.query("SET timezone = 'America/Sao_Paulo'");
      },
    });
  } catch (error) {
    console.error('❌ [DATABASE] Erro ao conectar com o banco de dados:', error.message);
    
    // Fallback para conexão local sem autenticação
    try {
      client = postgres('postgresql://localhost:5432/treinopro', {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        onnotice: () => {},
        timezone: 'America/Sao_Paulo', // Forçar timezone
        onconnect: async (connection) => {
          // Definir timezone na conexão
          await connection.query("SET timezone = 'America/Sao_Paulo'");
        },
      });
    } catch (fallbackError) {
      console.error('❌ [DATABASE] Erro na conexão de fallback:', fallbackError.message);
      console.log('🔄 [DATABASE] Usando banco mock para desenvolvimento...');
      // Criar cliente mock para desenvolvimento
      client = null;
    }
  }
}

export const db = client ? drizzle(client, { schema }) : null;

