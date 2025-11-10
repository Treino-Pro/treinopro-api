#!/usr/bin/env node

/**
 * Script para gerar NONCE_SECRET_KEY
 * 
 * Uso:
 *   node scripts/generate-nonce-key.js
 * 
 * Ou torne executável:
 *   chmod +x scripts/generate-nonce-key.js
 *   ./scripts/generate-nonce-key.js
 */

const crypto = require('crypto');

// Gerar chave de 64 bytes (128 caracteres em hex)
const key = crypto.randomBytes(64).toString('hex');

console.log('\n🔐 NONCE_SECRET_KEY gerada:\n');
console.log(key);
console.log('\n📝 Adicione ao seu arquivo .env:\n');
console.log(`NONCE_SECRET_KEY=${key}\n`);
console.log('⚠️  IMPORTANTE: Mantenha esta chave em segredo!\n');
console.log('   - Não commite no Git');
console.log('   - Use diferentes chaves para dev/test/prod');
console.log('   - Armazene em gerenciador de secrets em produção\n');

