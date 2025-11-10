# 🔐 Guia: NONCE_SECRET_KEY

## 📋 O que é NONCE_SECRET_KEY?

A `NONCE_SECRET_KEY` é uma **chave secreta** que você mesmo gera para assinar os nonces das notificações push. Ela funciona como uma "senha mestre" que garante que apenas o seu servidor pode gerar nonces válidos.

**Analogia:** É como uma chave de assinatura digital - apenas quem tem a chave pode criar assinaturas válidas.

---

## 🎯 Para que serve?

1. **Prevenir falsificação:** Impede que alguém crie nonces falsos
2. **Garantir autenticidade:** Valida que o nonce veio do seu servidor
3. **Segurança:** Protege contra replay attacks em notificações push

---

## 🔧 Como Gerar uma Chave Segura

### **Opção 1: Usando Node.js (Recomendado)**

```bash
# No terminal, dentro da pasta do projeto
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Saída exemplo:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2
```

### **Opção 2: Usando OpenSSL (Linux/Mac)**

```bash
openssl rand -hex 64
```

**Saída exemplo:**
```
3f8a9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2
```

### **Opção 3: Usando Python**

```bash
python3 -c "import secrets; print(secrets.token_hex(64))"
```

### **Opção 4: Online (Apenas para desenvolvimento/teste)**

⚠️ **ATENÇÃO:** Use apenas para desenvolvimento/teste. Para produção, sempre gere localmente.

- https://randomkeygen.com/ (escolha "CodeIgniter Encryption Keys")
- Gere uma chave de 128 caracteres

---

## 📝 Como Adicionar ao Projeto

### **1. Adicionar ao arquivo `.env`**

Abra o arquivo `.env` na raiz do projeto `treinopro-api` e adicione:

```env
# Nonce Secret Key para assinatura de notificações push
# Gere uma chave única e segura (mínimo 64 caracteres)
NONCE_SECRET_KEY=sua-chave-gerada-aqui
```

### **2. Adicionar ao `env.example`**

Adicione também ao arquivo `env.example` (para referência):

```env
# Nonce Secret Key para assinatura de notificações push
NONCE_SECRET_KEY=your-nonce-secret-key-here-change-in-production
```

### **3. Exemplo Completo do `.env`**

```env
# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=treinopro

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
JWT_REFRESH_EXPIRES_IN=7d

# Nonce Secret Key (NOVO)
NONCE_SECRET_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# App Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:8080

# Google Places API Configuration
GOOGLE_PLACES_API_KEY=your-google-places-api-key-here
```

---

## 🔒 Boas Práticas de Segurança

### ✅ **FAÇA:**

1. **Gere uma chave única para cada ambiente:**
   - Desenvolvimento: uma chave
   - Teste: outra chave
   - Produção: chave diferente e mais segura

2. **Use chaves longas:**
   - Mínimo: 64 caracteres (32 bytes em hex)
   - Recomendado: 128 caracteres (64 bytes em hex)

3. **Mantenha em segredo:**
   - Nunca commite no Git
   - Use variáveis de ambiente
   - Armazene em gerenciador de secrets (ex: AWS Secrets Manager, Azure Key Vault)

4. **Rotacione periodicamente:**
   - Em produção, considere rotacionar a chave a cada 6-12 meses
   - Quando rotacionar, os nonces antigos não funcionarão mais (comportamento esperado)

### ❌ **NÃO FAÇA:**

1. ❌ **Não use chaves curtas ou previsíveis:**
   ```env
   # ERRADO ❌
   NONCE_SECRET_KEY=123456
   NONCE_SECRET_KEY=minha-chave-secreta
   ```

2. ❌ **Não compartilhe a chave:**
   - Não envie por email
   - Não coloque em código comentado
   - Não compartilhe em chats públicos

3. ❌ **Não use a mesma chave em todos os ambientes:**
   ```env
   # ERRADO ❌ - mesma chave em dev e prod
   NONCE_SECRET_KEY=chave-compartilhada
   ```

---

## 🧪 Como Testar se Está Funcionando

### **1. Verificar se a chave está sendo lida:**

Adicione um log temporário no `NonceService`:

```typescript
constructor(private configService: ConfigService) {
  this.secretKey =
    this.configService.get<string>('NONCE_SECRET_KEY') ||
    'default-secret-change-in-prod';
  
  // Log temporário para verificar (remover em produção)
  console.log('🔐 NONCE_SECRET_KEY carregada:', this.secretKey ? '✅' : '❌');
  console.log('🔐 Tamanho da chave:', this.secretKey?.length || 0);
}
```

### **2. Testar geração de nonce:**

```typescript
// Em algum lugar do código (temporário)
const nonce = nonceService.generateNonce('proposal-id', 'personal-id');
console.log('Nonce gerado:', nonce);

// Deve ter formato: uuid:timestamp:signature
// Exemplo: 550e8400-e29b-41d4-a716-446655440000:1737123456789:abc123...
```

### **3. Testar validação:**

```typescript
const isValid = nonceService.validateNonce(nonce, 'proposal-id', 'personal-id');
console.log('Nonce válido:', isValid); // Deve ser true
```

---

## 🚀 Script de Geração Automática

Crie um script para facilitar a geração:

**Arquivo:** `treinopro-api/scripts/generate-nonce-key.js`

```javascript
const crypto = require('crypto');

// Gerar chave de 64 bytes (128 caracteres em hex)
const key = crypto.randomBytes(64).toString('hex');

console.log('\n🔐 NONCE_SECRET_KEY gerada:\n');
console.log(key);
console.log('\n📝 Adicione ao seu arquivo .env:\n');
console.log(`NONCE_SECRET_KEY=${key}\n`);
```

**Uso:**
```bash
node scripts/generate-nonce-key.js
```

---

## 📊 Comparação com Outras Chaves Secretas

| Chave | Uso | Tamanho Recomendado | Rotação |
|-------|-----|---------------------|---------|
| `JWT_SECRET` | Assinar tokens JWT | 64+ caracteres | Raramente |
| `NONCE_SECRET_KEY` | Assinar nonces push | 64+ caracteres | 6-12 meses |
| `FIREBASE_PRIVATE_KEY` | Autenticação Firebase | Chave privada completa | Quando expirar |

---

## ⚠️ O que acontece se não configurar?

Se você não adicionar a `NONCE_SECRET_KEY` no `.env`, o sistema usará uma chave padrão:

```typescript
this.secretKey = this.configService.get<string>('NONCE_SECRET_KEY') || 
                 'default-secret-change-in-prod';
```

⚠️ **ATENÇÃO:** A chave padrão é **insegura** e deve ser alterada em produção!

---

## 🎯 Resumo Rápido

1. **Gere a chave:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **Copie a chave gerada**

3. **Adicione ao `.env`:**
   ```env
   NONCE_SECRET_KEY=sua-chave-aqui
   ```

4. **Reinicie o servidor:**
   ```bash
   npm run start:dev
   ```

5. **Pronto!** ✅

---

## 🔗 Referências

- [Node.js crypto.randomBytes()](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)
- [HMAC-SHA256](https://en.wikipedia.org/wiki/HMAC)
- [OWASP - Secret Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

