# 📋 Módulo de Propostas - TreinoPRO API

## ✅ Status da Implementação

O módulo de propostas foi **completamente implementado** com todos os endpoints necessários para o funcionamento do sistema de propostas de treino!

## 🚀 **Funcionalidades Implementadas**

### **📝 Endpoints Disponíveis**

#### **1. Criar Proposta**
```http
POST /proposals
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "locationName": "Academia Smart Fit - Shopping Iguatemi",
  "locationAddress": "Av. Paulista, 1000 - Bela Vista, São Paulo - SP",
  "trainingDate": "2024-01-15T14:00:00.000Z",
  "trainingTime": "14:00",
  "durationMinutes": 60,
  "modalityName": "Musculação",
  "price": 80.00,
  "additionalNotes": "Preferência por personal trainer especializado em reabilitação"
}
```

#### **2. Listar Propostas**
```http
GET /proposals?page=1&limit=10&status=pending&modality=Musculação
Authorization: Bearer <jwt_token>
```

#### **3. Minhas Propostas (Aluno)**
```http
GET /proposals/my?page=1&limit=10
Authorization: Bearer <jwt_token>
```

#### **4. Obter Proposta por ID**
```http
GET /proposals/{id}
Authorization: Bearer <jwt_token>
```

#### **5. Atualizar Proposta**
```http
PUT /proposals/{id}
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "status": "matched",
  "additionalNotes": "Personal trainer confirmado para o horário"
}
```

#### **6. Cancelar Proposta**
```http
DELETE /proposals/{id}
Authorization: Bearer <jwt_token>
```

#### **7. Aceitar Proposta (Personal Trainer)**
```http
POST /proposals/{id}/accept
Authorization: Bearer <jwt_token>
```

#### **8. Estatísticas das Propostas**
```http
GET /proposals/stats
Authorization: Bearer <jwt_token>
```

## 🏗️ **Arquitetura Implementada**

### **Estrutura de Arquivos**
```
src/modules/proposals/
├── dto/
│   └── proposals.dto.ts          # DTOs de validação
├── proposals.controller.ts       # Controller REST
├── proposals.service.ts          # Lógica de negócio
├── proposals.module.ts           # Módulo Nest.js
├── proposals.service.spec.ts     # Testes unitários
└── README.md                     # Documentação
```

### **Padrões Utilizados**
- ✅ **Clean Architecture** - Separação clara de responsabilidades
- ✅ **DTOs** - Validação robusta com class-validator
- ✅ **Guards** - Autenticação JWT obrigatória
- ✅ **Swagger** - Documentação automática da API
- ✅ **Error Handling** - Tratamento de erros específicos
- ✅ **Type Safety** - TypeScript com tipagem forte

## 🔐 **Segurança e Validações**

### **Autenticação**
- **JWT Required**: Todos os endpoints requerem autenticação
- **User Type Validation**: Alunos vs Personal Trainers
- **Permission Checks**: Usuários só acessam suas próprias propostas

### **Validações de Negócio**
- **Data Futura**: Propostas não podem ser criadas para datas passadas
- **Status Validation**: Apenas propostas pendentes podem ser aceitas
- **Permission Validation**: Usuários só editam suas próprias propostas
- **Price Validation**: Valor mínimo de R$ 20,00

### **Validações de Dados**
- **Required Fields**: Campos obrigatórios validados
- **String Length**: Limites de caracteres respeitados
- **UUID Format**: IDs validados como UUID
- **Date Format**: Datas em formato ISO 8601

## 📊 **Funcionalidades por Tipo de Usuário**

### **👨‍🎓 Aluno (Student)**
- ✅ **Criar propostas** de treino
- ✅ **Visualizar suas propostas** (todas)
- ✅ **Editar propostas** pendentes
- ✅ **Cancelar propostas** não concluídas
- ✅ **Ver estatísticas** das suas propostas

### **👨‍💼 Personal Trainer (Personal)**
- ✅ **Visualizar propostas pendentes** (para aceitar)
- ✅ **Aceitar propostas** de alunos
- ✅ **Filtrar propostas** por modalidade, data, etc.
- ✅ **Ver estatísticas** das propostas disponíveis

## 🎯 **Filtros e Paginação**

### **Filtros Disponíveis**
- **Status**: `pending`, `matched`, `completed`, `cancelled`
- **Modalidade**: Busca por nome da modalidade
- **Data**: `dateFrom` e `dateTo` para filtrar por período
- **Página**: Paginação com `page` e `limit`

### **Exemplo de Filtro**
```http
GET /proposals?status=pending&modality=Musculação&dateFrom=2024-01-01&page=1&limit=5
```

## 📈 **Respostas da API**

### **Sucesso (201)**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "studentId": "456e7890-e89b-12d3-a456-426614174000",
  "locationName": "Academia Smart Fit - Shopping Iguatemi",
  "locationAddress": "Av. Paulista, 1000 - Bela Vista, São Paulo - SP",
  "trainingDate": "2024-01-15T14:00:00.000Z",
  "trainingTime": "14:00",
  "durationMinutes": 60,
  "modalityName": "Musculação",
  "price": 80.00,
  "additionalNotes": "Preferência por personal trainer especializado em reabilitação",
  "status": "pending",
  "createdAt": "2024-01-10T10:00:00.000Z",
  "updatedAt": "2024-01-10T10:00:00.000Z"
}
```

### **Lista Paginada (200)**
```json
{
  "proposals": [...],
  "total": 25,
  "page": 1,
  "limit": 10
}
```

### **Erro (400/403/404)**
```json
{
  "statusCode": 400,
  "message": "A data do treino deve ser no futuro",
  "error": "Bad Request"
}
```

## 🧪 **Como Testar**

### **1. Usando Swagger UI**
1. Acesse `http://localhost:3000/api/docs`
2. Faça login para obter o token JWT
3. Use o botão "Authorize" para inserir o token
4. Teste os endpoints diretamente na interface

### **2. Usando cURL**
```bash
# Criar proposta
curl -X POST http://localhost:3000/proposals \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "locationName": "Academia Smart Fit",
    "locationAddress": "Av. Paulista, 1000",
    "trainingDate": "2024-01-15T14:00:00.000Z",
    "trainingTime": "14:00",
    "durationMinutes": 60,
    "modalityName": "Musculação",
    "price": 80.00
  }'

# Listar propostas
curl -X GET "http://localhost:3000/proposals?page=1&limit=10" \
  -H "Authorization: Bearer <jwt_token>"
```

## 🔮 **Próximos Passos**

### **Melhorias Futuras**
- [ ] **Sistema de Notificações**: Notificar personal trainers sobre novas propostas
- [ ] **Geolocalização**: Filtrar propostas por proximidade
- [ ] **Sistema de Matching**: Algoritmo para sugerir personal trainers
- [ ] **Histórico Detalhado**: Log de todas as alterações
- [ ] **Analytics**: Métricas de performance das propostas

### **Integrações**
- [ ] **WebSocket**: Notificações em tempo real
- [ ] **Email Service**: Notificações por email
- [ ] **Push Notifications**: Notificações mobile
- [ ] **Payment Gateway**: Integração com pagamentos

---

**🎉 Módulo de Propostas Implementado com Sucesso!**

O sistema de propostas está totalmente funcional e pronto para ser integrado com o frontend Flutter. Todos os endpoints estão documentados no Swagger e prontos para uso! 🚀✨
