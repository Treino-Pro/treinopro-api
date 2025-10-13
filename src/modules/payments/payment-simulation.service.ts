import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface SimulatedPaymentData {
  amount: number;
  description: string;
  externalReference: string;
  payerEmail?: string;
  payerCpf?: string;
}

export interface SimulatedPaymentResult {
  success: boolean;
  paymentId: string;
  status: string;
  statusDetail: string;
  transactionAmount: number;
  message: string;
  isSimulated: boolean;
  createdAt: Date;
}

@Injectable()
export class PaymentSimulationService {
  private readonly logger = new Logger(PaymentSimulationService.name);

  /**
   * Simula um pagamento quando o Mercado Pago falha
   * Mantém toda a lógica de split funcionando
   */
  async simulatePayment(data: SimulatedPaymentData): Promise<SimulatedPaymentResult> {
    try {
      this.logger.log('🎭 [SIMULATION] ===== INICIANDO SIMULAÇÃO DE PAGAMENTO =====');
      this.logger.log('💰 [SIMULATION] Dados:', {
        amount: data.amount,
        description: data.description,
        externalReference: data.externalReference,
        payerEmail: data.payerEmail ? data.payerEmail.substring(0, 3) + '***' : 'N/A',
        payerCpf: data.payerCpf ? data.payerCpf.substring(0, 3) + '***' : 'N/A'
      });

      // Gerar ID único para o pagamento simulado
      const simulatedPaymentId = `sim_${randomUUID()}`;
      
      // Simular delay de processamento (como seria no MP)
      await this.simulateProcessingDelay();

      // Simular diferentes cenários baseados no valor
      const simulationResult = this.generateSimulationResult(data, simulatedPaymentId);

      this.logger.log('✅ [SIMULATION] Pagamento simulado criado:', {
        paymentId: simulationResult.paymentId,
        status: simulationResult.status,
        amount: simulationResult.transactionAmount,
        isSimulated: simulationResult.isSimulated
      });

      this.logger.log('🎭 [SIMULATION] ===== SIMULAÇÃO CONCLUÍDA COM SUCESSO =====');

      return simulationResult;

    } catch (error) {
      this.logger.error('❌ [SIMULATION] Erro na simulação:', error);
      throw error;
    }
  }

  /**
   * Gera resultado da simulação baseado nos dados
   */
  private generateSimulationResult(data: SimulatedPaymentData, paymentId: string): SimulatedPaymentResult {
    // Simular diferentes cenários para teste
    const scenarios = [
      {
        status: 'authorized',
        statusDetail: 'accredited',
        message: 'Pagamento simulado autorizado com sucesso (em custódia)',
        successRate: 0.85 // 85% de sucesso
      },
      {
        status: 'pending',
        statusDetail: 'pending_waiting_payment',
        message: 'Pagamento simulado pendente de confirmação',
        successRate: 0.10 // 10% pendente
      },
      {
        status: 'rejected',
        statusDetail: 'cc_rejected_insufficient_amount',
        message: 'Pagamento simulado rejeitado - saldo insuficiente',
        successRate: 0.05 // 5% rejeitado
      }
    ];

    // Escolher cenário baseado em probabilidade
    const random = Math.random();
    let cumulativeProbability = 0;
    let selectedScenario = scenarios[0]; // Default

    for (const scenario of scenarios) {
      cumulativeProbability += scenario.successRate;
      if (random <= cumulativeProbability) {
        selectedScenario = scenario;
        break;
      }
    }

    return {
      success: selectedScenario.status !== 'rejected',
      paymentId,
      status: selectedScenario.status,
      statusDetail: selectedScenario.statusDetail,
      transactionAmount: data.amount,
      message: selectedScenario.message,
      isSimulated: true,
      createdAt: new Date(),
    };
  }

  /**
   * Simula delay de processamento (1-3 segundos)
   */
  private async simulateProcessingDelay(): Promise<void> {
    const delay = Math.random() * 2000 + 1000; // 1-3 segundos
    this.logger.log(`⏱️ [SIMULATION] Simulando delay de processamento: ${delay.toFixed(0)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Verifica se deve usar simulação baseado no ambiente
   * IMPORTANTE: Simulação APENAS em ambiente de TESTE!
   */
  shouldUseSimulation(): boolean {
    const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
    const forceSimulation = process.env.FORCE_PAYMENT_SIMULATION === 'true';
    
    // ✅ SIMULAÇÃO APENAS EM TESTE:
    // 1. Forçar simulação via env (para testes específicos)
    // 2. Ambiente de teste com falhas do MP
    // ❌ PRODUÇÃO: NUNCA usar simulação!
    
    if (!isTestEnv) {
      this.logger.log('🏭 [SIMULATION] Ambiente de PRODUÇÃO - simulação DESABILITADA');
      return false;
    }
    
    this.logger.log('🧪 [SIMULATION] Ambiente de TESTE - simulação DISPONÍVEL');
    return forceSimulation || this.hasRecentMercadoPagoFailures();
  }

  /**
   * Verifica se houve falhas recentes do Mercado Pago
   * (implementação simples - pode ser melhorada com cache/banco)
   */
  private hasRecentMercadoPagoFailures(): boolean {
    // Por enquanto, sempre retorna true em teste para usar simulação
    // Em produção, isso poderia verificar logs ou cache de falhas recentes
    return true;
  }

  /**
   * Log de estatísticas da simulação
   */
  logSimulationStats(): void {
    this.logger.log('📊 [SIMULATION] Estatísticas do modo simulação:');
    this.logger.log('   - Modo: SIMULAÇÃO ATIVA');
    this.logger.log('   - Split: MANTIDO (90% personal, 10% plataforma)');
    this.logger.log('   - Fluxo: COMPLETO (proposta → pagamento → aula → repasse)');
    this.logger.log('   - Status: AUTORIZADO (em custódia até aula finalizada)');
  }
}
