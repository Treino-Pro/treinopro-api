# Módulo de Avaliações

## Visão Geral

O módulo de avaliações implementa um sistema completo de avaliações mútuas entre alunos e personal trainers, permitindo feedback detalhado sobre o desempenho de ambos os lados.

## Funcionalidades

### ✅ **Sistema de Avaliações Bidirecionais**
- **Aluno → Personal**: Avalia pontualidade, comunicação, conhecimento, motivação e equipamentos
- **Personal → Aluno**: Avalia engajamento, esforço e progresso do aluno
- **Auto-avaliação**: Personal pode se auto-avaliar em profissionalismo, conhecimento, motivação e comunicação

### ✅ **Estados de Avaliação**
- `PENDING`: Aguardando avaliação
- `COMPLETED`: Avaliação concluída
- `CANCELLED`: Avaliação cancelada

### ✅ **Sistema Automático**
- Criação automática de avaliações pendentes após aula concluída
- Notificações para usuários avaliarem
- Prazo para avaliação (configurável)

## Endpoints REST

### **Avaliações**
- `POST /ratings` - Criar nova avaliação
- `PUT /ratings/:id` - Atualizar avaliação existente
- `GET /ratings/:id` - Obter avaliação por ID
- `DELETE /ratings/:id` - Cancelar avaliação
- `GET /ratings` - Listar avaliações com filtros
- `GET /ratings/received` - Avaliações recebidas pelo usuário

### **Filtros e Categorias**
- `GET /ratings/pending` - Avaliações pendentes
- `GET /ratings/completed` - Avaliações concluídas
- `GET /ratings/personal` - Avaliações de personal trainers
- `GET /ratings/student` - Avaliações de alunos
- `GET /ratings/received/personal` - Avaliações recebidas de personal trainers
- `GET /ratings/received/student` - Avaliações recebidas de alunos

### **Estatísticas e Relatórios**
- `GET /ratings/stats/my` - Estatísticas das minhas avaliações
- `GET /ratings/stats/received` - Estatísticas das avaliações recebidas
- `GET /ratings/summary/:userId` - Resumo de avaliações de um usuário

### **Sistema Automático**
- `POST /ratings/automatic` - Criar avaliações automáticas após aula

## Estrutura de Dados

### **Campos de Avaliação do Personal (Aluno avalia)**
- `rating`: Nota geral (1-5)
- `punctuality`: Pontualidade (1-5)
- `communication`: Comunicação (1-5)
- `knowledge`: Conhecimento técnico (1-5)
- `motivation`: Capacidade de motivar (1-5)
- `equipment`: Uso de equipamentos (1-5)
- `comment`: Comentário livre

### **Campos de Avaliação do Aluno (Personal avalia)**
- `rating`: Nota geral (1-5)
- `studentEngagement`: Engajamento do aluno (1-5)
- `studentEffort`: Esforço do aluno (1-5)
- `studentProgress`: Progresso do aluno (1-5)
- `comment`: Comentário livre

### **Campos de Auto-avaliação do Personal**
- `rating`: Nota geral (1-5)
- `personalProfessionalism`: Profissionalismo (1-5)
- `personalKnowledge`: Conhecimento técnico (1-5)
- `personalMotivation`: Capacidade de motivar (1-5)
- `personalCommunication`: Comunicação (1-5)
- `comment`: Comentário livre

## Validações

### **Criação de Avaliação**
- ✅ Aula deve existir e estar concluída
- ✅ Usuário deve ter permissão para avaliar
- ✅ Não pode haver avaliação duplicada
- ✅ Notas devem estar entre 1-5
- ✅ Campos específicos baseados no tipo de avaliação

### **Atualização de Avaliação**
- ✅ Apenas avaliações pendentes podem ser alteradas
- ✅ Usuário deve ser o autor da avaliação
- ✅ Validação de tipos de dados

### **Cancelamento de Avaliação**
- ✅ Apenas avaliações pendentes podem ser canceladas
- ✅ Usuário deve ser o autor da avaliação

## Integração com Outros Módulos

### **Módulo de Classes**
- Avaliações são criadas automaticamente após aula concluída
- Estados da aula influenciam disponibilidade para avaliação
- Timeline de aulas inclui status de avaliações

### **Módulo de Usuários**
- Perfis incluem resumo de avaliações
- Estatísticas de reputação baseadas em avaliações
- Histórico de avaliações recebidas e dadas

### **Sistema de Notificações**
- Notificações para avaliações pendentes
- Lembretes de prazo para avaliação
- Confirmações de avaliação concluída

## Casos de Uso

### **1. Fluxo Completo de Avaliação**
1. Aula é concluída pelo personal
2. Sistema cria avaliações pendentes para ambos os usuários
3. Usuários recebem notificações
4. Cada usuário avalia o outro
5. Avaliações são processadas e estatísticas atualizadas

### **2. Avaliação Detalhada do Personal**
- Aluno avalia: pontualidade, comunicação, conhecimento, motivação, equipamentos
- Sistema calcula média ponderada
- Personal recebe feedback detalhado

### **3. Avaliação do Aluno pelo Personal**
- Personal avalia: engajamento, esforço, progresso
- Sistema gera relatório de desenvolvimento
- Aluno vê seu progresso ao longo do tempo

### **4. Sistema de Reputação**
- Cálculo automático de reputação baseado em avaliações
- Filtros de busca por reputação
- Incentivos para manter alta qualidade

## Testes

### **Cobertura de Testes**
- ✅ **Service**: 15 testes unitários
- ✅ **Controller**: 12 testes unitários
- ✅ **Validações**: Todos os cenários cobertos
- ✅ **Casos de erro**: Tratamento completo

### **Cenários Testados**
- Criação de avaliações (sucesso e erro)
- Atualização de avaliações
- Cancelamento de avaliações
- Filtros e busca
- Estatísticas e relatórios
- Validações de permissão
- Estados de avaliação

## Configurações

### **Variáveis de Ambiente**
```env
# Configurações de avaliação
RATING_DEADLINE_DAYS=7  # Prazo para avaliação em dias
RATING_REMINDER_DAYS=3  # Dias antes do prazo para lembrete
```

### **Configurações do Banco**
- Tabela `ratings` com todos os campos necessários
- Relacionamentos com `users` e `classes`
- Índices para performance de consultas
- Constraints de integridade

## Próximos Passos

### **Melhorias Planejadas**
- [ ] Sistema de notificações push
- [ ] Relatórios avançados de performance
- [ ] Integração com sistema de gamificação
- [ ] Avaliações anônimas (opcional)
- [ ] Sistema de denúncias de avaliações inadequadas

### **Integrações Futuras**
- [ ] Dashboard de analytics
- [ ] Exportação de relatórios
- [ ] API para terceiros
- [ ] Sistema de badges baseado em avaliações
