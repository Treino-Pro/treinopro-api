import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import {
  autoPaymentSettings,
  payments,
  savedCards,
  studentPaymentMethods,
  users,
} from '../../database/schema';
import { db } from '../../database/connection';
import { StripeCustomersService } from './stripe-customers.service';
import {
  CardBrand,
  CardType,
  ConfirmStripeSetupIntentDto,
  PaymentProcessResponseDto,
  ProcessClassPaymentDto,
  RemoveCardDto,
  SaveCardDto,
  StudentPaymentMethod,
  StudentPaymentMethodsResponseDto,
  UpdateStudentPaymentMethodsDto,
  ValidateCardDto,
} from './dto/student-payment-methods.dto';

@Injectable()
export class StudentPaymentMethodsService {
  constructor(
    private readonly stripeCustomersService: StripeCustomersService,
  ) {}

  private getStripePublishableKey(): string {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
    if (!publishableKey.trim()) {
      throw new BadRequestException('Chave publicavel Stripe nao configurada');
    }

    return publishableKey;
  }

  private normalizeStripeCardBrand(brand?: string | null): CardBrand {
    switch ((brand || '').toLowerCase()) {
      case 'visa':
        return CardBrand.VISA;
      case 'mastercard':
        return CardBrand.MASTERCARD;
      case 'amex':
      case 'american_express':
        return CardBrand.AMERICAN_EXPRESS;
      case 'elo':
        return CardBrand.ELO;
      case 'hipercard':
        return CardBrand.HIPERCARD;
      case 'diners':
      case 'diners_club':
        return CardBrand.DINERS;
      default:
        return CardBrand.VISA;
    }
  }

  private assertStripePaymentMethod(method?: StudentPaymentMethod | string) {
    if (
      method &&
      method !== StudentPaymentMethod.CREDIT_CARD &&
      method !== StudentPaymentMethod.DEBIT_CARD
    ) {
      throw new BadRequestException(
        'Metodo de pagamento removido. Use cartao via Stripe.',
      );
    }
  }

  async ensureStripeCustomerForStudent(userId: string): Promise<string> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (user.userType !== 'student') {
      throw new ForbiddenException(
        'Apenas alunos podem gerenciar metodos de pagamento',
      );
    }

    let paymentMethods = await db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
    });

    if (!paymentMethods) {
      paymentMethods = await this.createDefaultPaymentMethods(userId);
    }

    if (paymentMethods.stripeCustomerId) {
      return paymentMethods.stripeCustomerId;
    }

    const customer = await this.stripeCustomersService.createCustomer({
      email: user.email || undefined,
      name:
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
      metadata: {
        userId,
        userType: 'student',
      },
    });

    await db
      .update(studentPaymentMethods)
      .set({
        stripeCustomerId: customer.id,
        updatedAt: new Date(),
      })
      .where(eq(studentPaymentMethods.userId, userId));

    return customer.id;
  }

  async createStripeCustomerSession(userId: string): Promise<{
    customerId: string;
    customerEphemeralKeySecret: string;
    publishableKey: string;
  }> {
    const customerId = await this.ensureStripeCustomerForStudent(userId);
    const ephemeralKey =
      await this.stripeCustomersService.createEphemeralKey(customerId);

    return {
      customerId,
      customerEphemeralKeySecret: ephemeralKey.secret,
      publishableKey: this.getStripePublishableKey(),
    };
  }

  async createStripeSetupIntent(userId: string): Promise<{
    customerId: string;
    setupIntentId: string;
    clientSecret: string;
    ephemeralKeySecret: string;
    publishableKey: string;
  }> {
    const customerId = await this.ensureStripeCustomerForStudent(userId);
    const [ephemeralKey, setupIntent] = await Promise.all([
      this.stripeCustomersService.createEphemeralKey(customerId),
      this.stripeCustomersService.createSetupIntent({
        customerId,
        metadata: {
          userId,
          purpose: 'student_saved_card',
        },
      }),
    ]);

    return {
      customerId,
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret,
      ephemeralKeySecret: ephemeralKey.secret,
      publishableKey: this.getStripePublishableKey(),
    };
  }

  async saveStripeSetupIntentPaymentMethod(
    userId: string,
    input: ConfirmStripeSetupIntentDto,
  ): Promise<any> {
    const customerId = await this.ensureStripeCustomerForStudent(userId);
    let paymentMethodId = input.paymentMethodId;

    if (input.setupIntentId) {
      const setupIntent = await this.stripeCustomersService.retrieveSetupIntent(
        input.setupIntentId,
      );

      const setupIntentCustomer =
        typeof setupIntent.customer === 'string'
          ? setupIntent.customer
          : setupIntent.customer?.id;

      if (setupIntentCustomer && setupIntentCustomer !== customerId) {
        throw new BadRequestException(
          'SetupIntent nao pertence ao aluno autenticado',
        );
      }

      if (setupIntent.status !== 'succeeded') {
        throw new BadRequestException(
          `SetupIntent ainda nao foi concluido (${setupIntent.status})`,
        );
      }

      paymentMethodId =
        typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;
    }

    if (!paymentMethodId) {
      throw new BadRequestException('PaymentMethod Stripe nao informado');
    }

    const paymentMethod =
      await this.stripeCustomersService.retrievePaymentMethod(paymentMethodId);

    if (paymentMethod.type !== 'card' || !paymentMethod.card) {
      throw new BadRequestException('Metodo de pagamento Stripe nao e cartao');
    }

    const attachedCustomer =
      typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : paymentMethod.customer?.id;

    if (attachedCustomer && attachedCustomer !== customerId) {
      throw new BadRequestException(
        'Cartao Stripe nao pertence ao aluno autenticado',
      );
    }

    if (!attachedCustomer) {
      await this.stripeCustomersService.attachPaymentMethod(
        customerId,
        paymentMethodId,
      );
    }

    const existingCard = await db.query.savedCards.findFirst({
      where: and(
        eq(savedCards.userId, userId),
        eq(savedCards.stripePaymentMethodId, paymentMethodId),
      ),
    });

    const activeCards = await db.query.savedCards.findMany({
      where: and(eq(savedCards.userId, userId), eq(savedCards.isActive, true)),
    });
    const shouldSetDefault =
      Boolean(input.setAsDefault) || activeCards.length === 0;

    if (shouldSetDefault) {
      await db
        .update(savedCards)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(savedCards.userId, userId));
    }

    const card = paymentMethod.card;
    const cardValues = {
      userId,
      stripePaymentMethodId: paymentMethodId,
      cardBrand: this.normalizeStripeCardBrand(card.brand),
      cardType: input.cardType || CardType.CREDIT,
      lastFourDigits: card.last4,
      expirationMonth: String(card.exp_month).padStart(2, '0'),
      expirationYear: String(card.exp_year).slice(-2),
      cardHolderName:
        paymentMethod.billing_details?.name ||
        paymentMethod.billing_details?.email ||
        'Titular do cartao',
      nickname: input.nickname,
      isDefault: shouldSetDefault,
      isActive: true,
      updatedAt: new Date(),
      expiresAt: new Date(card.exp_year, card.exp_month, 0),
    };

    const [savedCard] = existingCard
      ? await db
          .update(savedCards)
          .set(cardValues)
          .where(eq(savedCards.id, existingCard.id))
          .returning()
      : await db
          .insert(savedCards)
          .values({
            ...cardValues,
            createdAt: new Date(),
          })
          .returning();

    await db
      .update(studentPaymentMethods)
      .set({
        stripeCustomerId: customerId,
        preferredMethod:
          savedCard.cardType === CardType.DEBIT
            ? StudentPaymentMethod.DEBIT_CARD
            : StudentPaymentMethod.CREDIT_CARD,
        defaultCardId: shouldSetDefault ? savedCard.id : undefined,
        hasValidPaymentMethod: true,
        canMakePayments: true,
        updatedAt: new Date(),
      })
      .where(eq(studentPaymentMethods.userId, userId));

    return this.formatSavedCard(savedCard);
  }

  async getStudentPaymentMethodsSimple(userId: string): Promise<any> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return {
      success: true,
      userId,
      userType: user.userType,
      provider: 'stripe',
      timestamp: new Date().toISOString(),
    };
  }

  async getStudentPaymentMethods(
    userId: string,
  ): Promise<StudentPaymentMethodsResponseDto> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (user.userType !== 'student') {
      throw new ForbiddenException(
        'Apenas alunos podem gerenciar metodos de pagamento',
      );
    }

    let paymentMethods = await db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
      with: {
        savedCards: true,
        defaultCard: true,
        autoPaymentSettings: true,
      },
    });

    if (!paymentMethods) {
      paymentMethods = await this.createDefaultPaymentMethods(userId);
    }

    return this.formatPaymentMethodsResponse(paymentMethods);
  }

  async updateStudentPaymentMethods(
    userId: string,
    updateData: {
      preferredMethod?: string;
      enableAutoPayment?: boolean;
      defaultCardId?: string;
    },
  ): Promise<StudentPaymentMethodsResponseDto> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || user.userType !== 'student') {
      throw new ForbiddenException(
        'Apenas alunos podem gerenciar metodos de pagamento',
      );
    }

    this.assertStripePaymentMethod(updateData.preferredMethod);

    let paymentMethods = await db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
    });

    if (!paymentMethods) {
      paymentMethods = await this.createDefaultPaymentMethods(userId);
    }

    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (updateData.preferredMethod) {
      updateValues.preferredMethod =
        updateData.preferredMethod as StudentPaymentMethod;
    }

    if (updateData.enableAutoPayment !== undefined) {
      updateValues.enableAutoPayment = updateData.enableAutoPayment;
    }

    if (updateData.defaultCardId) {
      const targetCard = await db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.id, updateData.defaultCardId),
          eq(savedCards.userId, userId),
          eq(savedCards.isActive, true),
        ),
      });

      if (!targetCard) {
        throw new NotFoundException('Cartao nao encontrado');
      }

      await db
        .update(savedCards)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(savedCards.userId, userId),
            ne(savedCards.id, updateData.defaultCardId),
          ),
        );

      await db
        .update(savedCards)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(savedCards.id, updateData.defaultCardId));

      updateValues.defaultCardId = updateData.defaultCardId;
      updateValues.hasValidPaymentMethod = true;
      updateValues.canMakePayments = true;
    }

    await db
      .update(studentPaymentMethods)
      .set(updateValues)
      .where(eq(studentPaymentMethods.userId, userId));

    return this.getStudentPaymentMethods(userId);
  }

  async updatePaymentMethods(
    userId: string,
    updateDto: UpdateStudentPaymentMethodsDto,
  ): Promise<StudentPaymentMethodsResponseDto> {
    return this.updateStudentPaymentMethods(userId, {
      preferredMethod: updateDto.preferredMethod,
      enableAutoPayment: updateDto.enableAutoPayment,
      defaultCardId: updateDto.defaultCardId,
    });
  }

  async saveCard(
    _userId: string,
    _saveCardDto: SaveCardDto,
  ): Promise<{ cardId: string; message: string }> {
    throw new BadRequestException(
      'Salvamento direto de cartao foi removido. Use Stripe SetupIntent.',
    );
  }

  async validateCard(
    validateDto: ValidateCardDto,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.validateCardNumber(validateDto.cardNumber)) {
      errors.push('Numero do cartao invalido');
    }

    const [month, year] = validateDto.expirationDate.split('/');
    const expDate = new Date(2000 + parseInt(year, 10), parseInt(month, 10), 0);
    if (expDate <= new Date()) {
      errors.push('Cartao expirado');
    }

    if (!/^\d{3,4}$/.test(validateDto.cvv)) {
      errors.push('CVV invalido');
    }

    if ((validateDto.cardHolderName || '').trim().length < 2) {
      errors.push('Nome do portador muito curto');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async processProposalPayment(
    _userId: string,
    _processDto: ProcessClassPaymentDto,
    _proposalData: any,
  ): Promise<PaymentProcessResponseDto> {
    throw new BadRequestException(
      'Pagamento de proposta deve ser criado como PaymentIntent Stripe.',
    );
  }

  async processClassPayment(
    _userId: string,
    _processDto: ProcessClassPaymentDto,
  ): Promise<PaymentProcessResponseDto> {
    throw new BadRequestException(
      'Pagamento de aula deve ser criado como PaymentIntent Stripe.',
    );
  }

  async removeCard(
    userId: string,
    removeDto: RemoveCardDto,
  ): Promise<{ message: string }> {
    const card = await db.query.savedCards.findFirst({
      where: and(
        eq(savedCards.id, removeDto.cardId),
        eq(savedCards.userId, userId),
      ),
    });

    if (!card) {
      throw new NotFoundException('Cartao nao encontrado');
    }

    if (card.stripePaymentMethodId) {
      await this.stripeCustomersService.detachPaymentMethod(
        card.stripePaymentMethodId,
      );
    }

    await db
      .update(savedCards)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(savedCards.id, removeDto.cardId));

    if (card.isDefault) {
      const replacement = await db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.userId, userId),
          eq(savedCards.isActive, true),
          ne(savedCards.id, removeDto.cardId),
        ),
      });

      await db
        .update(studentPaymentMethods)
        .set({
          defaultCardId: replacement?.id ?? null,
          hasValidPaymentMethod: Boolean(replacement),
          updatedAt: new Date(),
        })
        .where(eq(studentPaymentMethods.userId, userId));
    }

    return { message: 'Cartao removido com sucesso' };
  }

  async getCustomerCards(userId: string): Promise<any[]> {
    const userCards = await db.query.savedCards.findMany({
      where: and(eq(savedCards.userId, userId), eq(savedCards.isActive, true)),
      orderBy: (cards, { desc }) => [desc(cards.createdAt)],
    });

    return userCards.map((card) => this.formatSavedCard(card));
  }

  async updateCard(
    userId: string,
    cardId: string,
    updateData: {
      nickname?: string;
      cardholderName?: string;
    },
  ): Promise<{ message: string }> {
    const card = await db.query.savedCards.findFirst({
      where: and(
        eq(savedCards.id, cardId),
        eq(savedCards.userId, userId),
        eq(savedCards.isActive, true),
      ),
    });

    if (!card) {
      throw new NotFoundException('Cartao nao encontrado');
    }

    await db
      .update(savedCards)
      .set({
        nickname: updateData.nickname ?? card.nickname,
        cardHolderName: updateData.cardholderName ?? card.cardHolderName,
        updatedAt: new Date(),
      })
      .where(eq(savedCards.id, cardId));

    return { message: 'Cartao atualizado com sucesso' };
  }

  private async createDefaultPaymentMethods(userId: string): Promise<any> {
    const [newPaymentMethods] = await db
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

  private validateCardNumber(cardNumber: string): boolean {
    const number = String(cardNumber || '').replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(number)) return false;

    let sum = 0;
    let isEven = false;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  private formatSavedCard(card: any) {
    return {
      id: card.id,
      type: card.cardType === CardType.DEBIT ? 'debit_card' : 'credit_card',
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
      updatedAt: card.updatedAt,
    };
  }

  private formatPaymentMethodsResponse(
    data: any,
  ): StudentPaymentMethodsResponseDto {
    const activeSavedCards = (data.savedCards || [])
      .filter((card: any) => Boolean(card.isActive))
      .map((card: any) => this.formatSavedCard(card));
    const hasValidPaymentMethod = activeSavedCards.length > 0;
    const missingSetup = hasValidPaymentMethod ? [] : ['Cartao Stripe salvo'];

    return {
      id: data.id,
      userId: data.userId,
      preferredMethod:
        data.preferredMethod === StudentPaymentMethod.DEBIT_CARD
          ? StudentPaymentMethod.DEBIT_CARD
          : StudentPaymentMethod.CREDIT_CARD,
      enableAutoPayment: Boolean(data.enableAutoPayment),
      defaultCardId: data.defaultCardId,
      savedCards: activeSavedCards,
      canMakePayments: Boolean(data.canMakePayments),
      hasValidPaymentMethod,
      missingSetup,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
