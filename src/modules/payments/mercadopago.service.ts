import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment, PaymentRefund } from 'mercadopago';

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

  // Obter configuração atual
  getConfig(): any {
    return {
      hasAccessToken: !!process.env.MP_ACCESS_TOKEN,
      hasPublicKey: !!process.env.MP_PUBLIC_KEY,
      platformFeePercentage: process.env.PLATFORM_FEE_PERCENTAGE || '10',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
