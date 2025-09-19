# 📋 Exemplos de Payloads para Swagger - TreinoPRO API

## 🔐 Autenticação

### Criar Admin
```json
{
  "email": "admin@treinopro.com",
  "password": "admin123",
  "firstName": "Admin",
  "lastName": "Sistema",
  "birthDate": "1990-01-01",
  "documentType": "RG",
  "documentNumber": "123456789"
}
```

### Login
```json
{
  "email": "admin@treinopro.com",
  "password": "admin123"
}
```

### Refresh Token
```json
{
  "refreshToken": "seu_refresh_token_aqui"
}
```

## 👑 Módulo Admin

### Atualizar Usuário
```json
{
  "status": "active",
  "isVerified": true,
  "adminNotes": "Usuário verificado manualmente pelo admin"
}
```

### Atualizar Missão
```json
{
  "title": "Primeira Aula Completa",
  "description": "Complete sua primeira aula na plataforma",
  "xpReward": 150,
  "isActive": true
}
```

## 🎮 Módulo Gamificação

### Adicionar XP
```json
{
  "xpAmount": 100,
  "source": "class_completed",
  "description": "Completou uma aula de musculação"
}
```

### Criar Missão
```json
{
  "title": "Primeira Aula",
  "description": "Complete sua primeira aula na plataforma",
  "type": "one_time",
  "action": "attend_class",
  "xpReward": 100,
  "requirements": {
    "action": "attend_class",
    "count": 1,
    "timeframe": "daily"
  },
  "isActive": true,
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-12-31T23:59:59.999Z"
}
```

### Criar Conquista
```json
{
  "title": "Primeiro Mês",
  "description": "Use a plataforma por um mês consecutivo",
  "category": "time_based",
  "xpReward": 500,
  "requirements": {
    "daysActive": 30
  },
  "isActive": true
}
```

### Iniciar Missão
```json
{
  "missionId": "123e4567-e89b-12d3-a456-426614174000"
}
```

### Completar Missão
```json
{
  "missionId": "123e4567-e89b-12d3-a456-426614174000",
  "completionData": {
    "classesCompleted": 1,
    "completedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

## 📊 Exemplos de Query Parameters

### Listar Missões
```
GET /gamification/missions?status=available&type=daily&page=1&limit=10
```

### Histórico de XP
```
GET /gamification/xp/history?page=1&limit=20&source=class_completed
```

### Ranking
```
GET /gamification/ranking?type=global&period=monthly&page=1&limit=20
```

### Listar Conquistas
```
GET /gamification/achievements?category=time_based&page=1&limit=10
```

## 🎯 Exemplos de Respostas

### Dashboard Admin
```json
{
  "summary": {
    "totalUsers": 150,
    "activeUsers": 120,
    "totalPersonalTrainers": 25,
    "totalStudents": 95,
    "totalClasses": 450,
    "totalRevenue": 12500.50,
    "monthlyGrowth": 15.5
  },
  "recentUsers": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "João Silva",
      "email": "joao@email.com",
      "userType": "student",
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ],
  "recentActivities": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "type": "user_registration",
      "description": "Novo usuário registrado",
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

### Perfil de Gamificação
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "123e4567-e89b-12d3-a456-426614174001",
  "level": 5,
  "totalXP": 1250,
  "currentLevelXP": 250,
  "nextLevelXP": 500,
  "badges": ["first_class", "week_streak"],
  "achievements": ["achievement_1", "achievement_2"],
  "rank": 15,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

### Resposta de Adicionar XP
```json
{
  "message": "XP adicionado com sucesso",
  "newTotalXP": 1350,
  "levelUp": true,
  "newLevel": 6,
  "xpAdded": 100
}
```

### Lista de Missões
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "title": "Primeira Aula",
    "description": "Complete sua primeira aula",
    "type": "one_time",
    "xpReward": 100,
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completions": 45
  }
]
```

### Ranking
```json
[
  {
    "rank": 1,
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "userName": "João Silva",
    "level": 10,
    "totalXP": 5000,
    "badges": ["first_class", "week_streak", "monthly_goal"]
  }
]
```

## 🔧 Headers Necessários

### Para Endpoints Autenticados
```
Authorization: Bearer SEU_JWT_TOKEN_AQUI
Content-Type: application/json
```

### Para Upload de Arquivos
```
Authorization: Bearer SEU_JWT_TOKEN_AQUI
Content-Type: multipart/form-data
```

## 📝 Notas de Teste

1. **IDs**: Use UUIDs válidos nos testes
2. **Datas**: Use formato ISO 8601 (2024-01-15T10:30:00.000Z)
3. **Enums**: Use valores exatos definidos nos DTOs
4. **Paginação**: page começa em 1, limit padrão é 20
5. **Validação**: Todos os campos obrigatórios devem ser preenchidos
