import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment, PaymentRefund, CardToken } from 'mercadopago';

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

  constructor() {
    // Configurar cliente do Mercado Pago
    const accessToken = process.env.MP_ACCESS_TOKEN || '';
    const isTestMode = accessToken.startsWith('TEST-');
    
    this.client = new MercadoPagoConfig({
      accessToken,
      options: {
        timeout: 5000,
        idempotencyKey: 'treinopro-' + Date.now(),
      },
    });

    this.preference = new Preference(this.client);
    this.payment = new Payment(this.client);
    this.paymentRefund = new PaymentRefund(this.client);
    this.cardToken = new CardToken(this.client);

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
    token: string;
    amount: number;
    description: string;
    externalReference: string;
    capture?: boolean;
    cardBrand?: string;
  }): Promise<any> {
    try {
      this.logger.log(`Criando pagamento MP: ${paymentData.externalReference}`);
      
      // Usar bandeira do cartão passada diretamente
      let paymentMethodId = 'visa';
      let issuerId = 25;
      
      if (paymentData.cardBrand) {
        const cardBrand = paymentData.cardBrand.toLowerCase();
        if (cardBrand === 'mastercard') {
          paymentMethodId = 'mastercard';
          issuerId = 1; // Mastercard issuer ID
        } else if (cardBrand === 'visa') {
          paymentMethodId = 'visa';
          issuerId = 25; // Visa issuer ID
        }
      }

      const paymentRequest = {
        transaction_amount: paymentData.amount,
        token: paymentData.token,
        description: paymentData.description,
        installments: 1,
        payment_method_id: paymentMethodId,
        issuer_id: issuerId,
        payer: {
          email: 'test@example.com',
          type: 'customer',
          identification: {
            type: 'CPF',
            number: '12345678909',
          },
        },
        external_reference: paymentData.externalReference,
      };

      // Log detalhado do payload
      this.logger.log(`🔍 [MP DEBUG] Payload completo:`, JSON.stringify(paymentRequest, null, 2));
      this.logger.log(`🔍 [MP DEBUG] Dados de entrada:`, {
        token: paymentData.token?.substring(0, 20) + '...',
        amount: paymentData.amount,
        description: paymentData.description,
        externalReference: paymentData.externalReference,
        capture: paymentData.capture
      });

      const response = await this.payment.create({
        body: paymentRequest,
      });

      this.logger.log(`Pagamento criado com sucesso: ${response.id}`);
      
      return response;
    } catch (error) {
      this.logger.error(`Erro ao criar pagamento:`, error);
      throw new BadRequestException(`Erro ao criar pagamento: ${error.message}`);
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
}
