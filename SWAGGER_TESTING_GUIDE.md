# 🚀 Guia de Teste da API TreinoPRO - Swagger

## 📋 Pré-requisitos

1. **API rodando**: `http://localhost:3000`
2. **Swagger UI**: `http://localhost:3000/api/docs`
3. **Token JWT** para endpoints protegidos

## 🔐 Autenticação

### 1. Criar Usuário Admin (Primeira vez)
```bash
curl -X POST http://localhost:3000/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@treinopro.com",
    "password": "admin123",
    "firstName": "Admin",
    "lastName": "Sistema",
    "birthDate": "1990-01-01",
    "documentType": "RG",
    "documentNumber": "123456789"
  }'
```

### 2. Fazer Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@treinopro.com",
    "password": "admin123"
  }'
```

**Resposta esperada:**
```json
{
  "user": {
    "id": "uuid-do-usuario",
    "email": "admin@treinopro.com",
    "firstName": "Admin",
    "lastName": "Sistema",
    "userType": "admin",
    "isVerified": true
  },
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token"
}
```

### 3. Usar Token no Swagger
1. Copie o `accessToken` da resposta do login
2. No Swagger UI, clique em "Authorize" (🔒)
3. Cole o token no formato: `Bearer SEU_TOKEN_AQUI`
4. Clique em "Authorize"

## 🎯 Módulo Admin

### Dashboard
- **GET** `/admin/dashboard`
- **Descrição**: Resumo geral da plataforma
- **Autenticação**: Admin apenas
- **Resposta**: Estatísticas de usuários, receitas, atividades recentes

### Usuários
- **GET** `/admin/users`
- **Descrição**: Lista todos os usuários
- **Autenticação**: Admin apenas
- **Resposta**: Lista com informações básicas dos usuários

- **PUT** `/admin/users/{id}`
- **Descrição**: Atualizar usuário
- **Body**:
```json
{
  "status": "active",
  "isVerified": true,
  "adminNotes": "Usuário verificado manualmente"
}
```

### Financeiro
- **GET** `/admin/financial`
- **Descrição**: Resumo financeiro
- **Autenticação**: Admin apenas
- **Resposta**: Receitas, comissões, transações recentes

### Missões (Gamificação)
- **GET** `/admin/missions`
- **Descrição**: Lista missões de gamificação
- **Autenticação**: Admin apenas
- **Resposta**: Lista de missões disponíveis

- **PUT** `/admin/missions/{id}`
- **Descrição**: Atualizar missão
- **Body**:
```json
{
  "title": "Primeira Aula",
  "description": "Complete sua primeira aula",
  "xpReward": 100,
  "isActive": true
}
```

### Analytics
- **GET** `/admin/analytics`
- **Descrição**: Métricas da plataforma
- **Autenticação**: Admin apenas
- **Resposta**: Estatísticas de usuários, propostas, aulas, pagamentos

## 🎮 Módulo Gamificação

### Perfil do Usuário
- **GET** `/gamification/profile`
- **Descrição**: Perfil de gamificação do usuário logado
- **Autenticação**: Qualquer usuário autenticado
- **Resposta**: Nível, XP, badges, conquistas, ranking

### Adicionar XP
- **POST** `/gamification/xp`
- **Body**:
```json
{
  "amount": 100,
  "source": "class_completed",
  "description": "Completou uma aula"
}
```

### Histórico de XP
- **GET** `/gamification/xp/history`
- **Query params**: `page`, `limit`, `source`
- **Exemplo**: `/gamification/xp/history?page=1&limit=10&source=class_completed`

### Missões
- **GET** `/gamification/missions`
- **Query params**: `status`, `type`, `page`, `limit`
- **Exemplo**: `/gamification/missions?status=available&type=daily`

- **POST** `/gamification/missions`
- **Body**:
```json
{
  "title": "Primeira Aula",
  "description": "Complete sua primeira aula",
  "type": "one_time",
  "xpReward": 100,
  "requirements": {
    "minClasses": 1
  }
}
```

- **GET** `/gamification/missions/{id}`
- **Descrição**: Detalhes de uma missão específica

- **POST** `/gamification/missions/{id}/start`
- **Descrição**: Iniciar uma missão

- **POST** `/gamification/missions/{id}/complete`
- **Descrição**: Completar uma missão

### Conquistas
- **GET** `/gamification/achievements`
- **Query params**: `category`, `page`, `limit`

- **POST** `/gamification/achievements`
- **Body**:
```json
{
  "title": "Primeiro Mês",
  "description": "Use a plataforma por um mês",
  "category": "time_based",
  "xpReward": 500,
  "requirements": {
    "daysActive": 30
  }
}
```

### Ranking
- **GET** `/gamification/ranking`
- **Query params**: `type`, `period`, `page`, `limit`
- **Exemplo**: `/gamification/ranking?type=global&period=monthly&page=1&limit=20`

### Estatísticas
- **GET** `/gamification/stats`
- **Descrição**: Estatísticas de gamificação do usuário
- **Resposta**: Resumo de progresso, conquistas, missões

## 🧪 Exemplos de Teste

### 1. Fluxo Completo de Admin
1. Fazer login como admin
2. Obter dashboard para ver estatísticas
3. Listar usuários
4. Verificar resumo financeiro
5. Gerenciar missões

### 2. Fluxo de Gamificação
1. Fazer login como usuário normal
2. Ver perfil de gamificação
3. Adicionar XP
4. Ver histórico de XP
5. Listar missões disponíveis
6. Iniciar uma missão
7. Completar uma missão
8. Ver ranking

### 3. Teste de Erros
- Tentar acessar endpoints admin sem token
- Tentar acessar endpoints admin com token de usuário normal
- Enviar dados inválidos nos DTOs
- Testar paginação com valores inválidos

## 📝 Notas Importantes

1. **Tokens JWT** expiram em 24 horas
2. **Refresh tokens** expiram em 7 dias
3. Use o endpoint `/auth/refresh` para renovar tokens
4. Todos os endpoints de admin requerem role "admin"
5. Endpoints de gamificação são acessíveis para todos os usuários autenticados
6. Use paginação para listas grandes (padrão: page=1, limit=20)

## 🔧 Troubleshooting

### Erro 401 (Unauthorized)
- Verifique se o token está correto
- Verifique se o token não expirou
- Use o formato: `Bearer SEU_TOKEN`

### Erro 403 (Forbidden)
- Verifique se o usuário tem role "admin"
- Faça login com usuário admin

### Erro 400 (Bad Request)
- Verifique se todos os campos obrigatórios estão preenchidos
- Verifique se os tipos de dados estão corretos
- Consulte a documentação dos DTOs

### Erro 404 (Not Found)
- Verifique se o ID do recurso existe
- Verifique se a URL está correta
