import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment, PaymentRefund, CardToken, Customer } from 'mercadopago';
import { ErrorHandlerService } from './error-handler.service';
import { PaymentSimulationService } from './payment-simulation.service';
import fetch from 'node-fetch';

export interface CreatePreferenceData {
  classId: string;
  title: string;
  totalAmount: number;
  platformFee: number;
  personalAmount: number;
  studentEmail: string;
  personalEmail: string;
  externalReference: string;
}

export interface MPPreferenceResponse {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
}

export interface CapturePaymentData {
  paymentId: string;
  amount: number;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private client: MercadoPagoConfig;
  private preference: Preference;
  private payment: Payment;
  private paymentRefund: PaymentRefund;
  private cardToken: CardToken;
  private customer: Customer;

  constructor(
    private readonly errorHandler: ErrorHandlerService,
    private readonly paymentSimulation: PaymentSimulationService,
  ) {
    // Configurar cliente do Mercado Pago
    const accessToken = process.env.MP_ACCESS_TOKEN || '';
    const isTestMode = accessToken.startsWith('TEST-');
    
    this.client = new MercadoPagoConfig({
      accessToken,
      options: {
        timeout: 5000,
      },
    });

    this.preference = new Preference(this.client);
    this.payment = new Payment(this.client);
    this.paymentRefund = new PaymentRefund(this.client);
    this.cardToken = new CardToken(this.client);
    this.customer = new Customer(this.client);

    this.logger.log(`MercadoPago Service inicializado - Modo: ${isTestMode ? 'TESTE' : 'PRODUÇÃO'}`);
  }

  // Criar preferência de pagamento com split
  async createPreference(data: CreatePreferenceData): Promise<MPPreferenceResponse> {
    try {
      const platformFeePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10');
      
      // Configurar preferência com split
      const preferenceData = {
        items: [
          {
            id: data.classId,
            title: data.title,
            description: `Aula de Personal Training - ${data.title}`,
            quantity: 1,
            unit_price: data.totalAmount,
            currency_id: 'BRL',
          },
        ],
        
        // Configurar split (marketplace)
        marketplace_fee: data.platformFee,
        
        // Dados do pagador (aluno)
        payer: {
          email: data.studentEmail,
        },
        
        // URLs de retorno (obrigatórias para auto_return)
        back_urls: {
          success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
          failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failure`,
          pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/pending`,
        },
        
        // URL de notificação (webhook)
        notification_url: `${process.env.API_URL || 'http://localhost:3000'}/payments/webhook`,
        
        // Referência externa
        external_reference: data.externalReference,
        
        // Configurações de pagamento
        payment_methods: {
          excluded_payment_types: [],
          excluded_payment_methods: [],
          installments: 12, // Até 12x
        },
        
        // Configurações adicionais
        binary_mode: false, // Permite pagamentos pendentes
        
        // Metadados
        metadata: {
          class_id: data.classId,
          platform_fee: data.platformFee,
          personal_amount: data.personalAmount,
          personal_email: data.personalEmail,
        },
        
        // Configurações de expiração
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      };

      this.logger.log(`Criando preferência MP para aula ${data.classId}`);
      this.logger.debug('Dados da preferência:', preferenceData);

      const response = await this.preference.create({
        body: preferenceData,
      });

      if (!response.id) {
        throw new BadRequestException('Erro ao criar preferência no Mercado Pago');
      }

      this.logger.log(`Preferência criada com sucesso: ${response.id}`);

      const isTestMode = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
      const initPoint = isTestMode 
        ? (response.sandbox_init_point || response.init_point || '')
        : (response.init_point || '');

      return {
        id: response.id,
        initPoint,
        sandboxInitPoint: response.sandbox_init_point || '',
      };
    } catch (error) {
      this.logger.error('Erro ao criar preferência MP:', error);
      throw new BadRequestException(`Erro ao criar pagamento: ${error.message}`);
    }
  }

  // Buscar informações de um pagamento
  async getPayment(paymentId: string): Promise<any> {
    try {
      this.logger.log(`Buscando pagamento MP: ${paymentId}`);
      
      const response = await this.payment.get({
        id: paymentId,
      });

      this.logger.log(`Pagamento encontrado: ${response.id} - Status: ${response.status}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Erro ao buscar pagamento ${paymentId}:`, error);
      throw new BadRequestException(`Erro ao buscar pagamento: ${error.message}`);
    }
  }

  // Capturar pagamento (aplicar split)
  async capturePayment(paymentId: string): Promise<any> {
    try {
      this.logger.log(`Capturando pagamento MP: ${paymentId}`);
      
      // No Mercado Pago, a captura acontece automaticamente quando o status muda para 'approved'
      // Mas podemos forçar a captura se necessário
      const response = await this.payment.capture({
        id: paymentId,
      });

      this.logger.log(`Pagamento capturado com sucesso: ${paymentId}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Erro ao capturar pagamento ${paymentId}:`, error);
      throw new BadRequestException(`Erro ao capturar pagamento: ${error.message}`);
    }
  }

  // Reembolsar pagamento
  async refundPayment(paymentId: string, amount?: number): Promise<any> {
    try {
      this.logger.log(`Reembolsando pagamento MP: ${paymentId}`);
      
      const refundData: any = {};

      // Se valor específico for informado
      if (amount) {
        refundData.amount = amount;
      }

      const response = await this.paymentRefund.create({
        payment_id: paymentId,
        body: refundData,
      });

      this.logger.log(`Reembolso processado com sucesso: ${paymentId}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Erro ao reembolsar pagamento ${paymentId}:`, error);
      throw new BadRequestException(`Erro ao reembolsar pagamento: ${error.message}`);
    }
  }

  // Cancelar pagamento
  async cancelPayment(paymentId: string): Promise<any> {
    try {
      this.logger.log(`Cancelando pagamento MP: ${paymentId}`);
      
      const response = await this.payment.cancel({
        id: paymentId,
      });

      this.logger.log(`Pagamento cancelado com sucesso: ${paymentId}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Erro ao cancelar pagamento ${paymentId}:`, error);
      throw new BadRequestException(`Erro ao cancelar pagamento: ${error.message}`);
    }
  }

  // Validar webhook do Mercado Pago
  validateWebhook(body: any, headers: any): boolean {
    try {
      // Validar assinatura do webhook (se configurada)
      const signature = headers['x-signature'];
      const requestId = headers['x-request-id'];
      
      if (!signature || !requestId) {
        this.logger.warn('Webhook sem assinatura ou request ID');
        return false;
      }

      // Aqui você pode implementar validação de assinatura se necessário
      // Por enquanto, vamos aceitar todos os webhooks
      
      this.logger.log(`Webhook validado: ${requestId}`);
      return true;
    } catch (error) {
      this.logger.error('Erro ao validar webhook:', error);
      return false;
    }
  }

  // Mapear status do MP para status interno
  mapPaymentStatus(mpStatus: string, mpStatusDetail?: string): string {
    switch (mpStatus) {
      case 'pending':
        return 'authorized'; // Em custódia
      case 'approved':
        return 'captured'; // Capturado (split aplicado)
      case 'authorized':
        return 'authorized'; // Autorizado
      case 'in_process':
        return 'pending'; // Processando
      case 'in_mediation':
        return 'disputed'; // Em disputa
      case 'rejected':
        return 'cancelled'; // Rejeitado
      case 'cancelled':
        return 'cancelled'; // Cancelado
      case 'refunded':
        return 'refunded'; // Reembolsado
      case 'charged_back':
        return 'refunded'; // Estornado
      default:
        this.logger.warn(`Status MP desconhecido: ${mpStatus}`);
        return 'pending';
    }
  }

  // Verificar se configuração está válida
  isConfigured(): boolean {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    const publicKey = process.env.MP_PUBLIC_KEY;
    
    if (!accessToken || !publicKey) {
      this.logger.error('Configuração do Mercado Pago incompleta');
      return false;
    }

    return true;
  }

  // Criar pagamento direto (autorização/captura)
  async createPayment(paymentData: {
    token: string; // Token fresco gerado
    amount: number;
    description: string;
    externalReference: string;
    capture?: boolean;
    payerEmail?: string;
    payerIdentification?: { type: string; number: string };
    payerId?: string; // Customer ID do MP
    paymentMethodId?: string; // Bandeira opcional (ex.: 'visa', 'master')
  }): Promise<any> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      const isTest = accessToken.startsWith('TEST-');
      this.logger.log(`Criando pagamento MP: ${paymentData.externalReference} | Env: ${isTest ? 'TEST' : 'PROD'}`);
      
      // Validar token
      if (!paymentData.token || paymentData.token.length < 10) {
        throw new BadRequestException('Token do cartão inválido ou muito curto');
      }
      
      // Validar valor mínimo
      if (paymentData.amount < 0.01) {
        throw new BadRequestException('Valor mínimo para pagamento é R$ 0,01');
      }

      const paymentRequest: any = {
        transaction_amount: paymentData.amount,
        token: paymentData.token, // ✅ Token fresco gerado
        description: paymentData.description,
        installments: 1,
        external_reference: paymentData.externalReference,
        capture: paymentData.capture ?? false,
      };

      // Definir payment_method_id se informado (ajuda o MP a inferir corretamente em sandbox)
      if (paymentData.paymentMethodId) {
        paymentRequest.payment_method_id = paymentData.paymentMethodId;
      }

      // Enviar additional_info básico (alguns cenários de sandbox exigem)
      paymentRequest.additional_info = {
        items: [
          {
            id: paymentData.externalReference,
            title: (paymentData.description || 'Treino').slice(0, 60),
            quantity: 1,
            unit_price: paymentData.amount,
          },
        ],
      };

      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');

      // Em TEST, usar email/identificação reais enviados pelo app (sem hardcode)
      if (isTestEnv) {
        if (!paymentData.payerEmail) {
          throw new BadRequestException('payerEmail é obrigatório em ambiente de teste');
        }
        paymentRequest.payer = {
          email: paymentData.payerEmail,
          ...(paymentData.payerIdentification ? { identification: paymentData.payerIdentification } : {}),
        };
        this.logger.log('🔍 [MP] Sandbox: usando payer com email do aluno');
      } else if (!paymentData.payerId) {
        // Produção sem customer_id: usar dados do pagador sem type/id
        if (!paymentData.payerEmail || !paymentData.payerIdentification) {
          throw new BadRequestException('payerEmail e payerIdentification são obrigatórios quando não há customer_id');
        }
        paymentRequest.payer = {
          email: paymentData.payerEmail,
          identification: paymentData.payerIdentification,
        };
      } else {
        // Produção com customer_id
        paymentRequest.payer = {
          type: 'customer',
          id: paymentData.payerId,
        };
        this.logger.log(`🔍 [MP] Produção: usando customer_id: ${paymentData.payerId}`);
      }

      // Log detalhado do payload
      this.logger.log(`🔍 [MP DEBUG] Payload completo:`, JSON.stringify(paymentRequest, null, 2));
      this.logger.log(`🔍 [MP DEBUG] Headers esperados: { Authorization: 'Bearer ${isTest ? 'TEST-***' : 'PROD-***'}', Content-Type: 'application/json' }`);
      this.logger.log(`🔍 [MP DEBUG] Dados de entrada:`, {
        token: paymentData.token?.substring(0, 20) + '...',
        amount: paymentData.amount,
        description: paymentData.description,
        externalReference: paymentData.externalReference,
        capture: paymentData.capture
      });

      let response;
      try {
        response = await this.payment.create({ 
        body: paymentRequest,
          requestOptions: {
            idempotencyKey: `pay_${paymentData.externalReference}`,
          }
        });
      } catch (err) {
        // Fallback: alguns ambientes de teste falham com capture=false sem motivo claro
        if ((err?.message === 'internal_error' || err?.status === 500) && paymentRequest.capture === false) {
          this.logger.warn('⚠️ [MP FALLBACK] internal_error com capture=false. Tentando capture=true...');
          const retryRequest = { ...paymentRequest, capture: true };
          this.logger.log('🔁 [MP FALLBACK] Payload retry:', JSON.stringify(retryRequest, null, 2));
          
          try {
            response = await this.payment.create({ 
              body: retryRequest,
              requestOptions: {
                idempotencyKey: `pay_${paymentData.externalReference}_retry`,
              }
            });
          } catch (retryErr) {
            // Se ainda falhar, usar simulação
            this.logger.error('❌ [MP FALLBACK] Retry também falhou, ativando simulação:', retryErr.message);
            return await this.handlePaymentFailureWithSimulation(paymentData, err);
          }
        } else {
          // Qualquer outro erro também pode usar simulação
          this.logger.error('❌ [MP ERROR] Erro do Mercado Pago, verificando se deve usar simulação:', err.message);
          return await this.handlePaymentFailureWithSimulation(paymentData, err);
        }
      }

      this.logger.log(`Pagamento criado com sucesso: ${response.id}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Erro ao criar pagamento:`, error);
      
      // Log detalhado do erro para debug
      if (error.response) {
        this.logger.error(`🔍 [MP ERROR] Response status: ${error.response.status}`);
        this.logger.error(`🔍 [MP ERROR] Response data:`, error.response.data);
        this.logger.error(`🔍 [MP ERROR] Response headers:`, error.response.headers);
      }
      
      // Tratar diferentes tipos de erro do MP
      let errorMessage = 'Erro interno do Mercado Pago';
      
      if (error.message === 'internal_error') {
        errorMessage = 'Erro interno do Mercado Pago. Verifique os dados do cartão e tente novamente.';
      } else if (error.message === 'invalid_token') {
        errorMessage = 'Token do cartão inválido ou expirado.';
      } else if (error.message === 'insufficient_amount') {
        errorMessage = 'Valor insuficiente para processar o pagamento.';
      } else if (error.message === 'card_disabled') {
        errorMessage = 'Cartão desabilitado para este tipo de transação.';
      } else if (error.message) {
        errorMessage = `Erro do Mercado Pago: ${error.message}`;
      }
      
      throw new BadRequestException(errorMessage);
    }
  }

  /**
   * Lida com falha do Mercado Pago usando simulação
   * IMPORTANTE: Simulação APENAS em ambiente de TESTE!
   */
  private async handlePaymentFailureWithSimulation(paymentData: any, originalError: any): Promise<any> {
    try {
      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
      
      this.logger.log('🎭 [SIMULATION] ===== VERIFICANDO MODO SIMULAÇÃO =====');
      this.logger.log('❌ [SIMULATION] Erro original do MP:', originalError.message);
      this.logger.log('🔍 [SIMULATION] Ambiente atual:', isTestEnv ? 'TESTE' : 'PRODUÇÃO');
      
      // ✅ VERIFICAÇÃO CRÍTICA: Simulação APENAS em TESTE!
      if (!isTestEnv) {
        this.logger.log('🏭 [SIMULATION] PRODUÇÃO - simulação BLOQUEADA, propagando erro');
        throw originalError;
      }
      
      // Verificar se deve usar simulação (apenas em teste)
      if (!this.paymentSimulation.shouldUseSimulation()) {
        this.logger.log('❌ [SIMULATION] Simulação desabilitada em teste, propagando erro original');
        throw originalError;
      }
      
      this.logger.log('🎭 [SIMULATION] ===== ATIVANDO MODO SIMULAÇÃO (TESTE) =====');

      // Log das estatísticas
      this.paymentSimulation.logSimulationStats();

      // Simular pagamento
      const simulationResult = await this.paymentSimulation.simulatePayment({
        amount: paymentData.amount,
        description: paymentData.description,
        externalReference: paymentData.externalReference,
        payerEmail: paymentData.payerEmail,
        payerCpf: paymentData.payerIdentification?.number,
      });

      // Converter resultado da simulação para formato do MP
      const simulatedResponse = {
        id: simulationResult.paymentId,
        status: simulationResult.status,
        status_detail: simulationResult.statusDetail,
        transaction_amount: simulationResult.transactionAmount,
        description: paymentData.description,
        external_reference: paymentData.externalReference,
        date_created: simulationResult.createdAt.toISOString(),
        date_last_updated: simulationResult.createdAt.toISOString(),
        // Campos adicionais para compatibilidade
        payment_method_id: paymentData.paymentMethodId || 'visa',
        payment_type_id: 'credit_card',
        installments: 1,
        // Metadados da simulação
        _simulated: true,
        _simulation_reason: originalError.message,
      };

      this.logger.log('✅ [SIMULATION] Pagamento simulado criado:', {
        id: simulatedResponse.id,
        status: simulatedResponse.status,
        amount: simulatedResponse.transaction_amount,
        simulated: simulatedResponse._simulated
      });

      this.logger.log('🎭 [SIMULATION] ===== SIMULAÇÃO CONCLUÍDA =====');

      return simulatedResponse;

    } catch (simulationError) {
      this.logger.error('❌ [SIMULATION] Erro na simulação:', simulationError);
      // Se a simulação falhar, propagar o erro original
      throw originalError;
    }
  }


  // Criar token de cartão no Mercado Pago
  async createCardToken(cardData: {
    cardNumber: string;
    expirationMonth: string;
    expirationYear: string;
    securityCode: string;
    cardholderName: string;
  }): Promise<string> {
    try {
      this.logger.log(`Criando token de cartão para: ${cardData.cardholderName}`);
      
      const cardTokenRequest = {
        card_number: cardData.cardNumber.replace(/\s/g, ''), // Remove espaços
        expiration_month: cardData.expirationMonth,
        expiration_year: cardData.expirationYear,
        security_code: cardData.securityCode,
        cardholder: {
          name: cardData.cardholderName,
        },
      };

      this.logger.log(`🔍 [MP CARD TOKEN] Payload:`, {
        card_number_masked: cardData.cardNumber.replace(/\d(?=\d{4})/g, "*"), // Mascarar número para log
        card_number_length: cardData.cardNumber.length,
        card_number_clean: cardData.cardNumber.replace(/\s/g, ''), // Número sem espaços
        card_number_sent_to_mp: cardTokenRequest.card_number, // Número real enviado para MP
        expiration_month: cardTokenRequest.expiration_month,
        expiration_year: cardTokenRequest.expiration_year,
        security_code: "***",
        cardholder_name: cardData.cardholderName,
      });

      const response = await this.cardToken.create({
        body: cardTokenRequest,
      });

      this.logger.log(`Token de cartão criado com sucesso: ${response.id}`);
      
      return response.id;
    } catch (error) {
      this.logger.error(`Erro ao criar token de cartão:`, error);
      throw new BadRequestException(`Erro ao processar cartão: ${error.message}`);
    }
  }

  // Obter configuração atual
  getConfig(): any {
    return {
      hasAccessToken: !!process.env.MP_ACCESS_TOKEN,
      hasPublicKey: !!process.env.MP_PUBLIC_KEY,
      platformFeePercentage: process.env.PLATFORM_FEE_PERCENTAGE || '10',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  // ===== TRANSFERÊNCIA REAL PARA PERSONAL =====

  // Transferir dinheiro real para conta do personal
  async transferToPersonal(transferData: {
    personalId: string;
    amount: number;
    description: string;
    transferMethod: 'pix' | 'bank_transfer' | 'mercadopago_balance';
    personalData: {
      pixKey?: string;
      bankAccount?: {
        bank: string;
        agency: string;
        account: string;
        accountType: string;
      };
      mpAccountId?: string;
    };
  }): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
    mpResponse?: any;
  }> {
    try {
      this.logger.log(`💸 [TRANSFER] Iniciando transferência para personal ${transferData.personalId}: R$ ${transferData.amount}`);

      // Validar dados de transferência
      if (transferData.amount <= 0) {
        throw new Error('Valor da transferência deve ser maior que zero');
      }

      // Preparar dados da transferência baseado no método
      let transferRequest: any = {
        transaction_amount: transferData.amount,
        description: transferData.description,
        external_reference: `transfer_${transferData.personalId}_${Date.now()}`,
      };

      // Configurar dados específicos do método de transferência
      switch (transferData.transferMethod) {
        case 'pix':
          if (!transferData.personalData.pixKey) {
            throw new Error('Chave PIX é obrigatória para transferência PIX');
          }
          transferRequest.payment_method_id = 'pix';
          transferRequest.payer = {
            email: transferData.personalData.pixKey, // PIX key como email temporário
          };
          break;

        case 'bank_transfer':
          if (!transferData.personalData.bankAccount) {
            throw new Error('Dados bancários são obrigatórios para transferência bancária');
          }
          transferRequest.payment_method_id = 'bank_transfer';
          transferRequest.payer = {
            email: 'transfer@treinopro.com', // Email temporário
          };
          break;

        case 'mercadopago_balance':
          if (!transferData.personalData.mpAccountId) {
            throw new Error('ID da conta Mercado Pago é obrigatório');
          }
          transferRequest.payment_method_id = 'mercadopago_balance';
          transferRequest.payer = {
            email: transferData.personalData.mpAccountId,
          };
          break;

        default:
          throw new Error('Método de transferência inválido');
      }

      // Fazer transferência via API do Mercado Pago
      const response = await this.payment.create({
        body: transferRequest,
      });

      this.logger.log(`✅ [TRANSFER] Transferência criada com sucesso: ${response.id}`);

      return {
        success: true,
        transferId: String(response.id),
        mpResponse: response,
      };

    } catch (error) {
      this.logger.error(`❌ [TRANSFER] Erro na transferência:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Verificar status da transferência
  async getTransferStatus(transferId: string): Promise<{
    status: string;
    amount: number;
    description: string;
    createdAt: string;
    updatedAt: string;
  }> {
    try {
      const response = await this.payment.get({ id: transferId });
      
      return {
        status: response.status,
        amount: typeof response.transaction_amount === 'string' ? parseFloat(response.transaction_amount) : response.transaction_amount,
        description: response.description,
        createdAt: response.date_created,
        updatedAt: response.date_last_updated,
      };
    } catch (error) {
      this.logger.error(`❌ [TRANSFER] Erro ao verificar status da transferência ${transferId}:`, error);
      throw new Error(`Erro ao verificar status da transferência: ${error.message}`);
    }
  }

  // Validar dados de transferência antes de processar
  async validateTransferData(transferData: {
    personalId: string;
    amount: number;
    transferMethod: 'pix' | 'bank_transfer' | 'mercadopago_balance';
    personalData: any;
  }): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Validar valor
    if (transferData.amount <= 0) {
      errors.push('Valor deve ser maior que zero');
    }

    if (transferData.amount < 1) {
      errors.push('Valor mínimo para transferência é R$ 1,00');
    }

    if (transferData.amount > 10000) {
      errors.push('Valor máximo para transferência é R$ 10.000,00');
    }

    // Validar dados específicos do método
    switch (transferData.transferMethod) {
      case 'pix':
        if (!transferData.personalData.pixKey) {
          errors.push('Chave PIX é obrigatória');
        }
        break;

      case 'bank_transfer':
        if (!transferData.personalData.bankAccount) {
          errors.push('Dados bancários são obrigatórios');
        } else {
          const { bank, agency, account } = transferData.personalData.bankAccount;
          if (!bank || !agency || !account) {
            errors.push('Dados bancários incompletos');
          }
        }
        break;

      case 'mercadopago_balance':
        if (!transferData.personalData.mpAccountId) {
          errors.push('ID da conta Mercado Pago é obrigatório');
        }
        break;

      default:
        errors.push('Método de transferência inválido');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Criar ou buscar customer no Mercado Pago
  async createOrGetCustomer(userId: string, customerData: {
    email: string;
    firstName: string;
    lastName: string;
    identification: { type: string; number: string };
  }): Promise<{ id: string }> {
    try {
      console.log('👤 [MP CUSTOMER] Criando/buscando customer...');
      console.log('🔍 [MP CUSTOMER] Dados:', {
        userId,
        email: customerData.email,
        firstName: customerData.firstName,
        lastName: customerData.lastName
      });

      // Primeiro, tentar buscar customer existente pelo email
      const searchUrl = `https://api.mercadopago.com/v1/customers/search?email=${encodeURIComponent(customerData.email)}`;
      
      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.results && searchData.results.length > 0) {
          const existingCustomer = searchData.results[0];
          console.log('✅ [MP CUSTOMER] Customer encontrado:', existingCustomer.id);
          return { id: existingCustomer.id };
        }
      }

      // Se não encontrou, criar novo customer
      console.log('🆕 [MP CUSTOMER] Criando novo customer...');
      
      const customerPayload = {
        email: customerData.email,
        first_name: customerData.firstName,
        last_name: customerData.lastName,
        identification: customerData.identification,
        description: `Customer TreinoPro - ${userId}`,
      };

      const newCustomer = await this.customer.create({
        body: customerPayload,
      });
      console.log('✅ [MP CUSTOMER] Customer criado:', newCustomer.id);
      
      return { id: newCustomer.id };
    } catch (error) {
      console.error('❌ [MP CUSTOMER] Erro:', error);
      throw new BadRequestException('Erro ao gerenciar customer');
    }
  }

  // Salvar cartão no customer
  async saveCardToCustomer(customerId: string, cardData: {
    token: string;
    cardholderName: string;
    identificationType: string;
    identificationNumber: string;
  }): Promise<{ id: string }> {
    try {
      console.log('💳 [MP CARD] Salvando cartão no customer...');
      console.log('🔍 [MP CARD] Customer ID:', customerId);
      console.log('🔍 [MP CARD] Token length:', cardData.token.length);

      const cardPayload = {
        token: cardData.token,
        customer_id: customerId,
        issuer_id: null, // Deixar MP detectar automaticamente
      };

      const response = await fetch(`https://api.mercadopago.com/v1/customers/${customerId}/cards`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cardPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ [MP CARD] Erro ao salvar cartão:', errorData);
        throw new BadRequestException('Erro ao salvar cartão no Mercado Pago');
      }

      const savedCard = await response.json();
      console.log('✅ [MP CARD] Cartão salvo:', savedCard.id);
      
      return { id: savedCard.id };
    } catch (error) {
      console.error('❌ [MP CARD] Erro:', error);
      throw new BadRequestException('Erro ao salvar cartão');
    }
  }

  // Listar cartões do customer
  async getCustomerCards(customerId: string): Promise<any[]> {
    try {
      console.log('📋 [MP CARD] Listando cartões do customer:', customerId);

      const response = await fetch(`https://api.mercadopago.com/v1/customers/${customerId}/cards`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ [MP CARD] Erro ao listar cartões:', errorData);
        throw new BadRequestException('Erro ao listar cartões do customer');
      }

      const cards = await response.json();
      console.log('✅ [MP CARD] Cartões encontrados:', cards.length);
      
      return cards;
    } catch (error) {
      console.error('❌ [MP CARD] Erro:', error);
      throw new BadRequestException('Erro ao listar cartões');
    }
  }

  // Consultar cartão específico
  async getCustomerCard(customerId: string, cardId: string): Promise<any> {
    try {
      console.log('🔍 [MP CARD] Consultando cartão:', { customerId, cardId });

      const response = await fetch(`https://api.mercadopago.com/v1/customers/${customerId}/cards/${cardId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ [MP CARD] Erro ao consultar cartão:', errorData);
        throw new BadRequestException('Erro ao consultar cartão');
      }

      const card = await response.json();
      console.log('✅ [MP CARD] Cartão encontrado:', card.id);
      
      return card;
    } catch (error) {
      console.error('❌ [MP CARD] Erro:', error);
      throw new BadRequestException('Erro ao consultar cartão');
    }
  }

  // Atualizar cartão
  async updateCustomerCard(customerId: string, cardId: string, updateData: {
    cardholderName?: string;
    expirationMonth?: string;
    expirationYear?: string;
  }): Promise<any> {
    try {
      console.log('✏️ [MP CARD] Atualizando cartão:', { customerId, cardId });

      const response = await fetch(`https://api.mercadopago.com/v1/customers/${customerId}/cards/${cardId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ [MP CARD] Erro ao atualizar cartão:', errorData);
        throw new BadRequestException('Erro ao atualizar cartão');
      }

      const updatedCard = await response.json();
      console.log('✅ [MP CARD] Cartão atualizado:', updatedCard.id);
      
      return updatedCard;
    } catch (error) {
      console.error('❌ [MP CARD] Erro:', error);
      throw new BadRequestException('Erro ao atualizar cartão');
    }
  }

  // Remover cartão
  async deleteCustomerCard(customerId: string, cardId: string): Promise<boolean> {
    try {
      console.log('🗑️ [MP CARD] Removendo cartão:', { customerId, cardId });

      const response = await fetch(`https://api.mercadopago.com/v1/customers/${customerId}/cards/${cardId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ [MP CARD] Erro ao remover cartão:', errorData);
        throw new BadRequestException('Erro ao remover cartão');
      }

      console.log('✅ [MP CARD] Cartão removido com sucesso');
      return true;
    } catch (error) {
      console.error('❌ [MP CARD] Erro:', error);
      throw new BadRequestException('Erro ao remover cartão');
    }
  }

  // ===== MÉTODOS DE REFUND =====

  async createRefund(paymentId: string, refundData: {
    amount?: number;
    reason?: string;
  }): Promise<any> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(`💰 [MP REFUND] Criando reembolso para pagamento: ${paymentId}`);

      const refundRequest = {
        amount: refundData.amount,
        reason: refundData.reason || 'Solicitação do cliente',
      };

      this.logger.log(`🔍 [MP REFUND] Payload:`, JSON.stringify(refundRequest, null, 2));

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(refundRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`❌ [MP REFUND] Erro ao criar reembolso:`, errorData);
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const refundResult = await response.json();
      this.logger.log(`✅ [MP REFUND] Reembolso criado: ${refundResult.id}`);

      return refundResult;
    } catch (error) {
      this.logger.error(`❌ [MP REFUND] Erro ao criar reembolso:`, error);
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }

  async getPaymentRefunds(paymentId: string): Promise<any[]> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(`📋 [MP REFUND] Buscando reembolsos do pagamento: ${paymentId}`);

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`❌ [MP REFUND] Erro ao buscar reembolsos:`, errorData);
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const refundsResult = await response.json();
      this.logger.log(`✅ [MP REFUND] Reembolsos encontrados: ${refundsResult.length}`);

      return refundsResult;
    } catch (error) {
      this.logger.error(`❌ [MP REFUND] Erro ao buscar reembolsos:`, error);
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }

  async getRefund(paymentId: string, refundId: string): Promise<any> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(`🔍 [MP REFUND] Buscando reembolso específico: ${refundId}`);

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds/${refundId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`❌ [MP REFUND] Erro ao buscar reembolso:`, errorData);
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const refundResult = await response.json();
      this.logger.log(`✅ [MP REFUND] Reembolso encontrado: ${refundResult.id}`);

      return refundResult;
    } catch (error) {
      this.logger.error(`❌ [MP REFUND] Erro ao buscar reembolso:`, error);
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }

  // ===== MÉTODOS DE BUSCA =====

  async searchPayments(params: {
    externalReference?: string;
    status?: string;
    dateCreatedFrom?: string;
    dateCreatedTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(`🔍 [MP SEARCH] Buscando pagamentos...`);

      const queryParams = new URLSearchParams();
      if (params.externalReference) queryParams.append('external_reference', params.externalReference);
      if (params.status) queryParams.append('status', params.status);
      if (params.dateCreatedFrom) queryParams.append('range', `date_created`);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const url = `https://api.mercadopago.com/v1/payments/search?${queryParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`❌ [MP SEARCH] Erro ao buscar pagamentos:`, errorData);
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const searchResult = await response.json();
      this.logger.log(`✅ [MP SEARCH] Pagamentos encontrados: ${searchResult.results?.length || 0}`);

      return searchResult;
    } catch (error) {
      this.logger.error(`❌ [MP SEARCH] Erro ao buscar pagamentos:`, error);
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }

  async searchCustomers(params: {
    email?: string;
    firstName?: string;
    lastName?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(`🔍 [MP SEARCH] Buscando customers...`);

      const queryParams = new URLSearchParams();
      if (params.email) queryParams.append('email', params.email);
      if (params.firstName) queryParams.append('first_name', params.firstName);
      if (params.lastName) queryParams.append('last_name', params.lastName);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const url = `https://api.mercadopago.com/v1/customers/search?${queryParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`❌ [MP SEARCH] Erro ao buscar customers:`, errorData);
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const searchResult = await response.json();
      this.logger.log(`✅ [MP SEARCH] Customers encontrados: ${searchResult.results?.length || 0}`);

      return searchResult;
    } catch (error) {
      this.logger.error(`❌ [MP SEARCH] Erro ao buscar customers:`, error);
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }

  async getIdentificationTypes(): Promise<any[]> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(`🔍 [MP ID] Buscando tipos de identificação...`);

      const response = await fetch('https://api.mercadopago.com/v1/identification_types', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`❌ [MP ID] Erro ao buscar tipos de identificação:`, errorData);
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const idTypesResult = await response.json();
      this.logger.log(`✅ [MP ID] Tipos de identificação encontrados: ${idTypesResult.length}`);

      return idTypesResult;
    } catch (error) {
      this.logger.error(`❌ [MP ID] Erro ao buscar tipos de identificação:`, error);
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }
}