# Módulo de Classes

Este módulo gerencia o sistema de aulas e treinos entre alunos e personal trainers.

## Funcionalidades

### 🏋️ Gestão de Aulas
- **Criação de Aulas**: Alunos criam aulas baseadas em propostas aceitas
- **Estados de Aula**: `scheduled` → `active` → `completed` ou `cancelled`
- **Timer em Tempo Real**: Controle de duração das aulas
- **Validações**: Verificações de permissão e horários

### 📊 Estatísticas
- **Métricas de Aulas**: Total, por status, duração média
- **Filtros Avançados**: Por data, status, usuário
- **Relatórios**: Estatísticas para alunos e personal trainers

## Endpoints

### Classes
- `POST /classes` - Criar nova aula
- `GET /classes` - Listar aulas com filtros
- `GET /classes/stats` - Estatísticas das aulas
- `GET /classes/:id` - Obter aula por ID
- `PUT /classes/:id` - Atualizar aula
- `POST /classes/:id/start` - Iniciar aula (personal)
- `POST /classes/:id/confirm-start` - Confirmar início (aluno)
- `POST /classes/:id/complete` - Finalizar aula
- `POST /classes/:id/cancel` - Cancelar aula
- `GET /classes/:id/timeline` - Obter timeline e estados dos botões
- `POST /classes/:id/report-no-show` - Reportar ausência do aluno
- `POST /classes/:id/report-personal-no-show` - Reportar ausência do personal
- `POST /classes/:id/resolve-dispute` - Resolver disputa de ausência
- `GET /classes/disputes` - Listar disputas do usuário

## Estados da Aula

### 📅 Scheduled (Agendada)
- Aula criada e aguardando início
- Pode ser editada pelo personal trainer
- Pode ser cancelada por ambos (até 2h antes)

### ⏳ Pending Confirmation (Aguardando Confirmação)
- Personal trainer iniciou a aula
- Aguardando confirmação do aluno
- Aluno tem 5-10 minutos para confirmar

### 🏃 Active (Ativa)
- Aula em andamento (aluno confirmou)
- Timer ativo
- Não pode ser editada
- Pode ser finalizada pelo personal ou pelo aluno

### ✅ Completed (Concluída)
- Aula finalizada com sucesso
- Estado final
- Não pode ser alterada

### ❌ Cancelled (Cancelada)
- Aula cancelada
- Estado final
- Não pode ser alterada

### ⚠️ No Show Dispute (Em Disputa)
- Ausência reportada por uma das partes
- Sistema de custódia ativado
- Aguardando evidências e resolução

### 🔒 Custody (Em Custódia)
- Valor em custódia para análise
- Aguardando resolução da disputa
- Prazo de 48h para análise

## Lógica de Tempo e Estados dos Botões

### 📱 App do Personal Trainer

#### Timeline de Exemplo:
- **Match**: 18:00
- **Agora**: 21:00  
- **Aula**: 22:00

#### Estados dos Botões:
- **18:00 → 21:59**
  - ✅ Cancelar aula: **ATIVO** (até 2h antes)
  - ✅ Iniciar aula: **ATIVO** (pode pré-iniciar no local)

- **22:00 (T0)**
  - ✅ Iniciar aula: **ATIVO**
  - ❌ Aluno não compareceu: **DESATIVADO** (abre às 22:10)

- **22:10 (T+10min)**
  - ✅ Iniciar aula: **ATIVO**
  - ✅ Aluno não compareceu: **ATIVO**

### 📱 App do Aluno

#### Cancelamento:
- **Até 20:00** → ✅ Cancelamento com **100% de reembolso**
- **20:01 em diante** → ❌ **Não pode cancelar**

#### Estados dos Botões:
- **Antes de 22:00**
  - ✅ Cancelar: conforme regra acima
  - ❌ Iniciar aula: **NÃO existe** para o aluno
  - ❌ Personal não compareceu: **DESATIVADO**

- **22:00 (T0)**
  - ✅ Confirmar início: **ATIVO** (quando personal iniciar)
  - ❌ Personal não compareceu: **DESATIVADO**

- **22:10 (T+10min)**
  - ✅ Personal não compareceu: **ATIVO**

## Validações

### Criação de Aula
- Proposta deve estar aceita
- Usuário deve ser o aluno da proposta
- Não pode existir aula duplicada para a mesma proposta

### Início de Aula
- Apenas personal trainer pode iniciar
- Aula deve estar agendada
- Deve estar entre 30min antes e 10min depois do horário

### Confirmação de Aula
- Apenas aluno pode confirmar
- Aula deve estar aguardando confirmação
- Personal deve ter iniciado a aula

### Reportar Ausência
- Pode ser reportada após 10min do horário agendado
- Personal pode reportar ausência do aluno
- Aluno pode reportar ausência do personal
- Aula deve estar em estado válido

### Finalização de Aula
- Apenas personal trainer pode finalizar
- Aula deve estar ativa
- Deve durar pelo menos 15 minutos

## Integração com Outros Módulos

### 💬 Chat
- Salas de chat por aula
- Notificações de início/fim de aula
- Comunicação em tempo real

### 📋 Propostas
- Aulas criadas a partir de propostas aceitas
- Relacionamento direto entre proposta e aula

### ⭐ Avaliações
- Avaliações mútuas após conclusão da aula
- Sistema de reviews e ratings

## Exemplos de Uso

### Criar Aula
```typescript
const createClassDto = {
  proposalId: 'proposal-123',
  studentId: 'student-456',
  personalId: 'personal-789',
  location: 'Academia Central',
  date: '2024-01-15',
  time: '14:00',
  duration: 60
};
```

### Iniciar Aula
```typescript
const startClassDto = {
  notes: 'Aula iniciada com sucesso'
};
```

### Finalizar Aula
```typescript
const completeClassDto = {
  notes: 'Excelente performance do aluno',
  studentNotes: 'Personal muito atencioso'
};
```

## Testes

O módulo inclui testes unitários completos para:
- ✅ Service (lógica de negócio)
- ✅ Controller (endpoints)
- ✅ Validações e permissões
- ✅ Casos de erro e exceções

Execute os testes com:
```bash
yarn test src/modules/classes
```
