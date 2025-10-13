import { Injectable, Logger } from '@nestjs/common';

export interface MercadoPagoError {
  code: string;
  message: string;
  status: number;
  details?: any;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

@Injectable()
export class ErrorHandlerService {
  private readonly logger = new Logger(ErrorHandlerService.name);

  // Configuração padrão de retry
  private readonly defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 segundo
    maxDelay: 30000, // 30 segundos
    backoffMultiplier: 2,
  };

  // ===== TRATAMENTO DE ERROS DO MERCADO PAGO =====

  handleMercadoPagoError(error: any): MercadoPagoError {
    this.logger.error('❌ [ERROR] Erro do Mercado Pago:', error);

    // Erro de rede/timeout
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return {
        code: 'NETWORK_ERROR',
        message: 'Erro de conexão com o Mercado Pago',
        status: 503,
        details: { originalError: error.message },
      };
    }

    // Erro de resposta HTTP
    if (error.response) {
      const { status, data } = error.response;
      
      return {
        code: this.mapMercadoPagoErrorCode(data),
        message: this.mapMercadoPagoErrorMessage(data),
        status,
        details: data,
      };
    }

    // Erro genérico
    return {
      code: 'UNKNOWN_ERROR',
      message: 'Erro desconhecido do Mercado Pago',
      status: 500,
      details: { originalError: error.message },
    };
  }

  private mapMercadoPagoErrorCode(data: any): string {
    if (!data || !data.cause) return 'UNKNOWN_ERROR';

    const errorMap: Record<string, string> = {
      'invalid_token': 'INVALID_TOKEN',
      'insufficient_amount': 'INSUFFICIENT_AMOUNT',
      'card_disabled': 'CARD_DISABLED',
      'invalid_card_number': 'INVALID_CARD',
      'invalid_expiration_date': 'INVALID_EXPIRATION',
      'invalid_security_code': 'INVALID_CVV',
      'invalid_cardholder_name': 'INVALID_CARDHOLDER',
      'duplicate_external_reference': 'DUPLICATE_REFERENCE',
      'invalid_payment_method': 'INVALID_PAYMENT_METHOD',
      'invalid_installments': 'INVALID_INSTALLMENTS',
      'invalid_payer': 'INVALID_PAYER',
      'invalid_customer': 'INVALID_CUSTOMER',
      'invalid_card_token': 'INVALID_CARD_TOKEN',
      'internal_error': 'INTERNAL_ERROR',
    };

    return errorMap[data.cause[0]?.code] || 'UNKNOWN_ERROR';
  }

  private mapMercadoPagoErrorMessage(data: any): string {
    if (!data || !data.cause) return 'Erro desconhecido';

    const messageMap: Record<string, string> = {
      'invalid_token': 'Token do cartão inválido ou expirado',
      'insufficient_amount': 'Valor insuficiente para o pagamento',
      'card_disabled': 'Cartão desabilitado pelo banco',
      'invalid_card_number': 'Número do cartão inválido',
      'invalid_expiration_date': 'Data de expiração inválida',
      'invalid_security_code': 'Código de segurança inválido',
      'invalid_cardholder_name': 'Nome do portador inválido',
      'duplicate_external_reference': 'Referência externa duplicada',
      'invalid_payment_method': 'Método de pagamento inválido',
      'invalid_installments': 'Número de parcelas inválido',
      'invalid_payer': 'Dados do pagador inválidos',
      'invalid_customer': 'Customer inválido',
      'invalid_card_token': 'Token do cartão inválido',
      'internal_error': 'Erro interno do Mercado Pago',
    };

    const errorCode = data.cause[0]?.code;
    return messageMap[errorCode] || data.message || 'Erro desconhecido';
  }

  // ===== RETRY MECHANISM =====

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const retryConfig = { ...this.defaultRetryConfig, ...config };
    let lastError: any;

    for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        this.logger.log(`🔄 [RETRY] Tentativa ${attempt}/${retryConfig.maxRetries}`);
        
        const result = await operation();
        
        if (attempt > 1) {
          this.logger.log(`✅ [RETRY] Sucesso na tentativa ${attempt}`);
        }
        
        return result;

      } catch (error) {
        lastError = error;
        
        // Verificar se o erro é retryable
        if (!this.isRetryableError(error) || attempt === retryConfig.maxRetries) {
          this.logger.error(`❌ [RETRY] Falha definitiva na tentativa ${attempt}:`, error);
          break;
        }

        // Calcular delay com backoff exponencial
        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelay,
        );

        this.logger.warn(`⚠️ [RETRY] Falha na tentativa ${attempt}, tentando novamente em ${delay}ms`);
        
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    // Erros de rede são retryable
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Erros HTTP 5xx são retryable
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Erros específicos do Mercado Pago que são retryable
    if (error.response && error.response.data) {
      const errorCode = error.response.data.cause?.[0]?.code;
      const retryableErrors = ['internal_error', 'timeout', 'service_unavailable'];
      return retryableErrors.includes(errorCode);
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===== FALLBACK MECHANISMS =====

  async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    fallbackCondition?: (error: any) => boolean,
  ): Promise<T> {
    try {
      return await primaryOperation();
    } catch (error) {
      this.logger.warn('⚠️ [FALLBACK] Operação primária falhou, tentando fallback:', error);

      // Verificar se deve usar fallback
      if (fallbackCondition && !fallbackCondition(error)) {
        throw error;
      }

      try {
        return await fallbackOperation();
      } catch (fallbackError) {
        this.logger.error('❌ [FALLBACK] Fallback também falhou:', fallbackError);
        throw error; // Lançar erro original
      }
    }
  }

  // ===== CIRCUIT BREAKER =====

  private circuitBreakerState: Map<string, {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  }> = new Map();

  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceName: string,
    failureThreshold: number = 5,
    timeout: number = 60000, // 1 minuto
  ): Promise<T> {
    const state = this.circuitBreakerState.get(serviceName) || {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED' as const,
    };

    // Verificar se o circuit breaker está aberto
    if (state.state === 'OPEN') {
      if (Date.now() - state.lastFailureTime > timeout) {
        // Tentar meio-abrir
        state.state = 'HALF_OPEN';
        this.logger.log(`🔄 [CIRCUIT] Circuit breaker meio-aberto para ${serviceName}`);
      } else {
        throw new Error(`Circuit breaker aberto para ${serviceName}`);
      }
    }

    try {
      const result = await operation();
      
      // Sucesso - resetar circuit breaker
      if (state.state === 'HALF_OPEN') {
        state.state = 'CLOSED';
        state.failures = 0;
        this.logger.log(`✅ [CIRCUIT] Circuit breaker fechado para ${serviceName}`);
      }
      
      return result;

    } catch (error) {
      state.failures++;
      state.lastFailureTime = Date.now();

      if (state.failures >= failureThreshold) {
        state.state = 'OPEN';
        this.logger.error(`❌ [CIRCUIT] Circuit breaker aberto para ${serviceName} após ${state.failures} falhas`);
      }

      this.circuitBreakerState.set(serviceName, state);
      throw error;
    }
  }

  // ===== LOGGING E MONITORAMENTO =====

  logError(context: string, error: any, metadata?: any): void {
    this.logger.error(`❌ [${context}] Erro:`, {
      message: error.message,
      stack: error.stack,
      metadata,
    });
  }

  logWarning(context: string, message: string, metadata?: any): void {
    this.logger.warn(`⚠️ [${context}] ${message}`, metadata);
  }

  logInfo(context: string, message: string, metadata?: any): void {
    this.logger.log(`ℹ️ [${context}] ${message}`, metadata);
  }

  // ===== HEALTH CHECK =====

  getErrorStats(): {
    totalErrors: number;
    retryableErrors: number;
    circuitBreakerStates: Record<string, string>;
  } {
    const circuitBreakerStates: Record<string, string> = {};
    
    for (const [service, state] of this.circuitBreakerState) {
      circuitBreakerStates[service] = state.state;
    }

    return {
      totalErrors: 0, // Implementar contador
      retryableErrors: 0, // Implementar contador
      circuitBreakerStates,
    };
  }
}
