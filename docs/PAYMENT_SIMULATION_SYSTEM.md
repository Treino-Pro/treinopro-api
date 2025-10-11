# 🎭 Sistema de Simulação de Pagamentos

## 📋 Visão Geral

**⚠️ IMPORTANTE: Simulação APENAS em ambiente de TESTE!**

Quando o Mercado Pago falha com `internal_error` ou outros erros 500 **em ambiente de teste**, o sistema automaticamente ativa um **modo de simulação** que mantém todo o fluxo funcionando normalmente.

**🏭 Em PRODUÇÃO: Se o MP falhar, o pagamento realmente falha!**

## 🔄 Como Funciona

### 1. **Detecção de Falha**
```typescript
// MercadoPagoService.createPayment()
try {
  response = await this.payment.create({ body: paymentRequest });
} catch (err) {
  if (err.message === 'internal_error' || err.status === 500) {
    // ✅ VERIFICAR AMBIENTE ANTES DE SIMULAR
    const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
    if (isTestEnv) {
      // 🧪 TESTE: Ativar simulação
      return await this.handlePaymentFailureWithSimulation(paymentData, err);
    } else {
      // 🏭 PRODUÇÃO: Falhar realmente
      throw err;
    }
  }
}
```

### 2. **Simulação Automática**
- ✅ **Status**: `authorized` (em custódia)
- ✅ **Valores**: Reais da aula/proposta
- ✅ **Split**: Mantido (90% personal, 10% plataforma)
- ✅ **Fluxo**: Completo (proposta → pagamento → aula → repasse)

### 3. **Cenários Simulados**
- **85%**: Pagamento autorizado com sucesso
- **10%**: Pagamento pendente
- **5%**: Pagamento rejeitado (para testes)

## ⚙️ Configuração

### Variáveis de Ambiente
```bash
# Forçar simulação sempre (para testes)
FORCE_PAYMENT_SIMULATION=true

# Ambiente de teste (ativa simulação automaticamente)
MP_ACCESS_TOKEN=TEST-...
```

### Controle Programático
```typescript
// PaymentSimulationService
shouldUseSimulation(): boolean {
  const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
  const forceSimulation = process.env.FORCE_PAYMENT_SIMULATION === 'true';
  
  // ✅ SIMULAÇÃO APENAS EM TESTE:
  // ❌ PRODUÇÃO: NUNCA usar simulação!
  
  if (!isTestEnv) {
    this.logger.log('🏭 [SIMULATION] Ambiente de PRODUÇÃO - simulação DESABILITADA');
    return false;
  }
  
  this.logger.log('🧪 [SIMULATION] Ambiente de TESTE - simulação DISPONÍVEL');
  return forceSimulation || this.hasRecentMercadoPagoFailures();
}
```

## 🏭 Comportamento em PRODUÇÃO

**❌ PRODUÇÃO: Simulação DESABILITADA**

```typescript
// Em produção (MP_ACCESS_TOKEN não começa com TEST-)
if (!isTestEnv) {
  this.logger.log('🏭 [SIMULATION] PRODUÇÃO - simulação BLOQUEADA');
  throw originalError; // Falha real do pagamento
}
```

### 🚨 **Se Mercado Pago falhar em produção:**
- ✅ Erro real é propagado
- ✅ Usuário vê erro de pagamento
- ✅ Proposta NÃO é criada
- ✅ Fluxo para até MP voltar

### 🔒 **Segurança em Produção:**
- ✅ Sem pagamentos falsos
- ✅ Sem dinheiro simulado
- ✅ Transparência total
- ✅ Auditoria real

## 🎯 Benefícios

### ✅ **Para o Usuário (TESTE)**
- Proposta sempre é criada
- Fluxo nunca quebra
- Experiência consistente

### ✅ **Para o Personal (TESTE)**
- Recebe pagamento normalmente
- Split aplicado corretamente
- Wallet atualizada

### ✅ **Para Desenvolvimento**
- Testes funcionam sempre
- Debug mais fácil
- Desenvolvimento independente do MP

## 📊 Logs de Simulação

```
🎭 [SIMULATION] ===== ATIVANDO MODO SIMULAÇÃO =====
❌ [SIMULATION] Erro original do MP: internal_error
📊 [SIMULATION] Estatísticas do modo simulação:
   - Modo: SIMULAÇÃO ATIVA
   - Split: MANTIDO (90% personal, 10% plataforma)
   - Fluxo: COMPLETO (proposta → pagamento → aula → repasse)
   - Status: AUTORIZADO (em custódia até aula finalizada)
✅ [SIMULATION] Pagamento simulado criado: sim_abc123
🎭 [SIMULATION] ===== SIMULAÇÃO CONCLUÍDA =====
```

## 🔧 Estrutura do Pagamento Simulado

```typescript
const simulatedResponse = {
  id: "sim_abc123-def456-ghi789",
  status: "authorized",
  status_detail: "accredited", 
  transaction_amount: 55.00,
  description: "Proposta de treino - Academia XYZ",
  external_reference: "proposal_123",
  date_created: "2025-10-11T14:44:05.000Z",
  payment_method_id: "visa",
  payment_type_id: "credit_card",
  installments: 1,
  // Metadados da simulação
  _simulated: true,
  _simulation_reason: "internal_error"
};
```

## 🚀 Fluxo Completo com Simulação

1. **Aluno cria proposta** → ✅ Sucesso
2. **Pagamento falha no MP** → 🎭 Simulação ativada
3. **Pagamento "autorizado"** → ✅ Status: `authorized`
4. **Personal aceita proposta** → ✅ Aula criada
5. **Personal finaliza aula** → ✅ Split aplicado
6. **Personal recebe pagamento** → ✅ Wallet atualizada

## 🎉 Resultado Final

**O usuário nunca percebe que houve falha no Mercado Pago!**

- ✅ Proposta criada
- ✅ Pagamento processado  
- ✅ Personal recebe dinheiro
- ✅ Split funcionando
- ✅ Fluxo completo mantido

---

## 🔍 Debugging

Para verificar se um pagamento foi simulado, procure nos logs:
- `🎭 [SIMULATION]` - Indica modo simulação
- `_simulated: true` - No objeto de resposta
- `sim_` - Prefixo no ID do pagamento
