import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { 
  studentPaymentMethods, 
  savedCards, 
  autoPaymentSettings, 
  users,
  classes,
  payments,
  studentPaymentMethodsRelations,
  savedCardsRelations,
  autoPaymentSettingsRelations
} from '../../database/schema';
// DB type will be inferred from injection
import { MercadoPagoService } from './mercadopago.service';
import {
  SaveCardDto,
  UpdateStudentPaymentMethodsDto,
  StudentPaymentMethodsResponseDto,
  ProcessClassPaymentDto,
  PaymentProcessResponseDto,
  ValidateCardDto,
  StudentPaymentHistoryDto,
  StudentPaymentStatsDto,
  AutoPaymentSettingsDto,
  RemoveCardDto,
  UpdateCardDto,
  StudentPaymentMethod,
  CardBrand,
  CardType,
} from './dto/student-payment-methods.dto';

@Injectable()
export class StudentPaymentMethodsService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    private readonly mercadoPagoService: MercadoPagoService,
  ) {}

  // Buscar métodos de pagamento do aluno
  async getStudentPaymentMethods(userId: string): Promise<StudentPaymentMethodsResponseDto> {
    // Verificar se o usuário é aluno
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || user.userType !== 'student') {
      throw new ForbiddenException('Apenas alunos podem gerenciar métodos de pagamento');
    }

    // Buscar configurações de pagamento
    let paymentMethods = await this.db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
      with: {
        savedCards: true,
        defaultCard: true,
        autoPaymentSettings: true,
      },
    });

    if (!paymentMethods) {
      // Criar configuração padrão
      paymentMethods = await this.createDefaultPaymentMethods(userId);
    }

    return this.formatPaymentMethodsResponse(paymentMethods);
  }

  // Criar configuração padrão
  private async createDefaultPaymentMethods(userId: string): Promise<any> {
    const [newPaymentMethods] = await this.db
      .insert(studentPaymentMethods)
      .values({
        userId,
        preferredMethod: StudentPaymentMethod.CREDIT_CARD,
        enableAutoPayment: false,
        canMakePayments: true,
        hasValidPaymentMethod: false,
      })
      .returning();

    return {
      ...newPaymentMethods,
      savedCards: [],
      defaultCard: null,
      autoPaymentSettings: null,
    };
  }

  // Atualizar métodos de pagamento
  async updatePaymentMethods(
    userId: string,
    updateDto: UpdateStudentPaymentMethodsDto,
  ): Promise<StudentPaymentMethodsResponseDto> {
    // Verificar se o usuário é aluno
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || user.userType !== 'student') {
      throw new ForbiddenException('Apenas alunos podem gerenciar métodos de pagamento');
    }

    const updateData: any = {
      preferredMethod: updateDto.preferredMethod,
      enableAutoPayment: updateDto.enableAutoPayment || false,
      defaultCardId: updateDto.defaultCardId,
      updatedAt: new Date(),
    };

    // Dados do Mercado Pago
    if (updateDto.mercadoPagoAccount) {
      updateData.mpEmail = updateDto.mercadoPagoAccount.email;
      updateData.mpAllowSaveCard = updateDto.mercadoPagoAccount.allowSaveCard || true;
    }

    // Verificar se tem método válido
    updateData.hasValidPaymentMethod = await this.checkValidPaymentMethod(userId, updateDto);

    // Atualizar ou criar
    const existing = await this.db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
    });

    if (existing) {
      await this.db
        .update(studentPaymentMethods)
        .set(updateData)
        .where(eq(studentPaymentMethods.userId, userId));
    } else {
      await this.db
        .insert(studentPaymentMethods)
        .values({
          userId,
          ...updateData,
        });
    }

    return this.getStudentPaymentMethods(userId);
  }

  // Verificar se tem método de pagamento válido
  private async checkValidPaymentMethod(userId: string, updateDto: UpdateStudentPaymentMethodsDto): Promise<boolean> {
    if (updateDto.preferredMethod === StudentPaymentMethod.MERCADO_PAGO) {
      return !!(updateDto.mercadoPagoAccount?.email);
    }

    if (updateDto.preferredMethod === StudentPaymentMethod.PIX) {
      return true; // PIX sempre disponível
    }

    // Para cartões, verificar se tem cartão salvo
    const cards = await this.db.query.savedCards.findMany({
      where: and(
        eq(savedCards.userId, userId),
        eq(savedCards.isActive, true)
      ),
    });

    return cards.length > 0;
  }

  // Salvar cartão
  async saveCard(userId: string, saveCardDto: SaveCardDto): Promise<{ cardId: string; message: string }> {
    // Verificar se o usuário é aluno
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || user.userType !== 'student') {
      throw new ForbiddenException('Apenas alunos podem salvar cartões');
    }

    // Validar cartão
    const validation = await this.validateCard({
      cardNumber: saveCardDto.cardNumber,
      expirationDate: saveCardDto.expirationDate,
      cvv: saveCardDto.cvv,
      cardHolderName: saveCardDto.cardHolderName,
    });

    if (!validation.isValid) {
      throw new BadRequestException(`Cartão inválido: ${validation.errors.join(', ')}`);
    }

    // Tokenizar cartão no Mercado Pago
    const cardToken = await this.tokenizeCard(saveCardDto);

    // Detectar bandeira do cartão
    const cardBrand = this.detectCardBrand(saveCardDto.cardNumber);

    // Calcular data de expiração
    const [month, year] = saveCardDto.expirationDate.split('/');
    const expiresAt = new Date(2000 + parseInt(year), parseInt(month) - 1, 1);

    // Se for definir como padrão, remover padrão dos outros
    if (saveCardDto.setAsDefault) {
      await this.db
        .update(savedCards)
        .set({ isDefault: false })
        .where(eq(savedCards.userId, userId));
    }

    // Salvar cartão
    const [savedCard] = await this.db
      .insert(savedCards)
      .values({
        userId,
        mpCardToken: cardToken,
        cardBrand,
        cardType: saveCardDto.cardType,
        lastFourDigits: saveCardDto.cardNumber.slice(-4),
        expirationMonth: month,
        expirationYear: year,
        cardHolderName: saveCardDto.cardHolderName,
        nickname: saveCardDto.nickname,
        isDefault: saveCardDto.setAsDefault || false,
        expiresAt,
      })
      .returning();

    // Atualizar método de pagamento padrão se necessário
    if (saveCardDto.setAsDefault) {
      await this.db
        .update(studentPaymentMethods)
        .set({
          defaultCardId: savedCard.id,
          hasValidPaymentMethod: true,
        })
        .where(eq(studentPaymentMethods.userId, userId));
    }

    return {
      cardId: savedCard.id,
      message: 'Cartão salvo com sucesso',
    };
  }

  // Tokenizar cartão no Mercado Pago
  private async tokenizeCard(cardDto: SaveCardDto): Promise<string> {
    try {
      // Aqui você integraria com a API do Mercado Pago para tokenizar
      // Por enquanto, retornamos um token simulado
      const mockToken = `card_token_${Date.now()}`;
      
      // TODO: Implementar tokenização real
      // const token = await this.mercadoPagoService.createCardToken({
      //   cardNumber: cardDto.cardNumber,
      //   expirationMonth: cardDto.expirationDate.split('/')[0],
      //   expirationYear: cardDto.expirationDate.split('/')[1],
      //   securityCode: cardDto.cvv,
      //   cardholderName: cardDto.cardHolderName,
      // });

      return mockToken;
    } catch (error) {
      throw new BadRequestException('Erro ao processar cartão. Verifique os dados.');
    }
  }

  // Detectar bandeira do cartão
  private detectCardBrand(cardNumber: string): CardBrand {
    const number = cardNumber.replace(/\s/g, '');
    
    if (/^4/.test(number)) return CardBrand.VISA;
    if (/^5[1-5]/.test(number)) return CardBrand.MASTERCARD;
    if (/^2[2-7]/.test(number)) return CardBrand.MASTERCARD; // Mastercard 2-series
    if (/^3[47]/.test(number)) return CardBrand.AMERICAN_EXPRESS;
    if (/^6(?:011|5)/.test(number)) return CardBrand.ELO;
    if (/^60/.test(number)) return CardBrand.HIPERCARD;
    if (/^3[0689]/.test(number)) return CardBrand.DINERS;
    
    return CardBrand.VISA; // Padrão para cartões não reconhecidos
  }

  // Validar cartão
  async validateCard(validateDto: ValidateCardDto): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validar número do cartão (algoritmo de Luhn)
    if (!this.validateCardNumber(validateDto.cardNumber)) {
      errors.push('Número do cartão inválido');
    }

    // Validar data de expiração
    const [month, year] = validateDto.expirationDate.split('/');
    const expDate = new Date(2000 + parseInt(year), parseInt(month) - 1, 1);
    const now = new Date();
    
    if (expDate <= now) {
      errors.push('Cartão expirado');
    }

    // Validar CVV
    if (!/^\d{3,4}$/.test(validateDto.cvv)) {
      errors.push('CVV inválido');
    }

    // Validar nome
    if (validateDto.cardHolderName.length < 2) {
      errors.push('Nome do portador muito curto');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Algoritmo de Luhn para validar número do cartão
  private validateCardNumber(cardNumber: string): boolean {
    const number = cardNumber.replace(/\s/g, '');
    let sum = 0;
    let isEven = false;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number.charAt(i));

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  // Processar pagamento de aula
  async processClassPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
  ): Promise<PaymentProcessResponseDto> {
    // Verificar se a aula existe
    const classData = await this.db.query.classes.findFirst({
      where: eq(classes.id, processDto.classId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!classData) {
      throw new NotFoundException('Aula não encontrada');
    }

    if (classData.studentId !== userId) {
      throw new ForbiddenException('Você não pode pagar por esta aula');
    }

    // Verificar se já existe pagamento
    const existingPayment = await this.db.query.payments.findFirst({
      where: eq(payments.classId, processDto.classId),
    });

    if (existingPayment) {
      throw new BadRequestException('Esta aula já possui um pagamento');
    }

    // Processar pagamento baseado no método
    switch (processDto.paymentMethod) {
      case StudentPaymentMethod.CREDIT_CARD:
      case StudentPaymentMethod.DEBIT_CARD:
        return this.processCardPayment(userId, processDto, classData);
      
      case StudentPaymentMethod.MERCADO_PAGO:
        return this.processMercadoPagoPayment(userId, processDto, classData);
      
      case StudentPaymentMethod.PIX:
        return this.processPixPayment(userId, processDto, classData);
      
      default:
        throw new BadRequestException('Método de pagamento não suportado');
    }
  }

  // Processar pagamento com cartão
  private async processCardPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
    classData: any,
  ): Promise<PaymentProcessResponseDto> {
    let cardToken: string;
    let cardInfo: any;

    if (processDto.cardId) {
      // Usar cartão salvo
      const savedCard = await this.db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.id, processDto.cardId),
          eq(savedCards.userId, userId),
          eq(savedCards.isActive, true)
        ),
      });

      if (!savedCard) {
        throw new NotFoundException('Cartão não encontrado');
      }

      cardToken = savedCard.mpCardToken;
      cardInfo = {
        lastFourDigits: savedCard.lastFourDigits,
        cardBrand: savedCard.cardBrand,
        wasCardSaved: false,
        cardId: savedCard.id,
      };

      // Atualizar uso do cartão
      await this.db
        .update(savedCards)
        .set({
          timesUsed: savedCard.timesUsed + 1,
          lastUsedAt: new Date(),
        })
        .where(eq(savedCards.id, savedCard.id));

    } else if (processDto.cardData) {
      // Usar cartão novo
      cardToken = await this.tokenizeCard(processDto.cardData);
      cardInfo = {
        lastFourDigits: processDto.cardData.cardNumber.slice(-4),
        cardBrand: this.detectCardBrand(processDto.cardData.cardNumber),
        wasCardSaved: false,
      };

      // Salvar cartão se solicitado
      if (processDto.saveCard) {
        const savedCardResult = await this.saveCard(userId, {
          ...processDto.cardData,
          nickname: processDto.cardNickname,
        });
        cardInfo.wasCardSaved = true;
        cardInfo.cardId = savedCardResult.cardId;
      }
    } else {
      throw new BadRequestException('Dados do cartão são obrigatórios');
    }

    // Criar pagamento no sistema (será processado pelo webhook)
    const amount = 100; // TODO: Pegar valor real da aula
    const platformFee = amount * 0.10;
    const personalAmount = amount - platformFee;

    const [newPayment] = await this.db
      .insert(payments)
      .values({
        classId: processDto.classId,
        studentId: userId,
        personalId: classData.personalId,
        totalAmount: amount.toString(),
        platformFee: platformFee.toString(),
        personalAmount: personalAmount.toString(),
        status: 'pending',
        type: 'class_payment',
      })
      .returning();

    // TODO: Processar pagamento real no Mercado Pago
    const mockMpPayment = {
      id: 'mp_payment_' + Date.now(),
      status: 'approved',
      status_detail: 'accredited',
    };

    return {
      success: true,
      paymentId: newPayment.id,
      mpPaymentId: mockMpPayment.id,
      status: mockMpPayment.status,
      statusDetail: mockMpPayment.status_detail,
      transactionAmount: amount,
      installments: parseInt(processDto.installments || '1'),
      cardInfo,
      message: 'Pagamento processado com sucesso',
      createdAt: new Date(),
    };
  }

  // Processar pagamento com Mercado Pago
  private async processMercadoPagoPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
    classData: any,
  ): Promise<PaymentProcessResponseDto> {
    // Buscar configurações do MP do aluno
    const paymentMethods = await this.db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
    });

    if (!paymentMethods?.mpEmail) {
      throw new BadRequestException('Configure sua conta do Mercado Pago primeiro');
    }

    // Criar preferência de pagamento
    const amount = 100; // TODO: Pegar valor real da aula
    const preference = await this.mercadoPagoService.createPreference({
      classId: processDto.classId,
      title: `Aula ${classData.location} - ${classData.date.toLocaleDateString()}`,
      totalAmount: amount,
      platformFee: amount * 0.10,
      personalAmount: amount * 0.90,
      studentEmail: classData.student.email,
      personalEmail: classData.personal.email,
      externalReference: `class_${processDto.classId}_${Date.now()}`,
    });

    return {
      success: true,
      paymentId: `pending_${Date.now()}`,
      mpPreferenceId: preference.id,
      checkoutUrl: preference.initPoint,
      status: 'pending',
      transactionAmount: amount,
      successUrl: `${process.env.FRONTEND_URL}/payment/success`,
      failureUrl: `${process.env.FRONTEND_URL}/payment/failure`,
      pendingUrl: `${process.env.FRONTEND_URL}/payment/pending`,
      message: 'Redirecionando para o checkout do Mercado Pago',
      createdAt: new Date(),
    };
  }

  // Processar pagamento via PIX
  private async processPixPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
    classData: any,
  ): Promise<PaymentProcessResponseDto> {
    // TODO: Implementar geração de PIX via Mercado Pago
    const amount = 100;
    const mockQrCode = 'pix_qr_code_' + Date.now();

    return {
      success: true,
      paymentId: `pix_${Date.now()}`,
      status: 'pending',
      transactionAmount: amount,
      qrCode: mockQrCode,
      qrCodeBase64: Buffer.from(mockQrCode).toString('base64'),
      message: 'PIX gerado com sucesso. Escaneie o QR Code para pagar.',
      createdAt: new Date(),
    };
  }

  // Remover cartão
  async removeCard(userId: string, removeDto: RemoveCardDto): Promise<{ message: string }> {
    const card = await this.db.query.savedCards.findFirst({
      where: and(
        eq(savedCards.id, removeDto.cardId),
        eq(savedCards.userId, userId)
      ),
    });

    if (!card) {
      throw new NotFoundException('Cartão não encontrado');
    }

    // Desativar cartão em vez de deletar (para histórico)
    await this.db
      .update(savedCards)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(savedCards.id, removeDto.cardId));

    // Se era o cartão padrão, remover da configuração
    if (card.isDefault) {
      await this.db
        .update(studentPaymentMethods)
        .set({
          defaultCardId: null,
          hasValidPaymentMethod: false,
        })
        .where(eq(studentPaymentMethods.userId, userId));
    }

    return { message: 'Cartão removido com sucesso' };
  }

  // Formatar resposta
  private formatPaymentMethodsResponse(data: any): StudentPaymentMethodsResponseDto {
    const activeSavedCards = (data.savedCards || [])
      .filter((card: any) => Boolean(card.isActive))
      .map((card: any) => ({
        id: card.id,
        nickname: card.nickname,
        cardBrand: card.cardBrand,
        cardType: card.cardType,
        lastFourDigits: card.lastFourDigits,
        expirationMonth: card.expirationMonth,
        expirationYear: card.expirationYear,
        cardHolderName: card.cardHolderName,
        isDefault: Boolean(card.isDefault),
        isActive: Boolean(card.isActive),
        createdAt: card.createdAt,
      }));

    const missingSetup: string[] = [];
    if (data.preferredMethod === StudentPaymentMethod.MERCADO_PAGO && !data.mpEmail) {
      missingSetup.push('Email do Mercado Pago');
    }
    if ([StudentPaymentMethod.CREDIT_CARD, StudentPaymentMethod.DEBIT_CARD].includes(data.preferredMethod) && activeSavedCards.length === 0) {
      missingSetup.push('Cartão salvo');
    }

    return {
      id: data.id,
      userId: data.userId,
      preferredMethod: data.preferredMethod,
      enableAutoPayment: Boolean(data.enableAutoPayment),
      defaultCardId: data.defaultCardId,
      savedCards: activeSavedCards,
      mercadoPagoAccount: data.mpEmail ? {
        email: this.maskEmail(data.mpEmail),
        isVerified: Boolean(data.mpIsVerified),
        allowSaveCard: Boolean(data.mpAllowSaveCard),
      } : undefined,
      canMakePayments: Boolean(data.canMakePayments),
      hasValidPaymentMethod: Boolean(data.hasValidPaymentMethod),
      missingSetup,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  // Mascarar email
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }
}
