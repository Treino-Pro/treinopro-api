# Módulo de Sistema de Pagamentos

## Visão Geral

O módulo de pagamentos implementa um sistema completo de pagamentos com integração ao Mercado Pago, incluindo split de pagamentos, sistema de disputas e gestão de carteiras digitais.

## Funcionalidades

### ✅ **Sistema de Pagamentos com Split**
- **Integração Mercado Pago**: Criação de preferências e processamento de webhooks
- **Split Automático**: 10% para plataforma, 90% para personal trainer
- **Pagamentos em Custódia**: Valores ficam "congelados" até aula finalizar
- **Captura Automática**: Liberação após confirmação de conclusão da aula

### ✅ **Sistema de Disputas**
- **Reportar Ausência**: Personal pode reportar aluno não compareceu
- **Contestação do Aluno**: Aluno pode negar a ausência
- **Sistema de Evidências**: Upload de provas por ambos os lados
- **Resolução Administrativa**: Admin resolve baseado em evidências
- **Custódia de 48h**: Prazo para resolução de disputas

### ✅ **Sistema de Carteira**
- **Saldo Disponível**: Valores liberados para saque
- **Saldo Pendente**: Valores em custódia
- **Histórico de Transações**: Todas as movimentações financeiras
- **Solicitação de Saque**: Transferência para conta bancária

## Fluxo de Pagamento com Split

### **1. Criação do Pagamento**
```
Aluno deu match → Criar preferência MP → Pagamento em custódia
```

### **2. Aula Normal**
```
Personal inicia → Aluno confirma → Aula concluída → Captura automática
```

### **3. Cancelamento pelo Personal**
```
Personal cancela → Reembolso total ao aluno
```

### **4. Disputa por Ausência**
```
Personal reporta ausência → Aluno confirma/nega → Custódia 48h → Resolução
```

## Endpoints REST

### **Pagamentos**
- `POST /payments/preference` - Criar preferência de pagamento
- `POST /payments/webhook` - Webhook do Mercado Pago
- `GET /payments/:id` - Obter pagamento por ID
- `GET /payments` - Listar pagamentos com filtros
- `GET /payments/stats/my` - Estatísticas pessoais
- `GET /payments/stats/all` - Estatísticas gerais (admin)

### **Disputas**
- `POST /payments/disputes` - Criar disputa
- `PUT /payments/disputes/:id/evidence` - Submeter evidências
- `PUT /payments/disputes/:id/resolve` - Resolver disputa (admin)
- `GET /payments/disputes` - Listar disputas
- `GET /payments/disputes/:id` - Obter disputa por ID

### **Carteira**
- `GET /payments/wallet/balance` - Saldo da carteira
- `PUT /payments/wallet` - Atualizar carteira
- `POST /payments/wallet/withdraw` - Solicitar saque
- `GET /payments/wallet/transactions` - Histórico de transações

### **Filtros e Relatórios**
- `GET /payments/pending` - Pagamentos pendentes
- `GET /payments/authorized` - Pagamentos autorizados
- `GET /payments/captured` - Pagamentos capturados
- `GET /payments/refunded` - Pagamentos reembolsados
- `GET /payments/disputed` - Pagamentos em disputa
- `GET /payments/class/:classId` - Pagamentos de uma aula
- `GET /payments/reports/daily` - Relatório diário
- `GET /payments/reports/weekly` - Relatório semanal
- `GET /payments/reports/monthly` - Relatório mensal

### **Administração**
- `GET /payments/admin/dashboard` - Dashboard administrativo
- `GET /payments/admin/disputes/pending` - Disputas pendentes
- `GET /payments/admin/users/:userId/payments` - Pagamentos de usuário
- `GET /payments/admin/users/:userId/wallet` - Carteira de usuário

## Estrutura de Dados

### **Tabelas Principais**
- `payments` - Pagamentos principais
- `payment_disputes` - Disputas de pagamento
- `payment_transactions` - Histórico de transações
- `user_wallets` - Carteiras dos usuários

### **Estados do Pagamento**
- `PENDING` - Aguardando confirmação
- `AUTHORIZED` - Autorizado (em custódia)
- `CAPTURED` - Capturado (split aplicado)
- `REFUNDED` - Reembolsado
- `CANCELLED` - Cancelado
- `DISPUTED` - Em disputa
- `DISPUTE_RESOLVED` - Disputa resolvida

### **Estados da Disputa**
- `PENDING` - Aguardando evidências
- `UNDER_REVIEW` - Em análise
- `RESOLVED_PRO_STUDENT` - Resolvido a favor do aluno
- `RESOLVED_PRO_PERSONAL` - Resolvido a favor do personal
- `EXPIRED` - Expirada (48h)

## Integração com Mercado Pago

### **Configuração**
```env
MP_ACCESS_TOKEN=your_access_token
MP_PUBLIC_KEY=your_public_key
MP_MARKETPLACE_ID=your_marketplace_id
MP_WEBHOOK_SECRET=your_webhook_secret
```

### **Webhook Events**
- `payment.created` - Pagamento criado
- `payment.updated` - Pagamento atualizado
- `payment.cancelled` - Pagamento cancelado

### **Split Configuration**
```typescript
const splitData = {
  marketplace: process.env.MP_MARKETPLACE_ID,
  marketplace_fee: platformFee,
  application_fee: '0',
  amount: personalAmount,
};
```

## Sistema de Disputas

### **Fluxo de Disputa**
1. **Personal reporta ausência** → Disputa criada
2. **Aluno recebe notificação** → Pode confirmar/negar
3. **Se aluno nega** → Custódia de 48h
4. **Ambos enviam evidências** → Status muda para análise
5. **Admin resolve** → Captura ou reembolso

### **Contadores de Disputas**
- **1ª ocorrência**: Alerta
- **2ª ocorrência em 90 dias**: Suspensão/ban
- **Contadores separados** para aluno e personal

### **Evidências Aceitas**
- Check-in/GPS no local
- Fotos com horário visível
- Mensagens no chat
- Selfies no ponto de encontro

## Validações

### **Criação de Pagamento**
- ✅ Aula deve existir e estar agendada
- ✅ Usuário deve ser o aluno da aula
- ✅ Valor deve ser positivo
- ✅ Não pode haver pagamento duplicado

### **Criação de Disputa**
- ✅ Pagamento deve existir
- ✅ Usuário deve ser aluno ou personal da aula
- ✅ Não pode haver disputa ativa
- ✅ Prazo de 48h para resolução

### **Submissão de Evidências**
- ✅ Disputa deve estar ativa
- ✅ Usuário deve ser parte da disputa
- ✅ Disputa não pode ter expirado
- ✅ Evidências devem ser descritas

## Testes

### **Cobertura de Testes**
- ✅ **Service**: 15+ testes unitários
- ✅ **Controller**: 10+ testes unitários
- ✅ **Validações**: Todos os cenários cobertos
- ✅ **Casos de erro**: Tratamento completo

### **Cenários Testados**
- Criação de preferências de pagamento
- Processamento de webhooks
- Criação e resolução de disputas
- Submissão de evidências
- Gestão de carteiras
- Estatísticas e relatórios

## Configurações

### **Variáveis de Ambiente**
```env
# Mercado Pago
MP_ACCESS_TOKEN=APP_USR_123456789
MP_PUBLIC_KEY=APP_USR_987654321
MP_MARKETPLACE_ID=marketplace_123
MP_WEBHOOK_SECRET=webhook_secret_123

# Configurações de pagamento
PLATFORM_FEE_PERCENTAGE=10
DISPUTE_EXPIRY_HOURS=48
EVIDENCE_DEADLINE_HOURS=24
```

### **Configurações do Banco**
- Tabelas com relacionamentos completos
- Índices para performance de consultas
- Constraints de integridade
- Triggers para atualizações automáticas

## Próximos Passos

### **Melhorias Planejadas**
- [ ] Integração real com API do Mercado Pago
- [ ] Sistema de notificações push
- [ ] Dashboard de analytics avançado
- [ ] Relatórios em PDF
- [ ] Integração com sistema de gamificação

### **Integrações Futuras**
- [ ] Sistema de gamificação (XP por pagamentos)
- [ ] Notificações por email/SMS
- [ ] Dashboard administrativo completo
- [ ] API para terceiros
- [ ] Sistema de auditoria

## Segurança

### **Medidas Implementadas**
- ✅ Validação de webhooks do Mercado Pago
- ✅ Verificação de permissões por usuário
- ✅ Criptografia de dados sensíveis
- ✅ Logs de auditoria
- ✅ Rate limiting em endpoints críticos

### **Boas Práticas**
- Nunca armazenar tokens de acesso
- Validar todos os webhooks
- Implementar retry para falhas
- Monitorar transações suspeitas
- Backup regular dos dados financeiros
