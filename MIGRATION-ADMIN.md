# 🔧 Migração: Adicionar Suporte a Usuários Admin

## 🚨 Problema
O enum `user_type` no PostgreSQL não inclui o valor `'admin'`, causando erro ao tentar criar usuários admin.

## ✅ Solução
Execute a migração para adicionar `'admin'` ao enum `user_type`.

## 🚀 Como Executar

### **Opção 1: Via API (Mais Fácil)**
```bash
# Com a API rodando, execute:
curl -X POST http://localhost:3000/admin-migration/add-admin-user-type

# Ou usando yarn:
yarn migrate:admin:api
```

### **Opção 2: Script Simples**
```bash
# No diretório da API
yarn migrate:admin:simple
```

### **Opção 3: Script Drizzle**
```bash
# No diretório da API
yarn migrate:admin
```

### **Opção 4: SQL Manual**
```sql
-- Conecte ao PostgreSQL e execute:
ALTER TYPE user_type ADD VALUE 'admin';

-- Verificar se foi adicionado:
SELECT unnest(enum_range(NULL::user_type)) as user_types ORDER BY user_types;
```

## 🔍 Verificação
Após executar a migração, você deve ver:
```
📋 Valores finais do enum user_type: ['admin', 'personal', 'student']
🎉 Migração concluída com sucesso!
```

## 🧪 Teste
Após a migração, teste criando um admin:
```bash
curl -X POST http://localhost:3000/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@treinopro.com",
    "password": "admin123",
    "firstName": "Admin",
    "lastName": "Sistema",
    "birthDate": "1990-01-01"
  }'
```

## 📝 Comandos Yarn Disponíveis
```bash
# Iniciar API
yarn start:dev

# Executar migração via API
yarn migrate:admin:api

# Executar migração via script simples
yarn migrate:admin:simple

# Executar migração via script Drizzle
yarn migrate:admin
```

## 📝 Notas
- A migração é **idempotente** (pode ser executada múltiplas vezes)
- Se o valor `'admin'` já existir, o script não fará nada
- A migração não afeta dados existentes
