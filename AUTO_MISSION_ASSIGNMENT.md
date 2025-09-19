# 🎯 Sistema de Atribuição Automática de Missões - TreinoPRO

## ✅ **Implementado!** 

Agora o sistema **automaticamente atribui a próxima missão** quando o usuário completa uma missão, sem precisar de tela de escolha no app.

## 🚀 **Como Funciona**

### **1. Atribuição Automática na Completude**
```typescript
// Quando usuário completa uma missão:
1. Missão é marcada como "completed"
2. Usuário ganha XP de recompensa
3. Sistema busca próxima missão disponível
4. Próxima missão é atribuída automaticamente
5. Usuário já tem nova missão para trabalhar
```

### **2. Atribuição na Criação do Perfil**
```typescript
// Quando usuário se cadastra:
1. Perfil de gamificação é criado
2. Primeira missão é atribuída automaticamente
3. Usuário já começa com uma missão ativa
```

## 🏗️ **Novos Campos no Schema**

### **Tabela `missions`**
```sql
ALTER TABLE missions ADD COLUMN priority INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE missions ADD COLUMN auto_assign BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE missions ADD COLUMN prerequisites JSONB DEFAULT '[]' NOT NULL;
```

### **Campos Explicados:**
- **`priority`**: Prioridade para atribuição (0 = mais alta, 1, 2, 3...)
- **`autoAssign`**: Se deve ser atribuída automaticamente (true/false)
- **`prerequisites`**: Array de IDs das missões que devem ser completadas antes

## 📋 **Exemplo de Uso**

### **1. Admin Cria Missões em Sequência**
```json
// Missão 1 (Prioridade 0 - Primeira)
{
  "title": "Primeira Aula",
  "description": "Complete sua primeira aula de treino",
  "action": "complete_class",
  "xpReward": 100,
  "priority": 0,
  "autoAssign": true,
  "prerequisites": [],
  "requirements": {
    "action": "complete_class",
    "count": 1
  }
}

// Missão 2 (Prioridade 1 - Segunda)
{
  "title": "Complete 3 Treinos",
  "description": "Complete 3 aulas para ganhar XP extra",
  "action": "complete_class",
  "xpReward": 150,
  "priority": 1,
  "autoAssign": true,
  "prerequisites": ["missao-1-id"],
  "requirements": {
    "action": "complete_class",
    "count": 3
  }
}

// Missão 3 (Prioridade 2 - Terceira)
{
  "title": "Complete 10 Treinos",
  "description": "Complete 10 aulas para desbloquear conquista especial",
  "action": "complete_class",
  "xpReward": 500,
  "priority": 2,
  "autoAssign": true,
  "prerequisites": ["missao-2-id"],
  "requirements": {
    "action": "complete_class",
    "count": 10
  }
}
```

### **2. Fluxo Automático do Usuário**
```
1. Usuário se cadastra
   ↓
2. Sistema atribui "Primeira Aula" (priority: 0)
   ↓
3. Usuário completa 1ª aula
   ↓
4. Sistema atribui "Complete 3 Treinos" (priority: 1)
   ↓
5. Usuário completa 3 aulas
   ↓
6. Sistema atribui "Complete 10 Treinos" (priority: 2)
   ↓
7. E assim por diante...
```

## 🎮 **Endpoints Disponíveis**

### **1. Atribuição Automática Manual**
```bash
POST /gamification/missions/auto-assign
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "message": "Próxima missão atribuída com sucesso",
  "mission": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "title": "Complete 3 Treinos",
    "description": "Complete 3 aulas para ganhar XP extra",
    "xpReward": 150
  }
}
```

### **2. Listar Missões Disponíveis**
```bash
GET /gamification/missions?isActive=true&autoAssign=true
```

### **3. Listar Minhas Missões**
```bash
GET /gamification/missions/user/my-missions
```

## 🧠 **Lógica de Atribuição**

### **Critérios de Seleção:**
1. **Ativa**: `isActive = true`
2. **Auto-atribuição**: `autoAssign = true`
3. **Não atribuída**: Não está em `user_missions` com status "active"
4. **Pré-requisitos**: Todas as missões em `prerequisites` foram completadas
5. **Prioridade**: Ordenado por `priority` (menor = maior prioridade)
6. **Data**: Em caso de empate, ordenado por `createdAt`

### **Algoritmo:**
```typescript
async getAvailableMissionsForUser(userId: string) {
  // 1. Buscar missões completadas pelo usuário
  const completedMissions = await getCompletedMissions(userId);
  
  // 2. Buscar missões ativas e auto-atribuíveis
  const availableMissions = await getActiveMissions();
  
  // 3. Filtrar por pré-requisitos
  const eligibleMissions = availableMissions.filter(mission => {
    return mission.prerequisites.every(prereqId => 
      completedMissions.includes(prereqId)
    );
  });
  
  // 4. Ordenar por prioridade
  return eligibleMissions.sort((a, b) => a.priority - b.priority);
}
```

## 🎯 **Vantagens do Sistema**

### **1. Experiência Fluida**
- ✅ Usuário não precisa escolher missão
- ✅ Transição automática entre missões
- ✅ Sempre tem algo para fazer

### **2. Progressão Estruturada**
- ✅ Missões em sequência lógica
- ✅ Pré-requisitos respeitados
- ✅ Dificuldade crescente

### **3. Flexibilidade**
- ✅ Admin controla prioridade
- ✅ Pode desabilitar auto-atribuição
- ✅ Sistema de pré-requisitos

### **4. Escalabilidade**
- ✅ Suporta milhares de missões
- ✅ Performance otimizada
- ✅ Fácil manutenção

## 📊 **Exemplo de Sequência de Missões**

### **Nível Iniciante (Priority 0-2)**
1. **Primeira Aula** (priority: 0) - Complete 1 aula
2. **Complete 3 Treinos** (priority: 1) - Complete 3 aulas
3. **Complete 5 Treinos** (priority: 2) - Complete 5 aulas

### **Nível Intermediário (Priority 3-5)**
4. **Complete 10 Treinos** (priority: 3) - Complete 10 aulas
5. **Complete 20 Treinos** (priority: 4) - Complete 20 aulas
6. **Complete 50 Treinos** (priority: 5) - Complete 50 aulas

### **Nível Avançado (Priority 6+)**
7. **Complete 100 Treinos** (priority: 6) - Complete 100 aulas
8. **Maratona de Treinos** (priority: 7) - Complete 200 aulas

## 🔧 **Configuração para Admin**

### **1. Criar Missão com Prioridade**
```bash
POST /gamification/missions
{
  "title": "Nova Missão",
  "description": "Descrição da missão",
  "action": "complete_class",
  "xpReward": 200,
  "priority": 5,
  "autoAssign": true,
  "prerequisites": ["missao-anterior-id"],
  "requirements": {
    "action": "complete_class",
    "count": 10
  }
}
```

### **2. Atualizar Prioridade**
```bash
PUT /gamification/missions/{id}
{
  "priority": 3,
  "autoAssign": false
}
```

## 🎉 **Resultado Final**

**Agora o sistema funciona exatamente como você queria:**

1. ✅ **Usuário completa missão**
2. ✅ **Sistema busca próxima automaticamente**
3. ✅ **Próxima missão é atribuída**
4. ✅ **Usuário continua progredindo**
5. ✅ **Sem necessidade de tela de escolha**

**O fluxo é totalmente automático e fluido!** 🚀✨
