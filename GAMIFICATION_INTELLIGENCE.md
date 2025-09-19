# 🎮 Inteligência do Sistema de Gamificação - TreinoPRO

## 📋 Como Funciona o Tracking de Missões

### 🔄 Fluxo Completo de Tracking

```
1. CRIAÇÃO DA MISSÃO (Admin)
   ↓
2. ATRIBUIÇÃO DA MISSÃO (Usuário)
   ↓
3. AÇÕES DO USUÁRIO (Automático)
   ↓
4. ATUALIZAÇÃO DE PROGRESSO (Sistema)
   ↓
5. COMPLETAR MISSÃO (Automático)
   ↓
6. RECOMPENSAS (XP + Conquistas)
```

## 🎯 Exemplo: Missão "Complete 3 Treinos"

### 1. **Criação da Missão (Admin)**
```json
{
  "title": "Complete 3 Treinos",
  "description": "Complete 3 aulas de treino para ganhar XP extra",
  "type": "one_time",
  "action": "complete_class",
  "xpReward": 150,
  "requirements": {
    "action": "complete_class",
    "count": 3,
    "timeframe": "monthly"
  },
  "isActive": true
}
```

### 2. **Atribuição da Missão (Usuário)**
- Usuário acessa `/gamification/missions/{id}/assign`
- Sistema cria registro em `user_missions` com:
  - `userId`: ID do usuário
  - `missionId`: ID da missão
  - `status`: "active"
  - `progress`: 0
  - `totalRequired`: 3

### 3. **Tracking Automático de Aulas**
Quando uma aula é completada:

```typescript
// Em classes.service.ts - método completeClass()
await this.gamificationService.processClassCompletion(classData.studentId, id);
await this.gamificationService.processClassCompletion(userId, id); // Personal trainer
```

### 4. **Processamento Inteligente**
```typescript
// Em gamification.service.ts - método processClassCompletion()
async processClassCompletion(userId: string, classId: string): Promise<void> {
  // 1. Dar XP por completar aula
  await this.addXP(userId, {
    xpAmount: 50,
    source: XPSource.CLASS_COMPLETION,
    sourceId: classId,
    description: 'Aula completada',
  });

  // 2. Atualizar progresso de missões relacionadas a aulas
  await this.updateMissionProgress({
    userId,
    action: 'complete_class', // ← AÇÃO QUE A MISSÃO MONITORA
    count: 1,                 // ← QUANTIDADE COMPLETADA
    metadata: { classId },
  });
}
```

### 5. **Atualização de Progresso Inteligente**
```typescript
// Em gamification.service.ts - método updateMissionProgress()
async updateMissionProgress(progressDto: MissionProgressDto): Promise<UserMissionResponseDto[]> {
  const { userId, action, count, metadata } = progressDto;

  // Buscar missões ativas que correspondem à ação
  const activeMissions = await this.db
    .select()
    .from(userMissions)
    .leftJoin(missions, eq(userMissions.missionId, missions.id))
    .where(and(
      eq(userMissions.userId, userId),
      eq(userMissions.status, MissionStatus.ACTIVE),
      eq(missions.action, action) // ← FILTRA POR AÇÃO
    ));

  for (const userMission of activeMissions) {
    const newProgress = userMission.user_missions.progress + count;
    const totalRequired = userMission.missions.requirements.count;

    if (newProgress >= totalRequired) {
      // ✅ MISSÃO COMPLETADA!
      // - Atualizar status para "completed"
      // - Dar XP de recompensa
      // - Registrar data de conclusão
    } else {
      // 📈 ATUALIZAR PROGRESSO
      // - Incrementar contador
      // - Manter status "active"
    }
  }
}
```

## 🧠 Inteligência do Sistema

### **1. Tracking Automático por Ação**
- **Ação**: `complete_class`
- **Trigger**: Quando uma aula é marcada como "completed"
- **Beneficiários**: Aluno E Personal Trainer (ambos ganham XP)
- **Progresso**: Incrementa automaticamente para todas as missões ativas

### **2. Filtros Inteligentes**
```typescript
// O sistema filtra missões por:
- userId: Apenas missões do usuário
- status: Apenas missões "active"
- action: Apenas missões que monitoram "complete_class"
- timeframe: Respeita janela de tempo (daily, weekly, monthly)
```

### **3. Múltiplas Missões Simultâneas**
Um usuário pode ter várias missões ativas:
- "Complete 3 treinos" (progress: 2/3)
- "Complete 1 treino esta semana" (progress: 1/1) ✅
- "Complete 10 treinos este mês" (progress: 2/10)

### **4. Diferentes Tipos de Ação**
```typescript
// Ações monitoradas pelo sistema:
- "complete_class"     // Aulas completadas
- "daily_login"        // Login diário
- "create_proposal"    // Criar proposta
- "accept_proposal"    // Aceitar proposta
- "rate_class"         // Avaliar aula
- "update_profile"     // Atualizar perfil
```

## 🔄 Fluxo de Dados em Tempo Real

### **Cenário: Aluno completa 3ª aula**

1. **Personal Trainer** finaliza aula via `/classes/{id}/complete`
2. **ClassesService** chama `processClassCompletion()` para ambos:
   - Aluno: `processClassCompletion(studentId, classId)`
   - Personal: `processClassCompletion(personalId, classId)`
3. **GamificationService** processa:
   - Adiciona 50 XP para cada um
   - Atualiza progresso de missões: `action: "complete_class", count: 1`
4. **Sistema verifica missões**:
   - Aluno: "Complete 3 treinos" → progress: 3/3 ✅ COMPLETADA!
   - Personal: "Complete 5 treinos" → progress: 1/5
5. **Recompensas automáticas**:
   - Aluno: +150 XP (recompensa da missão) + 50 XP (aula) = 200 XP total
   - Personal: +50 XP (aula apenas)

## 📊 Estrutura de Dados

### **Tabela `user_missions`**
```sql
CREATE TABLE user_missions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  mission_id UUID REFERENCES missions(id),
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'expired'
  progress INTEGER DEFAULT 0,          -- Progresso atual
  completed_at TIMESTAMP,              -- Data de conclusão
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Tabela `missions`**
```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  action VARCHAR(100) NOT NULL,        -- Ação que monitora
  xp_reward INTEGER NOT NULL,
  requirements JSONB NOT NULL,         -- { action, count, timeframe, conditions }
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🎯 Vantagens da Arquitetura

### **1. Automático e Transparente**
- Usuário não precisa "marcar" progresso manualmente
- Sistema detecta ações automaticamente
- Tracking em tempo real

### **2. Escalável**
- Suporta milhares de missões simultâneas
- Filtros eficientes por ação e usuário
- Performance otimizada com índices

### **3. Flexível**
- Diferentes tipos de ação
- Múltiplas condições por missão
- Janelas de tempo configuráveis

### **4. Integrado**
- Conectado com módulo de aulas
- Conectado com sistema de XP
- Conectado com conquistas

## 🚀 Próximos Passos

### **Melhorias Sugeridas:**
1. **Missões Condicionais**: "Complete 3 treinos com personal trainer específico"
2. **Missões em Sequência**: "Complete 1 treino, depois 2, depois 3"
3. **Missões de Equipe**: "Complete 10 treinos entre todos os alunos"
4. **Notificações**: Push notifications quando missão é completada
5. **Analytics**: Dashboard de progresso e estatísticas

### **Integrações Futuras:**
- Sistema de notificações
- Dashboard de analytics
- Sistema de badges visuais
- Ranking entre usuários
- Missões sazonais/eventos especiais

## 📝 Exemplo Prático de Uso

### **1. Admin cria missão:**
```bash
POST /gamification/missions
{
  "title": "Maratona de Treinos",
  "description": "Complete 10 treinos em 30 dias",
  "type": "monthly",
  "action": "complete_class",
  "xpReward": 500,
  "requirements": {
    "action": "complete_class",
    "count": 10,
    "timeframe": "monthly"
  }
}
```

### **2. Usuário se atribui à missão:**
```bash
POST /gamification/missions/{id}/assign
```

### **3. Sistema monitora automaticamente:**
- Aula 1: Progresso 1/10
- Aula 2: Progresso 2/10
- ...
- Aula 10: Progresso 10/10 ✅ MISSÃO COMPLETADA!
- Recompensa: +500 XP automaticamente

O sistema é **inteligente, automático e escalável**! 🎮✨
