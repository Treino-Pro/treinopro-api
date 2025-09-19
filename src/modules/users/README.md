# 👤 Módulo de Usuários - TreinoPRO API

## ✅ Status da Implementação

O módulo de usuários foi **completamente implementado** com operações CRUD básicas e funcionalidades de gerenciamento de perfil!

## 🚀 **Funcionalidades Implementadas**

### **📝 Endpoints Disponíveis**

#### **1. CRUD Básico**
```http
POST   /users                    # Criar novo usuário
GET    /users                    # Listar usuários (com filtros)
GET    /users/{id}              # Obter usuário por ID
PUT    /users/{id}              # Atualizar usuário
PATCH  /users/{id}/status       # Atualizar status do usuário
DELETE /users/{id}              # Desativar usuário (soft delete)
```

#### **2. Gerenciamento de Perfil**
```http
GET    /users/profile/me        # Obter perfil do usuário logado
PUT    /users/profile/me        # Atualizar perfil do usuário logado
```

#### **3. Busca e Filtros Específicos**
```http
GET    /users/personal-trainers # Listar apenas personal trainers
GET    /users/students          # Listar apenas alunos
GET    /users/specialty/{specialty} # Listar por especialidade
```

#### **4. Estatísticas e Utilitários**
```http
GET    /users/stats             # Estatísticas gerais de usuários
GET    /users/email/{email}     # Obter usuário por email
GET    /users/exists/{id}       # Verificar se usuário existe
```

## 🏗️ **Arquitetura Implementada**

### **Estrutura de Arquivos**
```
src/modules/users/
├── dto/
│   └── users.dto.ts            # DTOs de validação e resposta
├── users.controller.ts          # Controller REST
├── users.service.ts            # Lógica de negócio
├── users.module.ts             # Configuração do módulo
└── README.md                   # Esta documentação
```

### **DTOs Implementados**
- `CreateUserDto` - Criação de usuário
- `UpdateUserDto` - Atualização de usuário
- `UpdateProfileDto` - Atualização de perfil
- `UserSearchDto` - Filtros de busca
- `UpdateUserStatusDto` - Atualização de status
- `UserResponseDto` - Resposta de usuário
- `UserListResponseDto` - Resposta de lista

## 📊 **Funcionalidades por Tipo de Usuário**

### **Para Todos os Usuários:**
- ✅ Criação e atualização de perfil
- ✅ Upload de foto de perfil
- ✅ Gerenciamento de dados pessoais
- ✅ Busca e filtros avançados
- ✅ Estatísticas pessoais

### **Para Personal Trainers:**
- ✅ Gerenciamento de especialidades
- ✅ Campos específicos do CREF
- ✅ Validação de documentos
- ✅ Dados de responsabilidade

### **Para Alunos:**
- ✅ Campos para menores de idade
- ✅ Dados do responsável
- ✅ Consentimento parental

## 🔍 **Filtros e Busca**

### **Filtros Disponíveis:**
- **Busca por texto**: Nome, email, CREF
- **Tipo de usuário**: Student ou Personal
- **Status**: Active, Inactive, Suspended
- **Especialidade**: Filtro por especialidade específica
- **Paginação**: Page e limit configuráveis

### **Exemplo de Busca:**
```http
GET /users?search=João&userType=personal&specialty=Musculação&page=1&limit=10
```

## 📈 **Estatísticas Disponíveis**

```json
{
  "total": 1000,
  "active": 950,
  "inactive": 50,
  "students": 800,
  "personalTrainers": 200,
  "verified": 900,
  "recent": 50
}
```

## 🔐 **Segurança e Validação**

### **Validações Implementadas:**
- ✅ Email único no sistema
- ✅ Validação de formato de email
- ✅ Validação de senha (mínimo 6 caracteres)
- ✅ Validação de datas
- ✅ Validação de UUIDs
- ✅ Validação de enums
- ✅ Sanitização de dados

### **Autenticação:**
- ✅ Todas as rotas requerem JWT
- ✅ Proteção contra acesso não autorizado
- ✅ Validação de permissões

## 🚀 **Integração com Outros Módulos**

O módulo de usuários está preparado para integrar com:

- **Auth Module**: Autenticação e autorização
- **Classes Module**: Aulas e treinos
- **Proposals Module**: Propostas de treino
- **Ratings Module**: Avaliações
- **Payments Module**: Pagamentos
- **Upload Module**: Upload de arquivos
- **Notifications Module**: Notificações

## 📝 **Exemplos de Uso**

### **Criar Usuário:**
```http
POST /users
Content-Type: application/json

{
  "email": "joao@email.com",
  "firstName": "João",
  "lastName": "Silva",
  "password": "senha123",
  "birthDate": "1990-01-15",
  "userType": "student",
  "documentType": "RG",
  "documentNumber": "123456789",
  "termsAccepted": true,
  "privacyPolicyAccepted": true
}
```

### **Atualizar Perfil:**
```http
PUT /users/profile/me
Content-Type: application/json

{
  "firstName": "João Carlos",
  "profileImageId": "uuid-da-imagem",
  "specialties": ["Musculação", "Pilates"]
}
```

### **Buscar Personal Trainers:**
```http
GET /users/personal-trainers?specialty=Musculação&page=1&limit=10
```

## 🎯 **Próximos Passos**

1. **Integração com outros módulos** para dados agregados
2. **Relatórios avançados** de usuários
3. **Sistema de permissões** mais granular
4. **Auditoria de alterações** de usuários
5. **Exportação de dados** em CSV/Excel

---

*Módulo implementado em: Janeiro 2024*
*Versão: 1.0.0*
