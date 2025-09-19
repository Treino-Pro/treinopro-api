# 🎯 Como Funcionam as Missões Compartilhadas - TreinoPRO

## ❓ **Sua Pergunta:**
> "Se um usuário completar a missão, a missão vai sumir para outros usuários?"

## ✅ **Resposta: NÃO!**

As missões **NÃO somem** para outros usuários quando alguém as completa. Cada usuário tem seu próprio progresso individual.

## 🏗️ **Arquitetura do Sistema**

### **Duas Tabelas Separadas:**

#### 1. **`missions`** - Missões Globais (Template)
```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,           -- "Complete 3 treinos"
  description TEXT NOT NULL,             -- "Complete 3 aulas para ganhar XP"
  xp_reward INTEGER NOT NULL,            -- 150 XP
  action VARCHAR(100) NOT NULL,          -- "complete_class"
  requirements JSONB NOT NULL,           -- { "action": "complete_class", "count": 3 }
  is_active BOOLEAN DEFAULT true,        -- Disponível para todos
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. **`user_missions`** - Progresso Individual
```sql
CREATE TABLE user_missions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),     -- Usuário específico
  mission_id UUID REFERENCES missions(id), -- Missão global
  status VARCHAR(20) DEFAULT 'active',   -- 'active', 'completed', 'expired'
  progress INTEGER DEFAULT 0,            -- 0, 1, 2, 3...
  completed_at TIMESTAMP,                -- Quando completou
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔄 **Fluxo de Funcionamento**

### **1. Admin Cria Missão (Uma vez)**
```json
{
  "title": "Complete 3 Treinos",
  "description": "Complete 3 aulas para ganhar 150 XP",
  "action": "complete_class",
  "xpReward": 150,
  "requirements": {
    "action": "complete_class",
    "count": 3
  },
  "isActive": true
}
```
**Resultado**: Missão fica disponível para **TODOS** os usuários

### **2. Usuários Se Atribuem Individualmente**
- **João** acessa `/gamification/missions/{id}/assign`
- **Maria** acessa `/gamification/missions/{id}/assign`
- **Pedro** acessa `/gamification/missions/{id}/assign`

**Resultado**: Cada um tem seu próprio registro em `user_missions`:
```
user_missions:
- { user_id: "joao", mission_id: "missao-123", progress: 0, status: "active" }
- { user_id: "maria", mission_id: "missao-123", progress: 0, status: "active" }
- { user_id: "pedro", mission_id: "missao-123", progress: 0, status: "active" }
```

### **3. Progresso Individual**
- **João** completa 1 aula → progress: 1/3
- **Maria** completa 2 aulas → progress: 2/3
- **Pedro** completa 3 aulas → progress: 3/3 ✅ **COMPLETADA!**

**Resultado**: 
- **João**: Ainda vê a missão (1/3)
- **Maria**: Ainda vê a missão (2/3)
- **Pedro**: Missão marcada como "completed" + ganha 150 XP

### **4. Missão Continua Disponível**
- **Ana** se cadastra depois
- **Ana** pode se atribuir à mesma missão
- **Ana** começa do 0/3

## 📊 **Exemplo Prático**

### **Cenário: Missão "Complete 3 Treinos"**

| Usuário | Status | Progresso | XP Ganho |
|---------|--------|-----------|----------|
| João    | Ativa  | 1/3       | 0        |
| Maria   | Ativa  | 2/3       | 0        |
| Pedro   | ✅ Completa | 3/3    | 150 XP   |
| Ana     | Ativa  | 0/3       | 0        |
| Carlos  | Ativa  | 1/3       | 0        |

**Resultado**: Todos ainda veem a missão, cada um com seu progresso individual!

## 🎮 **Vantagens do Sistema**

### **1. Missões Reutilizáveis**
- Uma missão pode ser feita por milhares de usuários
- Não precisa criar missão para cada usuário
- Economia de recursos e consistência

### **2. Progresso Individual**
- Cada usuário tem seu próprio progresso
- Não interfere no progresso dos outros
- Competição saudável entre usuários

### **3. Flexibilidade**
- Usuários podem se atribuir quando quiserem
- Missões podem ter datas de início/fim
- Diferentes tipos: daily, weekly, monthly, special

### **4. Escalabilidade**
- Suporta milhões de usuários
- Performance otimizada
- Fácil manutenção

## 🔍 **Como Verificar no Código**

### **Listar Missões Disponíveis:**
```typescript
// GET /gamification/missions
// Retorna TODAS as missões ativas (templates)
async getMissions(query: MissionQueryDto) {
  return this.db
    .select()
    .from(missions)  // ← Tabela global
    .where(eq(missions.isActive, true));
}
```

### **Listar Minhas Missões:**
```typescript
// GET /gamification/missions/user/my-missions
// Retorna minhas missões com progresso
async getUserMissions(userId: string) {
  return this.db
    .select()
    .from(userMissions)  // ← Tabela individual
    .leftJoin(missions, eq(userMissions.missionId, missions.id))
    .where(eq(userMissions.userId, userId));
}
```

## 🎯 **Resumo**

- ✅ **Missões são compartilhadas** entre todos os usuários
- ✅ **Progresso é individual** para cada usuário
- ✅ **Completar não remove** a missão para outros
- ✅ **Sistema escalável** e eficiente
- ✅ **Cada usuário** pode se atribuir quando quiser

**É como um "template" de missão que todos podem usar, mas cada um tem seu próprio progresso!** 🎮✨
