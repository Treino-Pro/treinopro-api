import {
  Injectable,
  Logger,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  MercadoPagoConfig,
  Preference,
  Payment,
  PaymentRefund,
  CardToken,
  Customer,
} from 'mercadopago';
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

    // ✅ VALIDAÇÃO: Verificar se Access Token está configurado
    if (!accessToken) {
      this.logger.error('❌ MP_ACCESS_TOKEN não configurado');
    } else {
      this.logger.log(
        `✅ MercadoPago Service - Modo: ${isTestMode ? 'TESTE' : 'PRODUÇÃO'}`,
      );

      // ✅ AVISO: Se estiver em produção, alertar sobre cartões de teste
      if (!isTestMode) {
        this.logger.warn(
          '⚠️ Modo PRODUÇÃO: Certifique-se de usar cartões reais, não cartões de teste',
        );
      }
    }

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
  }

  // Criar preferência de pagamento com split
  async createPreference(
    data: CreatePreferenceData,
  ): Promise<MPPreferenceResponse> {
    try {
      // Configurar preferência com split
      const prefApiUrl = process.env.API_URL;
      const prefIsPublicUrl =
        !!prefApiUrl && !/localhost|127\.0\.0\.1/.test(prefApiUrl);

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

        // URL de notificação (webhook) — omitida em desenvolvimento local
        ...(prefIsPublicUrl
          ? { notification_url: `${prefApiUrl}/webhooks/mercadopago` }
          : {}),

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
        expiration_date_to: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(), // 24h
      };

      this.logger.log(`Criando preferência MP para aula ${data.classId}`);
      this.logger.debug('Dados da preferência:', preferenceData);

      const response = await this.preference.create({
        body: preferenceData,
      });

      if (!response.id) {
        throw new BadRequestException(
          'Erro ao criar preferência no Mercado Pago',
        );
      }

      this.logger.log(`Preferência criada com sucesso: ${response.id}`);

      const isTestMode = (process.env.MP_ACCESS_TOKEN || '').startsWith(
        'TEST-',
      );
      const initPoint = isTestMode
        ? response.sandbox_init_point || response.init_point || ''
        : response.init_point || '';

      return {
        id: response.id,
        initPoint,
        sandboxInitPoint: response.sandbox_init_point || '',
      };
    } catch (error) {
      this.logger.error('Erro ao criar preferência MP:', error);
      throw new BadRequestException(
        `Erro ao criar pagamento: ${error.message}`,
      );
    }
  }

  // Buscar informações de um pagamento
  async getPayment(paymentId: string): Promise<any> {
    try {
      this.logger.log(`Buscando pagamento MP: ${paymentId}`);

      const response = await this.payment.get({
        id: paymentId,
      });

      this.logger.log(
        `Pagamento encontrado: ${response.id} - Status: ${response.status}`,
      );

      return response;
    } catch (error) {
      this.logger.error(`Erro ao buscar pagamento ${paymentId}:`, error);
      throw new BadRequestException(
        `Erro ao buscar pagamento: ${error.message}`,
      );
    }
  }

  // Capturar pagamento (aplicar split)
  async capturePayment(paymentId: string): Promise<any> {
    try {
      this.logger.log(`Capturando pagamento MP: ${paymentId}`);

      // Verificar se é um pagamento simulado
      if (paymentId.startsWith('sim_')) {
        this.logger.log(
          `🎭 [SIMULATION] Pagamento simulado detectado: ${paymentId}`,
        );
        this.logger.log(`🎭 [SIMULATION] Simulando captura bem-sucedida`);

        // Simular resposta de captura bem-sucedida
        return {
          id: paymentId,
          status: 'approved',
          status_detail: 'accredited',
          transaction_amount: 50.0,
          date_created: new Date().toISOString(),
          date_last_updated: new Date().toISOString(),
          _simulated: true,
          _simulation_action: 'capture',
        };
      }

      // No Mercado Pago, a captura acontece automaticamente quando o status muda para 'approved'
      // Mas podemos forçar a captura se necessário
      const response = await this.payment.capture({
        id: paymentId,
      });

      this.logger.log(`Pagamento capturado com sucesso: ${paymentId}`);

      return response;
    } catch (error) {
      this.logger.error(`Erro ao capturar pagamento ${paymentId}:`, error);
      throw new BadRequestException(
        `Erro ao capturar pagamento: ${error.message}`,
      );
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
      throw new BadRequestException(
        `Erro ao reembolsar pagamento: ${error.message}`,
      );
    }
  }

  // Cancelar pagamento (pré-autorização)
  async cancelPayment(paymentId: string): Promise<any> {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new BadRequestException('MP_ACCESS_TOKEN não configurado');
    }

    try {
      this.logger.log(`Cancelando pagamento MP: ${paymentId}`);

      // Usar REST diretamente: PUT /v1/payments/{id} com status=cancelled
      // O SDK às vezes não envia o payload correto para pré-autorizações
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'cancelled' }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.logger.error(
          `Erro ao cancelar pagamento ${paymentId}:`,
          errorData,
        );
        throw new BadRequestException(
          `Erro ao cancelar pagamento: ${errorData.message || response.statusText}`,
        );
      }

      const result = await response.json();
      this.logger.log(`Pagamento cancelado com sucesso: ${paymentId}`);
      return result;
    } catch (error) {
      this.logger.error(`Erro ao cancelar pagamento ${paymentId}:`, error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Erro ao cancelar pagamento: ${error.message}`,
      );
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
  mapPaymentStatus(mpStatus: string): string {
    switch (mpStatus) {
      case 'pending':
        return 'pending'; // Aguardando pagamento/confirmação
      case 'approved':
        return 'authorized'; // Pago no MP, mas ainda em custódia interna
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

  // Criar pagamento via PIX (retorna QR Code)
  async createPixPayment(pixData: {
    amount: number;
    description: string;
    externalReference: string;
    payerEmail: string;
    payerFirstName?: string;
    payerLastName?: string;
    payerCpf?: string;
    notificationUrl?: string;
  }): Promise<{
    paymentId: string;
    status: string;
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl?: string;
    expiresAt?: string;
  }> {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new BadRequestException(
        'Configuracao do Mercado Pago incompleta: MP_ACCESS_TOKEN, MP_PUBLIC_KEY e MP_WEBHOOK_SECRET sao obrigatorios.',
      );
    }

    const amount = Number(pixData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Valor do PIX invalido');
    }

    const payerEmail = String(pixData.payerEmail || '')
      .trim()
      .toLowerCase();
    if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      throw new BadRequestException('payerEmail invalido para pagamento PIX');
    }

    const payerCpf = String(pixData.payerCpf || '').replace(/\D/g, '');
    if (!payerCpf) {
      throw new BadRequestException(
        'payerCpf e obrigatorio para pagamento PIX',
      );
    }
    if (!this.isValidCpf(payerCpf)) {
      throw new BadRequestException('payerCpf invalido para pagamento PIX');
    }

    this.logger.log(
      `🔵 [PIX] Criando pagamento PIX para referência: ${pixData.externalReference}`,
    );

    const body: any = {
      transaction_amount: Number(amount.toFixed(2)),
      description: (pixData.description || 'Treino').slice(0, 60),
      payment_method_id: 'pix',
      external_reference: pixData.externalReference,
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      payer: {
        email: payerEmail,
        first_name: pixData.payerFirstName || 'Aluno',
        last_name: pixData.payerLastName || 'TreinoPro',
        identification: {
          type: 'CPF',
          number: payerCpf,
        },
      },
    };

    if (pixData.notificationUrl) {
      body.notification_url = pixData.notificationUrl;
    }

    this.logger.log('🔍 [PIX] Payload sanitizado:', {
      transaction_amount: body.transaction_amount,
      payment_method_id: body.payment_method_id,
      external_reference: body.external_reference,
      date_of_expiration: body.date_of_expiration,
      notification_url: body.notification_url,
      payer: {
        email: this.maskEmail(payerEmail),
        first_name: body.payer.first_name,
        last_name: body.payer.last_name,
        identification: {
          type: 'CPF',
          number: this.maskCpf(payerCpf),
        },
      },
    });

    const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
    const useMockPixInTest = process.env.MP_MOCK_PIX_IN_TEST !== 'false';

    // Em homologação, permite fluxo de PIX mockado para não depender da API do MP
    // e já seguir com pagamento confirmado automaticamente.
    if (isTestEnv && useMockPixInTest) {
      const simulatedPaymentId = `sim_pix_${randomUUID()}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const mockQrCode = this.buildMockPixCode(
        body.external_reference,
        body.transaction_amount,
      );

      this.logger.warn(
        `🧪 [PIX MOCK] TEST- detectado. Criando PIX mockado com aprovação automática (paymentId=${simulatedPaymentId})`,
      );

      return {
        paymentId: simulatedPaymentId,
        status: 'approved',
        qrCode: mockQrCode,
        qrCodeBase64: this.getMockQrCodeBase64(),
        ticketUrl: `https://sandbox.treinopro.local/pix/${body.external_reference}`,
        expiresAt,
      };
    }

    const baseIdempotencyKey = `pix_${pixData.externalReference}`;
    const attempts = [
      baseIdempotencyKey,
      `${baseIdempotencyKey}_retry_${randomUUID()}`,
    ];

    let lastError: {
      status: number;
      errorData: any;
      requestId?: string;
      idempotencyKey: string;
    } | null = null;

    for (let index = 0; index < attempts.length; index++) {
      const idempotencyKey = attempts[index];
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      const requestId = response.headers.get('x-request-id') || undefined;

      let parsedData: any = {};
      try {
        parsedData = JSON.parse(responseText);
      } catch {
        parsedData = { message: responseText };
      }

      if (response.ok) {
        this.logger.log(
          `✅ [PIX] Pagamento PIX criado: ${parsedData.id} | Status: ${parsedData.status} | requestId=${requestId || 'n/a'}`,
        );

        const transactionData =
          parsedData?.point_of_interaction?.transaction_data;
        if (!transactionData?.qr_code) {
          this.logger.error(
            `❌ [PIX] Resposta sem QR Code. Status: ${parsedData.status} | requestId=${requestId || 'n/a'}`,
            parsedData,
          );
          throw new BadGatewayException(
            'Pagamento PIX criado sem QR Code. Tente novamente em instantes.',
          );
        }

        return {
          paymentId: String(parsedData.id),
          status: parsedData.status,
          qrCode: transactionData.qr_code,
          qrCodeBase64: transactionData.qr_code_base64 || '',
          ticketUrl: transactionData.ticket_url,
          expiresAt: parsedData.date_of_expiration,
        };
      }

      const mpMessage = String(parsedData?.message || '').toLowerCase();
      const isRetryable =
        response.status >= 500 || mpMessage === 'internal_error';

      this.logger.error('❌ [PIX] Erro ao criar pagamento PIX:', {
        status: response.status,
        requestId,
        idempotencyKey,
        message: parsedData?.message,
        cause: parsedData?.cause || [],
        response: parsedData,
      });

      lastError = {
        status: response.status,
        errorData: parsedData,
        requestId,
        idempotencyKey,
      };

      if (isRetryable && index < attempts.length - 1) {
        this.logger.warn(
          `⚠️ [PIX] Falha transitória (${parsedData?.message || response.status}). Tentando novamente...`,
        );
        await this.sleep(400);
        continue;
      }

      break;
    }

    if (lastError) {
      const rawMessage =
        lastError.errorData?.message || lastError.errorData?.error;
      const finalMessage = rawMessage || 'Erro desconhecido do provedor';
      const normalizedMessage = String(finalMessage || '').toLowerCase();

      if (lastError.status >= 500 || finalMessage === 'internal_error') {
        throw new BadGatewayException(
          `Erro temporario no provedor de pagamento (requestId=${lastError.requestId || 'n/a'}). Tente novamente em instantes.`,
        );
      }

      // Erro clássico de credencial/ambiente no MP: token de produção usado em contexto não autorizado.
      if (
        lastError.status === 401 &&
        normalizedMessage.includes('unauthorized use of live credentials')
      ) {
        const isTestToken = (process.env.MP_ACCESS_TOKEN || '').startsWith(
          'TEST-',
        );
        const tokenMode = isTestToken ? 'TESTE' : 'PRODUCAO';

        throw new BadRequestException(
          `Mercado Pago recusou credenciais de ${tokenMode}. Verifique se MP_ACCESS_TOKEN corresponde ao ambiente correto (TEST- para homologacao ou APP_USR para producao) e se a conta do MP esta habilitada para receber PIX. requestId=${lastError.requestId || 'n/a'}`,
        );
      }

      // Erro 4047 do MP: conta coletora (recebedora) sem chave PIX cadastrada/habilitada.
      if (
        normalizedMessage.includes('collector user without key') ||
        normalizedMessage.includes('without key enabled for qr')
      ) {
        throw new BadRequestException(
          'A conta do Mercado Pago vinculada à plataforma ainda não possui uma chave PIX habilitada. ' +
            'Acesse o painel do Mercado Pago, vá em "Seu dinheiro > PIX" e cadastre uma chave PIX para habilitar pagamentos via QR Code.',
        );
      }

      throw new BadRequestException(
        `Erro ao processar pagamento PIX: ${finalMessage}`,
      );
    }

    throw new BadGatewayException('Falha inesperada ao criar pagamento PIX');
  }

  private maskEmail(email: string): string {
    const [user, domain] = email.split('@');
    if (!user || !domain) return '***';
    if (user.length <= 2) return `${user[0] || '*'}***@${domain}`;
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  }

  private maskCpf(cpf: string): string {
    if (!cpf || cpf.length < 11) return '***';
    return `${cpf.slice(0, 3)}***${cpf.slice(-2)}`;
  }

  private isValidCpf(cpf: string): boolean {
    if (!cpf || cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += Number(cpf[i]) * (10 - i);
    }
    let firstDigit = (sum * 10) % 11;
    if (firstDigit === 10) firstDigit = 0;
    if (firstDigit !== Number(cpf[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += Number(cpf[i]) * (11 - i);
    }
    let secondDigit = (sum * 10) % 11;
    if (secondDigit === 10) secondDigit = 0;

    return secondDigit === Number(cpf[10]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildMockPixCode(reference: string, amount: number): string {
    const normalizedAmount = Number(amount || 0).toFixed(2);
    return `MOCKPIX|ref:${reference}|amount:${normalizedAmount}|ts:${Date.now()}`;
  }

  private getMockQrCodeBase64(): string {
    // PNG 1x1 transparente (válido) para o app renderizar sem erro.
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlNnRsAAAAASUVORK5CYII=';
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
      this.logger.log(
        `Criando pagamento MP: ${paymentData.externalReference} | Env: ${isTest ? 'TEST' : 'PROD'}`,
      );

      // Validar token
      if (!paymentData.token || paymentData.token.length < 10) {
        throw new BadRequestException(
          'Token do cartão inválido ou muito curto',
        );
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
          throw new BadRequestException(
            'payerEmail é obrigatório em ambiente de teste',
          );
        }
        paymentRequest.payer = {
          email: paymentData.payerEmail,
          ...(paymentData.payerIdentification
            ? { identification: paymentData.payerIdentification }
            : {}),
        };
        this.logger.log('🔍 [MP] Sandbox: usando payer com email do aluno');
      } else if (!paymentData.payerId) {
        // Produção sem customer_id: usar dados do pagador sem type/id
        if (!paymentData.payerEmail || !paymentData.payerIdentification) {
          throw new BadRequestException(
            'payerEmail e payerIdentification são obrigatórios quando não há customer_id',
          );
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
        this.logger.log(
          `🔍 [MP] Produção: usando customer_id: ${paymentData.payerId}`,
        );
      }

      // Log detalhado do payload
      this.logger.log(
        `🔍 [MP DEBUG] Payload completo:`,
        JSON.stringify(paymentRequest, null, 2),
      );
      this.logger.log(
        `🔍 [MP DEBUG] Headers esperados: { Authorization: 'Bearer ${isTest ? 'TEST-***' : 'PROD-***'}', Content-Type: 'application/json' }`,
      );
      this.logger.log(`🔍 [MP DEBUG] Dados de entrada:`, {
        token: paymentData.token?.substring(0, 20) + '...',
        amount: paymentData.amount,
        description: paymentData.description,
        externalReference: paymentData.externalReference,
        capture: paymentData.capture,
      });

      let response;
      try {
        response = await this.payment.create({
          body: paymentRequest,
          requestOptions: {
            idempotencyKey: `pay_${paymentData.externalReference}`,
          },
        });
      } catch (err) {
        // Fallback: alguns ambientes de teste falham com capture=false sem motivo claro
        if (
          (err?.message === 'internal_error' || err?.status === 500) &&
          paymentRequest.capture === false
        ) {
          this.logger.warn(
            '⚠️ [MP FALLBACK] internal_error com capture=false. Tentando capture=true...',
          );
          const retryRequest = { ...paymentRequest, capture: true };
          this.logger.log(
            '🔁 [MP FALLBACK] Payload retry:',
            JSON.stringify(retryRequest, null, 2),
          );

          try {
            response = await this.payment.create({
              body: retryRequest,
              requestOptions: {
                idempotencyKey: `pay_${paymentData.externalReference}_retry`,
              },
            });
          } catch (retryErr) {
            // Se ainda falhar, usar simulação
            this.logger.error(
              '❌ [MP FALLBACK] Retry também falhou, ativando simulação:',
              retryErr.message,
            );
            return await this.handlePaymentFailureWithSimulation(
              paymentData,
              err,
            );
          }
        } else {
          // Qualquer outro erro também pode usar simulação
          this.logger.error(
            '❌ [MP ERROR] Erro do Mercado Pago, verificando se deve usar simulação:',
            err.message,
          );
          return await this.handlePaymentFailureWithSimulation(
            paymentData,
            err,
          );
        }
      }

      this.logger.log(`Pagamento criado com sucesso: ${response.id}`);

      return response;
    } catch (error) {
      this.logger.error(`Erro ao criar pagamento:`, error);

      // Log detalhado do erro para debug
      if (error.response) {
        this.logger.error(
          `🔍 [MP ERROR] Response status: ${error.response.status}`,
        );
        this.logger.error(`🔍 [MP ERROR] Response data:`, error.response.data);
        this.logger.error(
          `🔍 [MP ERROR] Response headers:`,
          error.response.headers,
        );
      }

      // Tratar diferentes tipos de erro do MP
      let errorMessage = 'Erro interno do Mercado Pago';

      if (error.message === 'internal_error') {
        errorMessage =
          'Erro interno do Mercado Pago. Verifique os dados do cartão e tente novamente.';
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
  private async handlePaymentFailureWithSimulation(
    paymentData: any,
    originalError: any,
  ): Promise<any> {
    try {
      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');

      this.logger.log('🎭 [SIMULATION] ===== VERIFICANDO MODO SIMULAÇÃO =====');
      this.logger.log(
        '❌ [SIMULATION] Erro original do MP:',
        originalError.message,
      );
      this.logger.log(
        '🔍 [SIMULATION] Ambiente atual:',
        isTestEnv ? 'TESTE' : 'PRODUÇÃO',
      );

      // ✅ VERIFICAÇÃO CRÍTICA: Simulação APENAS em TESTE!
      if (!isTestEnv) {
        this.logger.log(
          '🏭 [SIMULATION] PRODUÇÃO - simulação BLOQUEADA, propagando erro',
        );
        throw originalError;
      }

      // Verificar se deve usar simulação (apenas em teste)
      if (!this.paymentSimulation.shouldUseSimulation()) {
        this.logger.log(
          '❌ [SIMULATION] Simulação desabilitada em teste, propagando erro original',
        );
        throw originalError;
      }

      this.logger.log(
        '🎭 [SIMULATION] ===== ATIVANDO MODO SIMULAÇÃO (TESTE) =====',
      );

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
        simulated: simulatedResponse._simulated,
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
    identificationType?: string;
    identificationNumber?: string;
  }): Promise<string> {
    try {
      this.logger.log(
        `Criando token de cartão para: ${cardData.cardholderName}`,
      );

      const cardTokenRequest: any = {
        card_number: cardData.cardNumber.replace(/\s/g, ''), // Remove espaços
        expiration_month: cardData.expirationMonth,
        expiration_year: cardData.expirationYear,
        security_code: cardData.securityCode,
        cardholder: {
          name: cardData.cardholderName,
        },
      };

      // ✅ ADICIONAR: identification é obrigatório segundo MP
      if (cardData.identificationType && cardData.identificationNumber) {
        cardTokenRequest.cardholder.identification = {
          type: cardData.identificationType,
          number: cardData.identificationNumber.replace(/\D/g, ''), // Remove formatação (pontos, traços)
        };

        this.logger.log(`🔍 [MP CARD TOKEN] Identification incluído:`, {
          type: cardData.identificationType,
          number_masked: cardData.identificationNumber.replace(
            /\d(?=\d{4})/g,
            '*',
          ),
        });
      } else {
        this.logger.warn(
          '⚠️ [MP CARD TOKEN] Identification não fornecido - pode causar erro 400',
        );
      }

      this.logger.log(`🔍 [MP CARD TOKEN] Payload:`, {
        card_number_masked: cardData.cardNumber.replace(/\d(?=\d{4})/g, '*'), // Mascarar número para log
        card_number_length: cardData.cardNumber.length,
        card_number_clean: cardData.cardNumber.replace(/\s/g, ''), // Número sem espaços
        card_number_sent_to_mp: cardTokenRequest.card_number, // Número real enviado para MP
        expiration_month: cardTokenRequest.expiration_month,
        expiration_year: cardTokenRequest.expiration_year,
        security_code: '***',
        cardholder_name: cardData.cardholderName,
        has_identification: !!cardTokenRequest.cardholder.identification,
      });

      // ✅ CORREÇÃO: Criar token via API REST diretamente
      // Isso garante que usamos o mesmo Access Token usado para salvar
      // O SDK pode usar credenciais diferentes internamente
      const accessToken = process.env.MP_ACCESS_TOKEN;
      if (!accessToken) {
        throw new BadRequestException(
          'Token de acesso do Mercado Pago não configurado',
        );
      }

      this.logger.log(
        `🌐 [MP CARD TOKEN] Criando token via API REST diretamente`,
      );
      this.logger.log(
        `🔑 [MP CARD TOKEN] Usando Access Token: ${accessToken.startsWith('TEST-') ? 'TEST-***' : 'PROD-***'}`,
      );

      // ✅ ADICIONAR: Log do payload completo sendo enviado
      this.logger.log(
        `📤 [MP CARD TOKEN] Payload completo enviado:`,
        JSON.stringify(cardTokenRequest, null, 2),
      );

      const response = await fetch(
        'https://api.mercadopago.com/v1/card_tokens',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cardTokenRequest),
        },
      );

      const responseText = await response.text();

      // ✅ ADICIONAR: Log detalhado da resposta
      this.logger.log(
        `📥 [MP CARD TOKEN] Response status: ${response.status} ${response.statusText}`,
      );
      this.logger.log(
        `📥 [MP CARD TOKEN] Response body (primeiros 500 chars): ${responseText.substring(0, 500)}`,
      );

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { message: responseText, raw: true };
        }

        this.logger.error(`❌ [MP CARD TOKEN] Erro ao criar token:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          cause: errorData.cause || [],
        });

        throw new BadRequestException(
          `Erro ao processar cartão: ${errorData.message || 'Erro desconhecido'}`,
        );
      }

      const tokenData = JSON.parse(responseText);

      // ✅ ADICIONAR: Log completo dos dados retornados
      this.logger.log(`✅ [MP CARD TOKEN] Token criado com sucesso:`, {
        id: tokenData.id,
        status: tokenData.status,
        card_id: tokenData.card_id,
        first_six_digits: tokenData.first_six_digits,
        last_four_digits: tokenData.last_four_digits,
        expiration_month: tokenData.expiration_month,
        expiration_year: tokenData.expiration_year,
        cardholder: tokenData.cardholder,
        date_created: tokenData.date_created,
        date_last_updated: tokenData.date_last_updated,
        date_due: tokenData.date_due,
        luhn_validation: tokenData.luhn_validation,
        live_mode: tokenData.live_mode,
      });

      return tokenData.id;
    } catch (error) {
      this.logger.error(`Erro ao criar token de cartão:`, error);

      // Se já for BadRequestException, propagar
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Erro ao processar cartão: ${error.message}`,
      );
    }
  }

  // Criar token a partir de cartão salvo (card_id).
  // O CVV é obrigatório em toda transação de cartão de crédito com card-on-file.
  async createCardTokenFromSavedCard(
    mpCardId: string,
    securityCode?: string,
  ): Promise<string> {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new BadRequestException(
        'Token de acesso do Mercado Pago não configurado',
      );
    }

    const normalizedSecurityCode = securityCode?.trim();
    if (!normalizedSecurityCode) {
      throw new BadRequestException(
        'Por motivos de segurança, o código de segurança (CVV) do seu cartão é obrigatório para confirmar o pagamento.',
      );
    }

    if (!/^\d{3,4}$/.test(normalizedSecurityCode)) {
      throw new BadRequestException('CVV deve ter 3 ou 4 dígitos');
    }

    this.logger.log(
      `🔄 [MP TOKEN FROM CARD] Gerando token a partir do card_id: ${mpCardId}`,
    );

    const response = await fetch('https://api.mercadopago.com/v1/card_tokens', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_id: mpCardId,
        security_code: normalizedSecurityCode,
      }),
    });

    const responseText = await response.text();
    this.logger.log(
      `📥 [MP TOKEN FROM CARD] Status: ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }
      this.logger.error(`❌ [MP TOKEN FROM CARD] Erro:`, errorData);
      throw new BadRequestException(
        `Erro ao gerar token do cartão salvo: ${errorData.message || 'Erro desconhecido'}`,
      );
    }

    const tokenData = JSON.parse(responseText);
    this.logger.log(`✅ [MP TOKEN FROM CARD] Token gerado com sucesso:`, {
      id: tokenData.id,
      status: tokenData.status,
      last_four_digits: tokenData.last_four_digits,
      date_due: tokenData.date_due,
    });

    return tokenData.id;
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

  // ===== SPLIT DE PIX: TRANSFERÊNCIA MARKETPLACE MP =====

  // Transfere o valor do repasse da conta da plataforma para a conta PIX do personal
  // usando o endpoint /v1/payouts (Pagamentos de saída para chaves PIX).
  async sendMpTransfer(data: {
    destinationMpUserId?: string;
    pixKey?: string;
    amount: number;
    idempotencyKey: string;
    description?: string;
    accessToken?: string;
  }): Promise<{ success: boolean; transferId?: string; error?: string }> {
    const accessToken = data.accessToken || process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return { success: false, error: 'MP_ACCESS_TOKEN não configurado' };
    }

    const isTestEnv = accessToken.startsWith('TEST-');
    if (isTestEnv) {
      this.logger.warn(
        `🧪 [TRANSFER MOCK] Ambiente de teste — transferência simulada para PIX=${data.pixKey || data.destinationMpUserId} valor=R$${data.amount}`,
      );
      return { success: true, transferId: `sim_transfer_${Date.now()}` };
    }

    try {
      this.logger.log(
        `💸 [MP PAYOUT] Iniciando repasse de R$${data.amount} para ${data.pixKey ? `PIX: ${data.pixKey}` : `MP User: ${data.destinationMpUserId}`} (${data.accessToken ? 'OAuth seller token' : 'app token'})`,
      );

      const payoutPayload: any = {
        amount: Number(data.amount.toFixed(2)),
        description: data.description || 'Repasse de aula TreinoPro',
      };

      // Se tiver chave PIX, usamos PIX Payout
      if (data.pixKey) {
        payoutPayload.payout_destination = {
          type: 'pix',
          receiver_id: data.pixKey,
        };
      } 
      // Se não tiver PIX mas tiver MP User ID, tentamos Wallet-to-Wallet via Payouts
      else if (data.destinationMpUserId) {
        payoutPayload.payout_destination = {
          type: 'mercadopago_account', // Transferência interna entre carteiras
          receiver_id: data.destinationMpUserId,
        };
      } else {
        this.logger.error('❌ [MP TRANSFER] Falha: Nem Chave PIX nem MP User ID fornecidos.');
        return { success: false, error: 'Dados de destino insuficientes para o repasse' };
      }

      const response = await fetch('https://api.mercadopago.com/v1/payouts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': data.idempotencyKey,
        },
        body: JSON.stringify(payoutPayload),
      });

      const responseText = await response.text();
      let parsed: any = {};
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { message: responseText };
      }

      if (!response.ok) {
        this.logger.error(
          `❌ [MP PAYOUT] Falha HTTP ${response.status}:`,
          parsed,
        );
        return {
          success: false,
          error: parsed?.message || `HTTP ${response.status}`,
        };
      }

      const transferId = String(parsed.id || '');
      this.logger.log(`✅ [MP PAYOUT] Repasse criado com sucesso: id=${transferId}`);
      return { success: true, transferId };
    } catch (error) {
      this.logger.error(`❌ [MP PAYOUT] Erro inesperado:`, error);
      return { success: false, error: error.message };
    }
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
      this.logger.log(
        `💸 [TRANSFER] Iniciando transferência para personal ${transferData.personalId}: R$ ${transferData.amount}`,
      );

      // Validar dados de transferência
      if (transferData.amount <= 0) {
        throw new Error('Valor da transferência deve ser maior que zero');
      }

      // Preparar dados da transferência baseado no método
      const transferRequest: any = {
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
            throw new Error(
              'Dados bancários são obrigatórios para transferência bancária',
            );
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
          return await this.sendMpTransfer({
            destinationMpUserId: transferData.personalData.mpAccountId,
            amount: transferData.amount,
            idempotencyKey: `withdrawal_${transferData.personalId}_${Date.now()}`,
            description: transferData.description,
          });

        default:
          throw new Error('Método de transferência inválido');
      }

      // Fazer transferência via API do Mercado Pago
      const response = await this.payment.create({
        body: transferRequest,
      });

      this.logger.log(
        `✅ [TRANSFER] Transferência criada com sucesso: ${response.id}`,
      );

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
        amount:
          typeof response.transaction_amount === 'string'
            ? parseFloat(response.transaction_amount)
            : response.transaction_amount,
        description: response.description,
        createdAt: response.date_created,
        updatedAt: response.date_last_updated,
      };
    } catch (error) {
      this.logger.error(
        `❌ [TRANSFER] Erro ao verificar status da transferência ${transferId}:`,
        error,
      );
      throw new Error(
        `Erro ao verificar status da transferência: ${error.message}`,
      );
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
          const { bank, agency, account } =
            transferData.personalData.bankAccount;
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
  async createOrGetCustomer(
    userId: string,
    customerData: {
      email: string;
      firstName: string;
      lastName: string;
      identification: { type: string; number: string };
    },
  ): Promise<{ id: string }> {
    try {
      console.log('👤 [MP CUSTOMER] Criando/buscando customer...');
      console.log('🔍 [MP CUSTOMER] Dados:', {
        userId,
        email: customerData.email,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
      });

      // ✅ SDK: buscar customer existente pelo email
      const searchData = await this.customer.search({
        options: { email: customerData.email },
      });
      if (searchData?.results && searchData.results.length > 0) {
        const existingCustomer = searchData.results[0];
        console.log(
          '✅ [MP CUSTOMER] Customer encontrado:',
          existingCustomer.id,
        );
        return { id: existingCustomer.id };
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
  async saveCardToCustomer(
    customerId: string,
    cardData: {
      token: string;
      cardholderName: string;
      identificationType: string;
      identificationNumber: string;
    },
  ): Promise<{
    id: string;
    lastFourDigits?: string;
    paymentMethodId?: string;
    expirationMonth?: number;
    expirationYear?: number;
  }> {
    try {
      console.log('💳 [MP CARD] ===== SALVANDO CARTÃO NO CUSTOMER =====');
      console.log('🔍 [MP CARD] Customer ID:', customerId);
      console.log('🔍 [MP CARD] Token:', {
        length: cardData.token?.length || 0,
        preview: cardData.token?.substring(0, 20) + '...',
        isValid: !!cardData.token && cardData.token.length > 10,
      });

      // ✅ VALIDAÇÃO: Token não pode estar vazio
      if (!cardData.token || cardData.token.length < 10) {
        throw new BadRequestException('Token do cartão inválido ou expirado');
      }

      // ✅ VALIDAÇÃO: Customer ID não pode estar vazio
      if (!customerId) {
        throw new BadRequestException('Customer ID é obrigatório');
      }

      // ✅ CORREÇÃO: Incluir cardholder no payload (obrigatório segundo documentação MP)
      // O Mercado Pago requer cardholder com name e identification para salvar cartões
      const cardPayload: any = {
        token: cardData.token,
      };

      // Adicionar cardholder se os dados estiverem disponíveis
      if (
        cardData.cardholderName &&
        cardData.identificationType &&
        cardData.identificationNumber
      ) {
        // ✅ IMPORTANTE: Garantir que o número de identification está sem formatação
        const cleanIdentificationNumber = cardData.identificationNumber.replace(
          /\D/g,
          '',
        );

        cardPayload.cardholder = {
          name: cardData.cardholderName,
          identification: {
            type: cardData.identificationType,
            number: cleanIdentificationNumber, // ✅ Sem formatação (pontos, traços)
          },
        };
        console.log('👤 [MP CARD] Cardholder incluído no payload:', {
          name: cardData.cardholderName,
          identificationType: cardData.identificationType,
          identificationNumber: cleanIdentificationNumber.replace(
            /\d(?=\d{4})/g,
            '*',
          ), // Mascarar para log
          identificationNumberLength: cleanIdentificationNumber.length,
        });
      } else {
        console.warn(
          '⚠️ [MP CARD] Cardholder não incluído - dados incompletos',
        );
      }

      // ✅ ADICIONAR: Log detalhado do payload antes de enviar
      console.log(
        '📤 [MP CARD] Enviando payload completo:',
        JSON.stringify(cardPayload, null, 2),
      );
      console.log('🔍 [MP CARD] Detalhes do payload:', {
        hasToken: !!cardPayload.token,
        tokenLength: cardPayload.token?.length || 0,
        hasCardholder: !!cardPayload.cardholder,
        cardholderName: cardPayload.cardholder?.name,
        identificationType: cardPayload.cardholder?.identification?.type,
        identificationNumberLength:
          cardPayload.cardholder?.identification?.number?.length || 0,
      });

      const accessToken = process.env.MP_ACCESS_TOKEN;

      if (!accessToken) {
        throw new BadRequestException(
          'Token de acesso do Mercado Pago não configurado',
        );
      }

      console.log(
        '🔑 [MP CARD] Token válido:',
        accessToken.startsWith('TEST-') ? 'TEST-***' : 'PROD-***',
      );

      // ✅ SDK: salvar cartão no customer
      let savedCard: any;
      try {
        savedCard = await this.customer.createCard({
          customerId,
          body: cardPayload,
          requestOptions: {
            idempotencyKey: `card_${customerId}_${Date.now()}`,
          },
        });
      } catch (error) {
        const status =
          error?.status ||
          error?.response?.status ||
          error?.cause?.status ||
          error?.response?.data?.status;
        const errorData = error?.response?.data || error?.cause || error || {};

        console.error('❌ [MP CARD] Erro ao salvar cartão (SDK):', {
          status,
          error: errorData,
          cause: errorData.cause || [],
        });

        // Mapear erros comuns do Mercado Pago
        let errorMessage = 'Erro ao salvar cartão no Mercado Pago';
        const message = errorData.message || error?.message || '';

        if (status === 400) {
          if (message.includes('token')) {
            errorMessage =
              'Token do cartão expirado. Por favor, tente novamente.';
          } else if (message.includes('customer')) {
            errorMessage = 'Customer inválido. Por favor, recadastre.';
          } else {
            errorMessage = `Dados inválidos: ${message || 'Verifique os dados do cartão'}`;
          }
        } else if (status === 401) {
          errorMessage =
            'Credenciais do Mercado Pago inválidas. Contate o suporte.';
        } else if (status === 404) {
          errorMessage =
            'Customer não encontrado no Mercado Pago. Por favor, recadastre.';
        } else if (status === 500) {
          // Erro 500 é comum quando o token expira
          errorMessage =
            'Token do cartão expirou. Por favor, insira os dados do cartão novamente.';
        } else if (status === 429) {
          errorMessage =
            'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
        }

        throw new BadRequestException(errorMessage);
      }

      console.log('✅ [MP CARD] Cartão salvo com sucesso:', {
        id: savedCard.id,
        last_four_digits: savedCard.last_four_digits,
        payment_method_id: savedCard.payment_method?.id || 'não informado',
        expiration_month: savedCard.expiration_month,
        expiration_year: savedCard.expiration_year,
        first_six_digits: savedCard.first_six_digits,
        cardholder_name: savedCard.cardholder?.name,
      });

      console.log('🏁 [MP CARD] ===== CARTÃO SALVO =====');

      return {
        id: savedCard.id,
        // Dados extras úteis para referência
        lastFourDigits: savedCard.last_four_digits,
        paymentMethodId: savedCard.payment_method?.id,
        expirationMonth: savedCard.expiration_month,
        expirationYear: savedCard.expiration_year,
      };
    } catch (error) {
      console.error('❌ [MP CARD] Exceção capturada:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3),
      });

      // Se for BadRequestException, propagar
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Para outros erros (network, etc)
      throw new BadRequestException(
        `Erro ao comunicar com Mercado Pago: ${error.message}`,
      );
    }
  }

  // Listar cartões do customer
  async getCustomerCards(customerId: string): Promise<any[]> {
    try {
      console.log('📋 [MP CARD] Listando cartões do customer:', customerId);
      const cards = await this.customer.listCards({ customerId });
      console.log('✅ [MP CARD] Cartões encontrados:', cards.length);
      return cards;
    } catch (error) {
      console.error('❌ [MP CARD] Erro ao listar cartões (SDK):', error);
      throw new BadRequestException('Erro ao listar cartões do customer');
    }
  }

  // Consultar cartão específico
  async getCustomerCard(customerId: string, cardId: string): Promise<any> {
    try {
      console.log('🔍 [MP CARD] Consultando cartão:', { customerId, cardId });

      const response = await fetch(
        `https://api.mercadopago.com/v1/customers/${customerId}/cards/${cardId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );

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
  async updateCustomerCard(
    customerId: string,
    cardId: string,
    updateData: {
      cardholderName?: string;
      expirationMonth?: string;
      expirationYear?: string;
    },
  ): Promise<any> {
    try {
      console.log('✏️ [MP CARD] Atualizando cartão:', { customerId, cardId });

      const response = await fetch(
        `https://api.mercadopago.com/v1/customers/${customerId}/cards/${cardId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        },
      );

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
  async deleteCustomerCard(
    customerId: string,
    cardId: string,
  ): Promise<boolean> {
    try {
      console.log('🗑️ [MP CARD] Removendo cartão:', { customerId, cardId });

      const response = await fetch(
        `https://api.mercadopago.com/v1/customers/${customerId}/cards/${cardId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );

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

  async createRefund(
    paymentId: string,
    refundData: {
      amount?: number;
      reason?: string;
    },
  ): Promise<any> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(
        `💰 [MP REFUND] Criando reembolso para pagamento: ${paymentId}`,
      );

      const refundRequest = {
        amount: refundData.amount,
        reason: refundData.reason || 'Solicitação do cliente',
      };

      this.logger.log(
        `🔍 [MP REFUND] Payload:`,
        JSON.stringify(refundRequest, null, 2),
      );

      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(refundRequest),
        },
      );

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
      this.logger.log(
        `📋 [MP REFUND] Buscando reembolsos do pagamento: ${paymentId}`,
      );

      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `❌ [MP REFUND] Erro ao buscar reembolsos:`,
          errorData,
        );
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const refundsResult = await response.json();
      this.logger.log(
        `✅ [MP REFUND] Reembolsos encontrados: ${refundsResult.length}`,
      );

      return refundsResult;
    } catch (error) {
      this.logger.error(`❌ [MP REFUND] Erro ao buscar reembolsos:`, error);
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }

  async getRefund(paymentId: string, refundId: string): Promise<any> {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN || '';
      this.logger.log(
        `🔍 [MP REFUND] Buscando reembolso específico: ${refundId}`,
      );

      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}/refunds/${refundId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `❌ [MP REFUND] Erro ao buscar reembolso:`,
          errorData,
        );
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const refundResult = await response.json();
      this.logger.log(
        `✅ [MP REFUND] Reembolso encontrado: ${refundResult.id}`,
      );

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
      queryParams.append('sort', 'date_created');
      queryParams.append('criteria', 'desc');
      if (params.externalReference)
        queryParams.append('external_reference', params.externalReference);
      if (params.status) queryParams.append('status', params.status);
      if (params.dateCreatedFrom || params.dateCreatedTo) {
        queryParams.append('range', 'date_created');
      }
      if (params.dateCreatedFrom)
        queryParams.append('begin_date', params.dateCreatedFrom);
      if (params.dateCreatedTo)
        queryParams.append('end_date', params.dateCreatedTo);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const url = `https://api.mercadopago.com/v1/payments/search?${queryParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `❌ [MP SEARCH] Erro ao buscar pagamentos:`,
          errorData,
        );
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const searchResult = await response.json();
      this.logger.log(
        `✅ [MP SEARCH] Pagamentos encontrados: ${searchResult.results?.length || 0}`,
      );

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
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `❌ [MP SEARCH] Erro ao buscar customers:`,
          errorData,
        );
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const searchResult = await response.json();
      this.logger.log(
        `✅ [MP SEARCH] Customers encontrados: ${searchResult.results?.length || 0}`,
      );

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

      const response = await fetch(
        'https://api.mercadopago.com/v1/identification_types',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `❌ [MP ID] Erro ao buscar tipos de identificação:`,
          errorData,
        );
        throw this.errorHandler.handleMercadoPagoError(errorData);
      }

      const idTypesResult = await response.json();
      this.logger.log(
        `✅ [MP ID] Tipos de identificação encontrados: ${idTypesResult.length}`,
      );

      return idTypesResult;
    } catch (error) {
      this.logger.error(
        `❌ [MP ID] Erro ao buscar tipos de identificação:`,
        error,
      );
      throw this.errorHandler.handleMercadoPagoError(error);
    }
  }
}
