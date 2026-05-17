import { defineConfig } from 'drizzle-kit';
import * as fs from 'fs';

// drizzle-kit pode rodar tanto do host quanto de dentro do Docker.
// Se estiver rodando no host, substitui o hostname pelo localhost.
// Se estiver rodando dentro do container Docker (detectado via /.dockerenv), mantém o hostname original (ex: treinopro-postgres).
const rawUrl = process.env.DATABASE_URL!;
const isInsideContainer = fs.existsSync('/.dockerenv');
const connectionString = isInsideContainer
  ? rawUrl
  : rawUrl?.replace(/(@)[^:@/]+(:)/, '$1localhost$2');

export default defineConfig({
  schema: './src/database/schema/*',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString,
  },
});
