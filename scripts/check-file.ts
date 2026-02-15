/**
 * Script para verificar informações de um arquivo no banco de dados
 * Uso: npx ts-node scripts/check-file.ts <file-id>
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/database/schema';
import { files } from '../src/database/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';

async function checkFile(fileId: string) {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/treinopro';
  const sql = postgres(connectionString);
  const db = drizzle(sql, { schema });

  try {
    const fileRecord = await db.query.files.findFirst({
      where: eq(files.id, fileId),
    });

    if (!fileRecord) {
      console.log(`❌ Arquivo ${fileId} não encontrado no banco de dados`);
      return;
    }

    console.log('📄 Informações do arquivo no banco:');
    console.log(JSON.stringify(fileRecord, null, 2));

    // Verificar se o arquivo existe no disco
    const storedPath = fileRecord.path as string;
    const storageBase =
      process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');

    let absolutePath: string;
    if (path.isAbsolute(storedPath)) {
      absolutePath = storedPath;
    } else {
      // Remover ./storage/ ou storage/ do início
      const relativePath = storedPath.replace(/^(\.\/)?storage\/?/, '');
      absolutePath = path.isAbsolute(storageBase)
        ? path.join(storageBase, relativePath)
        : path.join(process.cwd(), storageBase, relativePath);
    }

    console.log('\n🔍 Verificando arquivo no disco:');
    console.log(`- Path no banco: ${storedPath}`);
    console.log(
      `- STORAGE_PATH: ${process.env.STORAGE_PATH || 'não definido'}`,
    );
    console.log(`- process.cwd(): ${process.cwd()}`);
    console.log(`- Caminho absoluto calculado: ${absolutePath}`);

    try {
      await fs.access(absolutePath);
      const stats = await fs.stat(absolutePath);
      console.log(`✅ Arquivo EXISTE no disco`);
      console.log(`- Tamanho: ${stats.size} bytes`);
      console.log(`- Modificado: ${stats.mtime}`);
    } catch {
      console.log(`❌ Arquivo NÃO EXISTE no caminho calculado`);

      // Tentar outros caminhos possíveis
      console.log('\n🔍 Tentando outros caminhos possíveis...');
      const alternatives = [
        storedPath, // Caminho exato do banco
        path.join(process.cwd(), storedPath), // CWD + path do banco
        path.join(
          process.cwd(),
          'storage',
          'images',
          'documents',
          fileRecord.storedName as string,
        ),
        path.join(
          '/var/opt/treinopro/treinopro-api',
          storedPath.replace(/^(\.\/)?storage\/?/, ''),
        ),
        path.join(
          '/var/opt/treinopro/treinopro-api/storage',
          'images',
          'documents',
          fileRecord.storedName as string,
        ),
      ];

      for (const altPath of alternatives) {
        try {
          await fs.access(altPath);
          console.log(`✅ Encontrado em: ${altPath}`);
          break;
        } catch {
          // Não encontrado neste caminho
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await sql.end();
  }
}

const fileId = process.argv[2];
if (!fileId) {
  console.error('Uso: npx ts-node scripts/check-file.ts <file-id>');
  process.exit(1);
}

checkFile(fileId);
