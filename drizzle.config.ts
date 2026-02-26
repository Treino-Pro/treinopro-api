import { defineConfig } from 'drizzle-kit';

// drizzle-kit roda do host, não dentro do Docker.
// Se DATABASE_URL aponta para um hostname de container (ex: treinopro-postgres),
// substitui por localhost para que o CLI consiga conectar pela porta mapeada.
const rawUrl = process.env.DATABASE_URL!;
const connectionString = rawUrl?.replace(/(@)[^:@/]+(:)/, '$1localhost$2');

export default defineConfig({
  schema: './src/database/schema/*',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString,
  },
});
