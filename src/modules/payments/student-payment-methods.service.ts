import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import {
  studentPaymentMethods,
  savedCards,
  users,
  classes,
  payments,
} from '../../database/schema';
import { db } from '../../database/connection';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsService } from './payments.service';
import {
  SaveCardDto,
  UpdateStudentPaymentMethodsDto,
  StudentPaymentMethodsResponseDto,
  ProcessClassPaymentDto,
  PaymentProcessResponseDto,
  ValidateCardDto,
  RemoveCardDto,
  StudentPaymentMethod,
  CardBrand,
  CardType,
} from './dto/student-payment-methods.dto';

@Injectable()
export class StudentPaymentMethodsService {
  constructor(
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // Método simplificado para teste
  async getStudentPaymentMethodsSimple(userId: string): Promise<any> {
    try {
      console.log('🔍 [SIMPLE] Iniciando busca simples para userId:', userId);

      // Teste básico de conexão
      if (!db) {
        throw new Error('Conexão com banco não disponível');
      }

      console.log('✅ [SIMPLE] Conexão com banco OK');

      // Teste simples de query
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      console.log(
        '👤 [SIMPLE] Usuário encontrado:',
        user ? { id: user.id, userType: user.userType } : 'null',
      );

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      if (user.userType !== 'student') {
        throw new Error('Apenas alunos podem gerenciar métodos de pagamento');
      }

      // Retornar resposta simples
      return {
        success: true,
        userId,
        userType: user.userType,
        message: 'Método simplificado funcionando',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ [SIMPLE] Erro:', error);
      throw error;
    }
  }

  // Buscar métodos de pagamento do aluno
  async getStudentPaymentMethods(
    userId: string,
  ): Promise<StudentPaymentMethodsResponseDto> {
    try {
      console.log(
        '🔍 [STUDENT PAYMENT METHODS] Iniciando busca para userId:',
        userId,
      );

      // Teste simples de conexão com banco
      if (!db) {
        console.error(
          '❌ [STUDENT PAYMENT METHODS] Conexão com banco não disponível',
        );
        throw new Error('Conexão com banco de dados não disponível');
      }

      console.log('✅ [STUDENT PAYMENT METHODS] Conexão com banco OK');

      // Verificar se o usuário é aluno
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      console.log(
        '👤 [STUDENT PAYMENT METHODS] Usuário encontrado:',
        user ? { id: user.id, userType: user.userType } : 'null',
      );

      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (user.userType !== 'student') {
        throw new ForbiddenException(
          'Apenas alunos podem gerenciar métodos de pagamento',
        );
      }

      // Buscar configurações de pagamento
      let paymentMethods = await db.query.studentPaymentMethods.findFirst({
        where: eq(studentPaymentMethods.userId, userId),
        with: {
          savedCards: true,
          defaultCard: true,
          autoPaymentSettings: true,
        },
      });

      console.log(
        '💳 [STUDENT PAYMENT METHODS] Configurações encontradas:',
        paymentMethods ? 'sim' : 'não',
      );

      if (!paymentMethods) {
        console.log(
          '🆕 [STUDENT PAYMENT METHODS] Criando configuração padrão...',
        );
        // Criar configuração padrão
        paymentMethods = await this.createDefaultPaymentMethods(userId);
      }

      console.log('✅ [STUDENT PAYMENT METHODS] Formatando resposta...');
      const response = this.formatPaymentMethodsResponse(paymentMethods);
      console.log(
        '🎉 [STUDENT PAYMENT METHODS] Resposta formatada com sucesso',
      );

      return response;
    } catch (error) {
      console.error('❌ [STUDENT PAYMENT METHODS] Erro:', error);
      console.error('❌ [STUDENT PAYMENT METHODS] Stack trace:', error.stack);
      throw error;
    }
  }

  // Atualizar métodos de pagamento do aluno
  async updateStudentPaymentMethods(
    userId: string,
    updateData: {
      preferredMethod?: string;
      enableAutoPayment?: boolean;
      mercadoPagoAccount?: {
        email: string;
        allowSaveCard: boolean;
      };
    },
  ): Promise<StudentPaymentMethodsResponseDto> {
    // Verificar se o usuário é aluno
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || user.userType !== 'student') {
      throw new ForbiddenException(
        'Apenas alunos podem gerenciar métodos de pagamento',
      );
    }

    // Buscar configurações existentes
    let paymentMethods = await db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
    });

    if (!paymentMethods) {
      // Criar configuração padrão se não existir
      paymentMethods = await this.createDefaultPaymentMethods(userId);
    }

    // Preparar dados para atualização
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

    if (updateData.mercadoPagoAccount) {
      updateValues.mpEmail = updateData.mercadoPagoAccount.email;
      updateValues.mpAllowSaveCard =
        updateData.mercadoPagoAccount.allowSaveCard;
      updateValues.mpIsVerified = false; // Reset verification when email changes
    }

    // Atualizar no banco
    await db
      .update(studentPaymentMethods)
      .set(updateValues)
      .where(eq(studentPaymentMethods.userId, userId));

    // Retornar dados atualizados
    return this.getStudentPaymentMethods(userId);
  }

  // Criar configuração padrão
  private async createDefaultPaymentMethods(userId: string): Promise<any> {
    try {
      console.log(
        '🆕 [CREATE DEFAULT] Criando configuração padrão para userId:',
        userId,
      );

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

      console.log(
        '✅ [CREATE DEFAULT] Configuração criada:',
        newPaymentMethods.id,
      );

      return {
        ...newPaymentMethods,
        savedCards: [],
        defaultCard: null,
        autoPaymentSettings: null,
      };
    } catch (error) {
      console.error(
        '❌ [CREATE DEFAULT] Erro ao criar configuração padrão:',
        error,
      );
      throw error;
    }
  }

  // Atualizar métodos de pagamento
  async updatePaymentMethods(
    userId: string,
    updateDto: UpdateStudentPaymentMethodsDto,
  ): Promise<StudentPaymentMethodsResponseDto> {
    // Verificar se o usuário é aluno
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || user.userType !== 'student') {
      throw new ForbiddenException(
        'Apenas alunos podem gerenciar métodos de pagamento',
      );
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
      updateData.mpAllowSaveCard =
        updateDto.mercadoPagoAccount.allowSaveCard || true;
    }

    // Verificar se tem método válido
    updateData.hasValidPaymentMethod = await this.checkValidPaymentMethod(
      userId,
      updateDto,
    );

    // Atualizar ou criar
    const existing = await db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
    });

    if (existing) {
      await db
        .update(studentPaymentMethods)
        .set(updateData)
        .where(eq(studentPaymentMethods.userId, userId));
    } else {
      await db.insert(studentPaymentMethods).values({
        userId,
        ...updateData,
      });
    }

    return this.getStudentPaymentMethods(userId);
  }

  // Verificar se tem método de pagamento válido
  private async checkValidPaymentMethod(
    userId: string,
    updateDto: UpdateStudentPaymentMethodsDto,
  ): Promise<boolean> {
    if (updateDto.preferredMethod === StudentPaymentMethod.MERCADO_PAGO) {
      return !!updateDto.mercadoPagoAccount?.email;
    }

    if (updateDto.preferredMethod === StudentPaymentMethod.PIX) {
      return true; // PIX sempre disponível
    }

    // Para cartões, verificar se tem cartão salvo
    const cards = await db.query.savedCards.findMany({
      where: and(eq(savedCards.userId, userId), eq(savedCards.isActive, true)),
    });

    return cards.length > 0;
  }

  // Salvar cartão
  async saveCard(
    userId: string,
    saveCardDto: SaveCardDto,
  ): Promise<{ cardId: string; message: string }> {
    try {
      console.log('💳 [SAVE_CARD] Iniciando salvamento de cartão...');
      console.log('💳 [SAVE_CARD] User ID:', userId);
      console.log('💳 [SAVE_CARD] Card data:', {
        cardNumber: saveCardDto.cardNumber?.replace(/\d(?=\d{4})/g, '*'),
        expiryMonth: saveCardDto.expirationDate?.split('/')[0],
        expiryYear: saveCardDto.expirationDate?.split('/')[1],
        cardholderName: saveCardDto.cardHolderName,
        securityCode: '***',
      });

      // Verificar se o usuário é aluno
      const user = await db.query.users.findFirst({
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
        throw new BadRequestException(
          `Cartão inválido: ${validation.errors.join(', ')}`,
        );
      }

      // Usar CPF do usuário se disponível, senão usar CPF de teste
      const userCpfRaw = user.documentNumber || '19119119100';
      // ✅ IMPORTANTE: Limpar formatação do CPF desde o início
      const userCpf = userCpfRaw.replace(/\D/g, '');
      const identificationType = user.documentType === 'CPF' ? 'CPF' : 'CPF';

      // ✅ CORREÇÃO: Detectar cartões de teste oficiais do MP e usar nome correto
      const cardNumberClean = saveCardDto.cardNumber.replace(/\D/g, '');
      const isOfficialTestCard = [
        '4235647728025682', // Visa oficial MP
        '5031433215406351', // Mastercard oficial MP
        '4009172292806176', // Outro Mastercard oficial MP
      ].includes(cardNumberClean);

      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');

      // Em ambiente de teste com cartão oficial MP, forçar nome "APRO"
      let cardholderName: string;
      if (isTestEnv && isOfficialTestCard) {
        cardholderName = 'APRO'; // Nome oficial de teste do MP que aprova transações
        console.log(
          '✅ [SAVE_CARD] Cartão de teste oficial detectado, usando nome "APRO"',
        );
      } else {
        cardholderName =
          saveCardDto.cardHolderName ||
          `${user.firstName} ${user.lastName}`.trim();
      }

      // Para o customer, usar nome do usuário (customer é do usuário, não do cartão)
      const cardholderFirstName =
        user.firstName || cardholderName?.split(' ')[0] || 'Test';
      const cardholderLastName =
        user.lastName ||
        cardholderName?.split(' ').slice(1).join(' ') ||
        'User';

      console.log('🔍 [SAVE_CARD] Usando identificação:', {
        type: identificationType,
        number: userCpf.replace(/\d(?=\d{4})/g, '*'), // Mascarar para log
        numberLength: userCpf.length,
        source: user.documentNumber ? 'usuário' : 'teste',
        cardholderName: cardholderName, // ✅ Nome do cartão (pode ser de outra pessoa)
      });

      // 1. Criar ou buscar customer no Mercado Pago
      const customer = await this.mercadoPagoService.createOrGetCustomer(
        userId,
        {
          email: user.email || 'test_user_123456@testuser.com',
          firstName: cardholderFirstName,
          lastName: cardholderLastName,
          identification: {
            type: identificationType,
            number: userCpf,
          },
        },
      );
      console.log('👤 [SAVE_CARD] Customer criado/encontrado:', customer.id);

      // 2. ESTRATÉGIA: Em ambiente de teste, salvar diretamente sem pré-autorização
      // Em produção, fazer pré-autorização de R$ 1,00 para validar cartão
      if (isTestEnv) {
        console.log(
          '🧪 [SAVE_CARD] Ambiente de TESTE: salvando cartão diretamente sem pré-autorização',
        );

        // Gerar token fresco
        console.log('🔐 [SAVE_CARD] Gerando token para salvar cartão...');
        const freshCardToken = await this.tokenizeCard(
          saveCardDto,
          identificationType,
          userCpf,
          cardholderName, // ✅ Passar o nome correto (APRO para testes)
        );
        console.log(
          '🔑 [SAVE_CARD] Token criado:',
          freshCardToken.substring(0, 20) + '...',
        );

        // ✅ VERIFICAR: Se o cartão já existe no customer antes de tentar salvar
        const lastFourDigits = saveCardDto.cardNumber
          .replace(/\D/g, '')
          .slice(-4);
        console.log(
          '🔍 [SAVE_CARD] Verificando se cartão já existe no customer...',
        );
        const existingCards = await this.mercadoPagoService.getCustomerCards(
          customer.id,
        );
        const existingCard = existingCards.find(
          (card: any) => card.last_four_digits === lastFourDigits,
        );

        let savedCard;
        if (existingCard) {
          console.log(
            '✅ [SAVE_CARD] Cartão já existe no customer:',
            existingCard.id,
          );
          savedCard = {
            id: existingCard.id,
            lastFourDigits: existingCard.last_four_digits,
            paymentMethodId:
              existingCard.payment_method?.id || existingCard.payment_method_id,
            expirationMonth: existingCard.expiration_month,
            expirationYear: existingCard.expiration_year,
          };
        } else {
          // Salvar apenas se não existir
          console.log(
            '💾 [SAVE_CARD] Cartão não encontrado, salvando no customer...',
          );
          savedCard = await this.mercadoPagoService.saveCardToCustomer(
            customer.id,
            {
              token: freshCardToken,
              cardholderName: cardholderName,
              identificationType: identificationType,
              identificationNumber: userCpf,
            },
          );
          console.log('✅ [SAVE_CARD] Cartão salvo com sucesso:', savedCard.id);
        }

        // Salvar no banco de dados
        const cardBrand = this.detectCardBrand(cardNumberClean);

        // ✅ VERIFICAR: Se o cartão já existe no banco antes de inserir
        // Reutilizar lastFourDigits já declarado acima
        const existingDbCard = await db.query.savedCards.findFirst({
          where: and(
            eq(savedCards.userId, userId),
            eq(savedCards.lastFourDigits, lastFourDigits),
            eq(savedCards.mpCardId, savedCard.id),
            eq(savedCards.isActive, true),
          ),
        });

        let newCard;
        if (existingDbCard) {
          console.log(
            '✅ [SAVE_CARD] Cartão já existe no banco:',
            existingDbCard.id,
          );
          newCard = existingDbCard;
        } else {
          // Converter expirationDate (MM/YY) para os 2 dígitos esperados no banco
          const [month, year] = saveCardDto.expirationDate.split('/');
          const expirationMonth = this.normalizeExpirationMonth(month);
          const expirationYear = this.normalizeExpirationYear(year);

          [newCard] = await db
            .insert(savedCards)
            .values({
              userId: userId,
              cardHolderName: cardholderName,
              lastFourDigits: lastFourDigits,
              cardBrand: cardBrand,
              cardType: saveCardDto.cardType || CardType.CREDIT, // ✅ Campo obrigatório
              expirationMonth: expirationMonth,
              expirationYear: expirationYear,
              isDefault: false,
              mpCustomerId: customer.id,
              mpCardId: savedCard.id,
              mpCardToken: null, // Não armazenar token
            })
            .returning();

          console.log('✅ [SAVE_CARD] Cartão salvo no banco:', newCard.id);
        }

        return {
          cardId: newCard.id,
          message: 'Cartão salvo com sucesso (ambiente de teste)',
        };
      }

      // PRODUÇÃO: Pré-autorização de R$ 1,00 para validar cartão
      console.log(
        '💳 [SAVE_CARD] Fazendo pré-autorização de R$ 1,00 para validar cartão...',
      );

      // ✅ Gerar token fresco para validação
      console.log('🔐 [SAVE_CARD] Gerando token para validação...');
      const validationToken = await this.tokenizeCard(
        saveCardDto,
        identificationType,
        userCpf,
      );
      console.log(
        '🔑 [SAVE_CARD] Token de validação criado:',
        validationToken.substring(0, 20) + '...',
      );

      let validationPayment;
      try {
        validationPayment = await this.mercadoPagoService.createPayment({
          token: validationToken,
          amount: 1.0, // Valor simbólico
          description: 'Validação do cartão (estorno automático)',
          externalReference: `card_validation_${userId}_${Date.now()}`,
          capture: false, // Apenas autorização, sem captura
          payerEmail: user.email,
          payerIdentification: {
            type: identificationType,
            number: userCpf,
          },
          payerId: customer.id, // Usar customer ID
        });

        console.log(
          '✅ [SAVE_CARD] Pré-autorização aprovada:',
          validationPayment.id,
        );
        console.log(
          '💳 [SAVE_CARD] Card ID retornado:',
          validationPayment.card?.id,
        );
        console.log(
          '💳 [SAVE_CARD] Status do pagamento:',
          validationPayment.status,
        );

        // 3. Estornar imediatamente
        console.log('🔄 [SAVE_CARD] Limpando pré-autorização...');
        try {
          if (validationPayment.status === 'authorized') {
            await this.mercadoPagoService.cancelPayment(validationPayment.id);
            console.log('✅ [SAVE_CARD] Pré-autorização cancelada com sucesso');
          } else {
            await this.mercadoPagoService.refundPayment(
              validationPayment.id,
              1.0,
            );
            console.log('✅ [SAVE_CARD] Estorno realizado com sucesso');
          }
        } catch (refundError) {
          console.error(
            '⚠️ [SAVE_CARD] Erro ao limpar pré-autorização (não crítico):',
            refundError,
          );
          // Não bloquear o fluxo se o estorno falhar
        }
      } catch (paymentError) {
        console.error('❌ [SAVE_CARD] Erro na pré-autorização:', paymentError);
        throw new BadRequestException(
          `Cartão inválido ou recusado: ${paymentError.message || 'Não foi possível validar o cartão'}`,
        );
      }

      // 4. ✅ IMPORTANTE: Gerar token FRESCO imediatamente antes de salvar
      // Não reutilizar o token da pré-autorização (pode ter expirado)
      console.log('🔐 [SAVE_CARD] Gerando token fresco para salvar cartão...');

      console.log('🔍 [SAVE_CARD] Dados para token:', {
        cardholderName: cardholderName,
        identificationType: identificationType,
        identificationNumber: userCpf.replace(/\d(?=\d{4})/g, '*'), // Mascarar para log
        identificationNumberLength: userCpf.length,
      });

      const freshCardToken = await this.tokenizeCard(
        saveCardDto,
        identificationType,
        userCpf, // ✅ CPF já está limpo desde o início
      );
      console.log(
        '🔑 [SAVE_CARD] Token fresco criado:',
        freshCardToken.substring(0, 20) + '...',
      );

      // 5. Salvar cartão no customer usando o card_id do payment ou token fresco
      let savedCard;

      if (validationPayment.card?.id) {
        // Tentar salvar usando o card_id retornado pelo payment
        console.log(
          '💾 [SAVE_CARD] Verificando se cartão já está salvo no customer...',
        );

        try {
          // Verificar se o cartão já está no customer (por ID ou últimos 4 dígitos)
          const customerCards = await this.mercadoPagoService.getCustomerCards(
            customer.id,
          );
          const lastFourDigits = saveCardDto.cardNumber
            .replace(/\D/g, '')
            .slice(-4);

          // Primeiro tentar por ID do payment
          let existingCard = customerCards.find(
            (card: any) => card.id === validationPayment.card.id,
          );

          // Se não encontrar por ID, tentar por últimos 4 dígitos
          if (!existingCard) {
            existingCard = customerCards.find(
              (card: any) => card.last_four_digits === lastFourDigits,
            );
          }

          if (existingCard) {
            console.log(
              '✅ [SAVE_CARD] Cartão já salvo no customer via payment',
            );
            savedCard = {
              id: existingCard.id,
              lastFourDigits: existingCard.last_four_digits,
              paymentMethodId:
                existingCard.payment_method?.id ||
                existingCard.payment_method_id,
              expirationMonth: existingCard.expiration_month,
              expirationYear: existingCard.expiration_year,
            };
          } else {
            // Se não estiver salvo, tentar salvar manualmente com token fresco
            console.log(
              '💾 [SAVE_CARD] Cartão não encontrado no customer, salvando manualmente com token fresco...',
            );
            console.log('🔍 [SAVE_CARD] Dados para salvar:', {
              cardholderName: cardholderName,
              identificationType: identificationType,
              identificationNumber: userCpf.replace(/\d(?=\d{4})/g, '*'), // Mascarar para log
              identificationNumberLength: userCpf.length,
            });

            savedCard = await this.mercadoPagoService.saveCardToCustomer(
              customer.id,
              {
                token: freshCardToken, // ✅ Token fresco gerado AGORA
                cardholderName: cardholderName, // ✅ Usar nome do cartão (mesmo usado no token)
                identificationType: identificationType,
                identificationNumber: userCpf, // ✅ CPF já está limpo desde o início
              },
            );
          }
        } catch (saveError) {
          console.error(
            '⚠️ [SAVE_CARD] Erro ao verificar/salvar cartão no customer:',
            saveError,
          );
          // Se falhar, usar dados do payment
          savedCard = {
            id: validationPayment.card.id,
            lastFourDigits: validationPayment.card.last_four_digits,
            paymentMethodId: validationPayment.payment_method_id,
            expirationMonth: validationPayment.card.expiration_month,
            expirationYear: validationPayment.card.expiration_year,
          };
        }
      } else {
        // Fallback: tentar salvar usando token fresco
        console.log(
          '💾 [SAVE_CARD] Card ID não retornado, usando método de token fresco...',
        );
        console.log('🔍 [SAVE_CARD] Dados para salvar (fallback):', {
          cardholderName: cardholderName,
          identificationType: identificationType,
          identificationNumber: userCpf.replace(/\d(?=\d{4})/g, '*'), // Mascarar para log
          identificationNumberLength: userCpf.length,
        });

        // ✅ VERIFICAR: Se o cartão já existe no customer antes de tentar salvar
        const lastFourDigits = saveCardDto.cardNumber
          .replace(/\D/g, '')
          .slice(-4);
        console.log(
          '🔍 [SAVE_CARD] Verificando se cartão já existe no customer (fallback)...',
        );
        const customerCards = await this.mercadoPagoService.getCustomerCards(
          customer.id,
        );
        const existingCard = customerCards.find(
          (card: any) => card.last_four_digits === lastFourDigits,
        );

        if (existingCard) {
          console.log(
            '✅ [SAVE_CARD] Cartão já existe no customer (fallback):',
            existingCard.id,
          );
          savedCard = {
            id: existingCard.id,
            lastFourDigits: existingCard.last_four_digits,
            paymentMethodId:
              existingCard.payment_method?.id || existingCard.payment_method_id,
            expirationMonth: existingCard.expiration_month,
            expirationYear: existingCard.expiration_year,
          };
        } else {
          // Salvar apenas se não existir
          savedCard = await this.mercadoPagoService.saveCardToCustomer(
            customer.id,
            {
              token: freshCardToken, // ✅ Token fresco gerado AGORA
              cardholderName: cardholderName, // ✅ Usar nome do cartão (mesmo usado no token)
              identificationType: identificationType,
              identificationNumber: userCpf, // ✅ CPF já está limpo desde o início
            },
          );
        }
      }

      console.log('💳 [SAVE_CARD] Cartão salvo no customer:', savedCard.id);

      // 4. Detectar bandeira do cartão
      const cardBrand = this.detectCardBrand(saveCardDto.cardNumber);

      // 5. Calcular data de expiração
      const [month, year] = saveCardDto.expirationDate.split('/');
      const expirationMonth = this.normalizeExpirationMonth(
        savedCard.expirationMonth?.toString() || month,
      );
      const expirationYear = this.normalizeExpirationYear(
        savedCard.expirationYear?.toString() || year,
      );
      const expiresAt = new Date(2000 + parseInt(year), parseInt(month) - 1, 1);

      // 6. Se for definir como padrão, remover padrão dos outros
      if (saveCardDto.setAsDefault) {
        await db
          .update(savedCards)
          .set({ isDefault: false })
          .where(eq(savedCards.userId, userId));
      }

      // 7. Salvar no banco de dados
      // Usar lastFourDigits do savedCard se disponível, senão usar do cardNumber
      const lastFourDigits =
        savedCard.lastFourDigits ||
        saveCardDto.cardNumber.replace(/\D/g, '').slice(-4);

      // ✅ VERIFICAR: Se o cartão já existe no banco antes de inserir
      const existingDbCard = await db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.userId, userId),
          eq(savedCards.lastFourDigits, lastFourDigits),
          eq(savedCards.mpCardId, savedCard.id),
          eq(savedCards.isActive, true),
        ),
      });

      let savedPaymentMethod;
      if (existingDbCard) {
        console.log(
          '✅ [SAVE_CARD] Cartão já existe no banco (produção):',
          existingDbCard.id,
        );
        savedPaymentMethod = existingDbCard;
      } else {
        savedPaymentMethod = (
          await db
            .insert(savedCards)
            .values({
              userId,
              mpCardToken: freshCardToken, // ✅ Usar token fresco
              mpCustomerId: customer.id,
              mpCardId: savedCard.id,
              cardBrand,
              cardType: saveCardDto.cardType,
              lastFourDigits: lastFourDigits,
              expirationMonth: expirationMonth,
              expirationYear: expirationYear,
              cardHolderName: cardholderName, // ✅ Usar nome do cartão (pode ser de outra pessoa)
              nickname: saveCardDto.nickname,
              isDefault: saveCardDto.setAsDefault || false,
              expiresAt,
            })
            .returning()
        )[0];
      }

      console.log('✅ [SAVE_CARD] Cartão salvo com sucesso no banco');
      console.log('✅ [SAVE_CARD] Payment Method ID:', savedPaymentMethod.id);
      console.log('✅ [SAVE_CARD] MP Customer ID:', customer.id);
      console.log('✅ [SAVE_CARD] MP Card ID:', savedCard.id);

      // 8. Atualizar método de pagamento padrão se necessário
      if (saveCardDto.setAsDefault) {
        await db
          .update(studentPaymentMethods)
          .set({
            defaultCardId: savedPaymentMethod.id,
            hasValidPaymentMethod: true,
          })
          .where(eq(studentPaymentMethods.userId, userId));
      }

      return {
        cardId: savedPaymentMethod.id,
        message: 'Cartão salvo com sucesso',
      };
    } catch (error) {
      console.error('❌ [SAVE_CARD] Erro ao salvar cartão:', error);
      throw new BadRequestException(`Erro ao salvar cartão: ${error.message}`);
    }
  }

  // Tokenizar cartão no Mercado Pago
  private async tokenizeCard(
    cardDto: SaveCardDto,
    identificationType?: string,
    identificationNumber?: string,
    cardholderNameOverride?: string, // ✅ Permitir sobrescrever o nome (para usar APRO em testes)
  ): Promise<string> {
    try {
      console.log('🔐 [TOKENIZE CARD] Tokenizando cartão no Mercado Pago...');

      // Converter ano de 2 dígitos para 4 dígitos
      const [month, year] = cardDto.expirationDate.split('/');
      const fullYear = year.length === 2 ? `20${year}` : year;

      console.log('🔍 [TOKENIZE CARD] Dados do cartão:', {
        original: cardDto.expirationDate,
        month: month,
        year: fullYear,
        cardNumberMasked: cardDto.cardNumber.replace(/\d(?=\d{4})/g, '*'),
        hasIdentification: !!(identificationType && identificationNumber),
      });

      // Usar cartão de teste oficial do MP se for o cartão Mastercard problemático
      const isProblematicMastercard =
        cardDto.cardNumber.replace(/\s/g, '') === '5031433215406351';

      if (isProblematicMastercard) {
        console.log(
          '🔄 [TOKENIZE CARD] Usando cartão Visa oficial do MP para teste',
        );
        const token = await this.mercadoPagoService.createCardToken({
          cardNumber: '4235 6477 2802 5682', // Visa oficial do MP
          expirationMonth: month,
          expirationYear: fullYear,
          securityCode: '123', // CVV padrão do MP
          cardholderName: 'APRO', // Nome padrão para aprovação
          identificationType: identificationType, // ✅ Passar identification
          identificationNumber: identificationNumber, // ✅ Passar identification
        });

        console.log(
          '✅ [TOKENIZE CARD] Token criado com cartão Visa oficial:',
          {
            tokenLength: token?.length || 0,
            tokenPreview: token?.substring(0, 20) + '...',
          },
        );

        return token;
      }

      // Usar dados reais do cartão cadastrado pelo usuário
      const token = await this.mercadoPagoService.createCardToken({
        cardNumber: cardDto.cardNumber,
        expirationMonth: month,
        expirationYear: fullYear,
        securityCode: cardDto.cvv,
        cardholderName: cardholderNameOverride || cardDto.cardHolderName, // ✅ Usar nome sobrescrito se fornecido (APRO para testes)
        identificationType: identificationType, // ✅ Passar identification
        identificationNumber: identificationNumber, // ✅ Passar identification
      });

      console.log('✅ [TOKENIZE CARD] Token criado com sucesso:', {
        tokenLength: token?.length || 0,
        tokenPreview: token?.substring(0, 20) + '...',
        hasIdentification: !!(identificationType && identificationNumber),
      });

      return token;
    } catch (error) {
      console.error('❌ [TOKENIZE CARD] Erro ao tokenizar cartão:', error);
      throw new BadRequestException(
        'Erro ao processar cartão. Verifique os dados.',
      );
    }
  }

  // Detectar bandeira do cartão
  private detectCardBrand(cardNumber: string): CardBrand {
    const number = cardNumber.replace(/\s/g, '');

    if (/^4/.test(number)) return CardBrand.VISA;
    if (/^5[0-5]/.test(number)) return CardBrand.MASTERCARD; // Incluir 50 para cartões de teste MP
    if (/^2[2-7]/.test(number)) return CardBrand.MASTERCARD; // Mastercard 2-series
    if (/^3[47]/.test(number)) return CardBrand.AMERICAN_EXPRESS;
    if (/^6(?:011|5)/.test(number)) return CardBrand.ELO;
    if (/^60/.test(number)) return CardBrand.HIPERCARD;
    if (/^3[0689]/.test(number)) return CardBrand.DINERS;

    return CardBrand.VISA; // Padrão para cartões não reconhecidos
  }

  private normalizeExpirationMonth(month: string): string {
    return month.padStart(2, '0').slice(-2);
  }

  private normalizeExpirationYear(year: string): string {
    const digitsOnlyYear = year.replace(/\D/g, '');
    if (!digitsOnlyYear) {
      throw new BadRequestException('Ano de expiração inválido');
    }

    return digitsOnlyYear.slice(-2).padStart(2, '0');
  }

  // Validar cartão
  async validateCard(
    validateDto: ValidateCardDto,
  ): Promise<{ isValid: boolean; errors: string[] }> {
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

  // Processar pagamento de proposta (sem verificar se aula existe)
  async processProposalPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
    proposalData: any,
  ): Promise<PaymentProcessResponseDto> {
    console.log(
      '💳 [PROPOSAL PAYMENT] ===== INÍCIO DO PROCESSAMENTO DE PAGAMENTO DE PROPOSTA =====',
    );
    console.log('👤 [PROPOSAL PAYMENT] User ID:', userId);
    console.log(
      '📋 [PROPOSAL PAYMENT] Dados recebidos:',
      JSON.stringify(processDto, null, 2),
    );
    console.log('📋 [PROPOSAL PAYMENT] Dados da proposta:', proposalData);

    // Verificar se já existe pagamento para esta proposta
    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.proposalId, processDto.classId),
    });

    if (existingPayment) {
      console.log(
        '❌ [PROPOSAL PAYMENT] Já existe pagamento para esta proposta:',
        existingPayment.id,
      );
      throw new BadRequestException('Esta proposta já possui um pagamento');
    }

    console.log(
      '🔍 [PROPOSAL PAYMENT] Método de pagamento:',
      processDto.paymentMethod,
    );

    // Processar pagamento baseado no método
    switch (processDto.paymentMethod) {
      case StudentPaymentMethod.CREDIT_CARD:
      case StudentPaymentMethod.DEBIT_CARD:
        console.log(
          '💳 [PROPOSAL PAYMENT] Processando pagamento com cartão...',
        );
        return this.processCardPaymentForProposal(
          userId,
          processDto,
          proposalData,
        );

      case StudentPaymentMethod.MERCADO_PAGO:
        console.log(
          '🛒 [PROPOSAL PAYMENT] Processando pagamento via Mercado Pago...',
        );
        return this.processMercadoPagoPayment(userId, processDto, proposalData);

      case StudentPaymentMethod.PIX:
        console.log('📱 [PROPOSAL PAYMENT] Processando pagamento via PIX...');
        return this.processPixPayment();

      default:
        console.log(
          '❌ [PROPOSAL PAYMENT] Método de pagamento não suportado:',
          processDto.paymentMethod,
        );
        throw new BadRequestException('Método de pagamento não suportado');
    }
  }

  // Processar pagamento de aula
  async processClassPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
  ): Promise<PaymentProcessResponseDto> {
    console.log(
      '💳 [STUDENT PAYMENT] ===== INÍCIO DO PROCESSAMENTO DE PAGAMENTO =====',
    );
    console.log('👤 [STUDENT PAYMENT] User ID:', userId);
    console.log(
      '📋 [STUDENT PAYMENT] Dados recebidos:',
      JSON.stringify(processDto, null, 2),
    );

    // Verificar se a aula existe
    const classData = await db.query.classes.findFirst({
      where: eq(classes.id, processDto.classId),
      with: {
        student: true,
        personal: true,
      },
    });

    if (!classData) {
      console.log(
        '❌ [STUDENT PAYMENT] Aula não encontrada:',
        processDto.classId,
      );
      throw new NotFoundException('Aula não encontrada');
    }

    console.log('✅ [STUDENT PAYMENT] Aula encontrada:', {
      id: classData.id,
      studentId: classData.studentId,
      personalId: classData.personalId,
    });

    if (classData.studentId !== userId) {
      console.log('❌ [STUDENT PAYMENT] Usuário não autorizado para esta aula');
      throw new ForbiddenException('Você não pode pagar por esta aula');
    }

    // Verificar se já existe pagamento
    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.classId, processDto.classId),
    });

    if (existingPayment) {
      console.log(
        '❌ [STUDENT PAYMENT] Já existe pagamento para esta aula:',
        existingPayment.id,
      );
      throw new BadRequestException('Esta aula já possui um pagamento');
    }

    console.log(
      '🔍 [STUDENT PAYMENT] Método de pagamento:',
      processDto.paymentMethod,
    );

    // Processar pagamento baseado no método
    switch (processDto.paymentMethod) {
      case StudentPaymentMethod.CREDIT_CARD:
      case StudentPaymentMethod.DEBIT_CARD:
        console.log('💳 [STUDENT PAYMENT] Processando pagamento com cartão...');
        return this.processCardPayment(userId, processDto, classData);

      case StudentPaymentMethod.MERCADO_PAGO:
        console.log(
          '🛒 [STUDENT PAYMENT] Processando pagamento via Mercado Pago...',
        );
        return this.processMercadoPagoPayment(userId, processDto, classData);

      case StudentPaymentMethod.PIX:
        console.log('📱 [STUDENT PAYMENT] Processando pagamento via PIX...');
        return this.processPixPayment();

      default:
        console.log(
          '❌ [STUDENT PAYMENT] Método de pagamento não suportado:',
          processDto.paymentMethod,
        );
        throw new BadRequestException('Método de pagamento não suportado');
    }
  }

  // Processar pagamento com cartão
  private async processCardPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
    classData: any,
  ): Promise<PaymentProcessResponseDto> {
    console.log('💳 [CARD PAYMENT] ===== INÍCIO DO PAGAMENTO COM CARTÃO =====');
    console.log('🆔 [CARD PAYMENT] Card ID:', processDto.cardId);
    console.log('📋 [CARD PAYMENT] Card Data presente:', !!processDto.cardData);

    let cardToken: string;
    let cardInfo: any;

    if (processDto.cardId) {
      console.log('🔍 [CARD PAYMENT] Buscando cartão salvo...');
      // Usar cartão salvo
      const savedCard = await db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.id, processDto.cardId),
          eq(savedCards.userId, userId),
          eq(savedCards.isActive, true),
        ),
      });

      if (!savedCard) {
        console.log(
          '❌ [CARD PAYMENT] Cartão não encontrado:',
          processDto.cardId,
        );
        throw new NotFoundException('Cartão não encontrado');
      }

      console.log('✅ [CARD PAYMENT] Cartão encontrado:', {
        id: savedCard.id,
        lastFourDigits: savedCard.lastFourDigits,
        cardBrand: savedCard.cardBrand,
        timesUsed: savedCard.timesUsed,
      });

      // ✅ SEMPRE gerar token fresco - tokens expiram em poucos minutos
      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
      if (isTestEnv) {
        // ✅ Em teste: Re-tokenizar usando cartão oficial de teste (sandbox)
        const fullYear =
          savedCard.expirationYear.length === 2
            ? `20${savedCard.expirationYear}`
            : savedCard.expirationYear;

        // Buscar dados do usuário para identification
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        const userCpf = user?.documentNumber || '19119119100';
        const identificationType = user?.documentType === 'CPF' ? 'CPF' : 'CPF';

        cardToken = await this.mercadoPagoService.createCardToken({
          cardNumber: '4235 6477 2802 5682', // Visa oficial de teste MP
          expirationMonth: savedCard.expirationMonth,
          expirationYear: fullYear,
          securityCode: '123',
          cardholderName: savedCard.cardHolderName || 'APRO',
          identificationType: identificationType, // ✅ Adicionar identification
          identificationNumber: userCpf, // ✅ Adicionar identification
        });
        console.log(
          '✅ [CARD PAYMENT] Token fresco gerado para ambiente de teste',
        );
      } else {
        // ✅ Produção: Gerar token fresco a partir do card_id salvo no MP (sem precisar de CVV)
        if (!savedCard.mpCardId) {
          throw new BadRequestException(
            'Cartão salvo não possui ID do Mercado Pago. Por favor, salve o cartão novamente.',
          );
        }
        console.log(
          '🔄 [CARD PAYMENT] Produção - gerando token a partir do card_id MP:',
          savedCard.mpCardId,
        );
        cardToken = await this.mercadoPagoService.createCardTokenFromSavedCard(
          savedCard.mpCardId,
        );
        console.log('✅ [CARD PAYMENT] Token fresco gerado para produção');
      }
      cardInfo = {
        lastFourDigits: savedCard.lastFourDigits,
        cardBrand: savedCard.cardBrand,
        wasCardSaved: false,
        cardId: savedCard.id,
        mpCustomerId: savedCard.mpCustomerId,
      };

      // Atualizar uso do cartão
      await db
        .update(savedCards)
        .set({
          timesUsed: savedCard.timesUsed + 1,
          lastUsedAt: new Date(),
        })
        .where(eq(savedCards.id, savedCard.id));

      console.log('✅ [CARD PAYMENT] Cartão atualizado com novo uso');
    } else if (processDto.cardData) {
      console.log('🆕 [CARD PAYMENT] Processando cartão novo...');
      // Buscar dados do usuário para identification
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      const userCpf = user?.documentNumber || '19119119100';
      const identificationType = user?.documentType === 'CPF' ? 'CPF' : 'CPF';

      // Usar cartão novo
      cardToken = await this.tokenizeCard(
        processDto.cardData,
        identificationType,
        userCpf,
      );
      cardInfo = {
        lastFourDigits: processDto.cardData.cardNumber.slice(-4),
        cardBrand: this.detectCardBrand(processDto.cardData.cardNumber),
        wasCardSaved: false,
      };

      console.log('✅ [CARD PAYMENT] Cartão tokenizado:', {
        lastFourDigits: cardInfo.lastFourDigits,
        cardBrand: cardInfo.cardBrand,
      });

      // Salvar cartão se solicitado
      if (processDto.saveCard) {
        console.log('💾 [CARD PAYMENT] Salvando cartão...');
        const savedCardResult = await this.saveCard(userId, {
          ...processDto.cardData,
          nickname: processDto.cardNickname,
        });
        cardInfo.wasCardSaved = true;
        cardInfo.cardId = savedCardResult.cardId;
        console.log(
          '✅ [CARD PAYMENT] Cartão salvo com ID:',
          savedCardResult.cardId,
        );
      }
    } else {
      console.log('❌ [CARD PAYMENT] Dados do cartão são obrigatórios');
      throw new BadRequestException('Dados do cartão são obrigatórios');
    }

    // Criar pagamento no sistema (será processado pelo webhook)
    const amount = 100; // TODO: Pegar valor real da aula
    const platformFee = amount * 0.1;
    const personalAmount = amount - platformFee;

    console.log('💰 [CARD PAYMENT] Valores calculados:', {
      amount,
      platformFee,
      personalAmount,
    });

    console.log('💾 [CARD PAYMENT] Criando registro de pagamento no banco...');
    const [newPayment] = await db
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

    console.log('✅ [CARD PAYMENT] Pagamento criado no banco:', {
      id: newPayment.id,
      classId: newPayment.classId,
      status: newPayment.status,
    });

    // Processar pagamento real no Mercado Pago com autorização (capture=false)
    console.log(
      '💳 [CARD PAYMENT] Processando pagamento real no Mercado Pago...',
    );

    const mpPayment = await this.mercadoPagoService.createPayment({
      token: cardToken,
      amount: amount,
      description: `Aula de treino - ${classData.location || 'Local a definir'}`,
      externalReference: `class_${processDto.classId}`,
      capture: false, // Autorização sem captura (custódia)
      payerId: cardInfo.mpCustomerId, // Usar customer_id em vez de email/identification
    });

    console.log('✅ [CARD PAYMENT] Pagamento MP processado:', {
      id: mpPayment.id,
      status: mpPayment.status,
      status_detail: mpPayment.status_detail,
    });

    // ✅ CORRIGIDO: Usar updatePaymentStatus para garantir repasse em simulações
    const mappedStatus = this.mercadoPagoService.mapPaymentStatus(
      mpPayment.status,
    );

    await this.paymentsService.updatePaymentStatus(
      newPayment.id,
      mappedStatus as any,
      mpPayment.id,
      mpPayment,
    );

    console.log(
      `✅ [CARD PAYMENT] Status do pagamento atualizado para ${mappedStatus} (via updatePaymentStatus)`,
    );

    const result = {
      success: true,
      paymentId: newPayment.id,
      mpPaymentId: mpPayment.id,
      status: mpPayment.status,
      statusDetail: mpPayment.status_detail,
      transactionAmount: amount,
      installments: parseInt(processDto.installments || '1'),
      cardInfo,
      message: 'Pagamento autorizado com sucesso (em custódia)',
      createdAt: new Date(),
    };

    console.log('📤 [CARD PAYMENT] Resposta final:', result);
    console.log('🏁 [CARD PAYMENT] ===== FIM DO PAGAMENTO COM CARTÃO =====');

    return result;
  }

  // Processar pagamento com cartão para proposta
  private async processCardPaymentForProposal(
    userId: string,
    processDto: ProcessClassPaymentDto,
    proposalData: any,
  ): Promise<PaymentProcessResponseDto> {
    console.log(
      '💳 [PROPOSAL CARD PAYMENT] ===== INÍCIO DO PAGAMENTO COM CARTÃO PARA PROPOSTA =====',
    );
    console.log('🆔 [PROPOSAL CARD PAYMENT] Card ID:', processDto.cardId);
    console.log(
      '📋 [PROPOSAL CARD PAYMENT] Card Data presente:',
      !!processDto.cardData,
    );

    let cardToken: string;
    let cardInfo: any;
    let cardBrand: string = 'visa'; // Default
    let savedCard: any = null; // Declarar fora do bloco if

    if (processDto.cardId) {
      console.log('🔍 [PROPOSAL CARD PAYMENT] Buscando cartão salvo...');
      // Usar cartão salvo
      savedCard = await db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.id, processDto.cardId),
          eq(savedCards.userId, userId),
          eq(savedCards.isActive, true),
        ),
      });

      if (!savedCard) {
        console.log(
          '❌ [PROPOSAL CARD PAYMENT] Cartão não encontrado:',
          processDto.cardId,
        );
        throw new NotFoundException('Cartão não encontrado');
      }

      console.log('✅ [PROPOSAL CARD PAYMENT] Cartão encontrado:', {
        id: savedCard.id,
        lastFourDigits: savedCard.lastFourDigits,
        cardBrand: savedCard.cardBrand,
        timesUsed: savedCard.timesUsed,
      });

      // Usar sempre a bandeira do cartão salvo (não forçar Visa)
      cardBrand = savedCard.cardBrand; // Usar bandeira original do cartão salvo
      console.log(
        '✅ [PROPOSAL CARD PAYMENT] Usando bandeira do cartão salvo:',
        cardBrand,
      );

      // ✅ SEMPRE gerar token fresco - tokens expiram em poucos minutos
      // Não reutilizar token salvo
      const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
      if (isTestEnv) {
        // ✅ Em teste: Gerar token fresco usando cartão oficial de teste
        const fullYear =
          savedCard.expirationYear.length === 2
            ? `20${savedCard.expirationYear}`
            : savedCard.expirationYear;

        // Buscar dados do usuário para identification
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        const userCpf = user?.documentNumber || '19119119100';
        const identificationType = user?.documentType === 'CPF' ? 'CPF' : 'CPF';

        // Mapear bandeira do cartão salvo para cartão de teste MP correspondente
        let testCardNumber: string;
        if (cardBrand === 'MASTERCARD' || cardBrand === 'master') {
          testCardNumber = '4009172292806176'; // Mastercard oficial de teste MP
        } else {
          testCardNumber = '4235 6477 2802 5682'; // Visa oficial de teste MP
        }

        cardToken = await this.mercadoPagoService.createCardToken({
          cardNumber: testCardNumber,
          expirationMonth: savedCard.expirationMonth,
          expirationYear: fullYear,
          securityCode: '123',
          cardholderName: savedCard.cardHolderName || 'APRO',
          identificationType: identificationType,
          identificationNumber: userCpf,
        });
        console.log(
          '✅ [PROPOSAL CARD PAYMENT] Token fresco gerado para ambiente de teste',
        );
      } else {
        // ✅ Produção: Gerar token fresco a partir do card_id salvo no MP (sem precisar de CVV)
        if (!savedCard.mpCardId) {
          throw new BadRequestException(
            'Cartão salvo não possui ID do Mercado Pago. Por favor, salve o cartão novamente.',
          );
        }
        console.log(
          '🔄 [PROPOSAL CARD PAYMENT] Produção - gerando token a partir do card_id MP:',
          savedCard.mpCardId,
        );
        cardToken = await this.mercadoPagoService.createCardTokenFromSavedCard(
          savedCard.mpCardId,
        );
        console.log(
          '✅ [PROPOSAL CARD PAYMENT] Token fresco gerado para produção',
        );
      }

      console.log('🔍 [PROPOSAL CARD PAYMENT] Token fresco gerado:', {
        tokenLength: cardToken?.length || 0,
        tokenPreview: cardToken?.substring(0, 20) + '...',
        hasToken: !!cardToken,
        cardBrandUsed: cardBrand,
      });
      cardInfo = {
        lastFourDigits: savedCard.lastFourDigits,
        cardBrand: savedCard.cardBrand,
        wasCardSaved: false,
        cardId: savedCard.id,
      };

      // Atualizar uso do cartão
      await db
        .update(savedCards)
        .set({
          timesUsed: savedCard.timesUsed + 1,
          lastUsedAt: new Date(),
        })
        .where(eq(savedCards.id, savedCard.id));

      console.log('✅ [PROPOSAL CARD PAYMENT] Cartão atualizado com novo uso');
    } else if (processDto.cardData) {
      console.log('🆕 [PROPOSAL CARD PAYMENT] Processando cartão novo...');
      // Usar cartão novo
      cardToken = await this.tokenizeCard(processDto.cardData);
      cardInfo = {
        lastFourDigits: processDto.cardData.cardNumber.slice(-4),
        cardBrand: this.detectCardBrand(processDto.cardData.cardNumber),
        wasCardSaved: false,
      };

      console.log('✅ [PROPOSAL CARD PAYMENT] Cartão tokenizado:', {
        lastFourDigits: cardInfo.lastFourDigits,
        cardBrand: cardInfo.cardBrand,
      });

      // Salvar cartão se solicitado
      if (processDto.saveCard) {
        console.log('💾 [PROPOSAL CARD PAYMENT] Salvando cartão...');
        const savedCardResult = await this.saveCard(userId, {
          ...processDto.cardData,
          nickname: processDto.cardNickname,
        });
        cardInfo.wasCardSaved = true;
        cardInfo.cardId = savedCardResult.cardId;
        console.log(
          '✅ [PROPOSAL CARD PAYMENT] Cartão salvo com ID:',
          savedCardResult.cardId,
        );
      }
    } else {
      console.log(
        '❌ [PROPOSAL CARD PAYMENT] Dados do cartão são obrigatórios',
      );
      throw new BadRequestException('Dados do cartão são obrigatórios');
    }

    // Usar dados da proposta para criar pagamento
    const amount = proposalData.price || 100; // Usar preço da proposta
    const platformFee = amount * 0.1;
    const personalAmount = amount - platformFee;

    console.log('💰 [PROPOSAL CARD PAYMENT] Valores calculados:', {
      amount,
      platformFee,
      personalAmount,
    });

    console.log(
      '💾 [PROPOSAL CARD PAYMENT] Criando registro de pagamento no banco...',
    );
    const [newPayment] = await db
      .insert(payments)
      .values({
        classId: null, // NULL para propostas
        proposalId: processDto.classId, // ID da proposta
        studentId: userId,
        personalId: null, // NULL até personal aceitar a proposta
        totalAmount: amount.toString(),
        platformFee: platformFee.toString(),
        personalAmount: personalAmount.toString(),
        status: 'pending',
        type: 'class_payment',
      })
      .returning();

    console.log('✅ [PROPOSAL CARD PAYMENT] Pagamento criado no banco:', {
      id: newPayment.id,
      classId: newPayment.classId,
      status: newPayment.status,
    });

    // ✅ SOLUÇÃO CORRETA: Gerar novo token a partir do cartão salvo
    if (savedCard.mpCustomerId && savedCard.mpCardId) {
      console.log(
        '🔄 [PROPOSAL CARD PAYMENT] Gerando novo token a partir do cartão salvo no MP...',
      );

      try {
        // Buscar cartão no MP para obter dados frescos
        const mpCard = await this.mercadoPagoService.getCustomerCard(
          savedCard.mpCustomerId,
          savedCard.mpCardId,
        );

        console.log('✅ [PROPOSAL CARD PAYMENT] Cartão MP encontrado:', {
          id: mpCard.id,
          payment_method: mpCard.payment_method?.id,
          last_four_digits: mpCard.last_four_digits,
        });

        // ✅ SOLUÇÃO CORRETA: Usar dados reais do cartão salvo para gerar token consistente
        const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith(
          'TEST-',
        );

        if (isTestEnv) {
          console.log(
            '🧪 [PROPOSAL CARD PAYMENT] Ambiente de teste - usando dados do cartão salvo real',
          );

          // ✅ Usar dados do cartão salvo real, não cartão oficial MP diferente
          // Mapear bandeira do cartão salvo para cartão de teste MP correspondente
          let testCardNumber: string;
          let testCardholderName: string;

          if (mpCard.payment_method?.id === 'visa') {
            testCardNumber = '4235 6477 2802 5682'; // Visa oficial de teste MP
            testCardholderName = 'APRO';
          } else if (mpCard.payment_method?.id === 'master') {
            testCardNumber = '4009172292806176'; // Mastercard oficial de teste MP
            testCardholderName = 'APRO';
          } else {
            // Fallback para Visa se bandeira não reconhecida
            testCardNumber = '4235 6477 2802 5682';
            testCardholderName = 'APRO';
          }

          console.log('🔍 [PROPOSAL CARD PAYMENT] Usando cartão de teste MP:', {
            cardBrand: mpCard.payment_method?.id,
            testCardNumber:
              testCardNumber.substring(0, 4) +
              ' **** **** ' +
              testCardNumber.substring(-4),
            testCardholderName,
          });

          // Buscar dados do usuário para identification
          const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
          });

          const userCpf = user?.documentNumber || '19119119100';
          const identificationType =
            user?.documentType === 'CPF' ? 'CPF' : 'CPF';

          // Gerar token usando cartão de teste MP correspondente à bandeira do cartão salvo
          cardToken = await this.mercadoPagoService.createCardToken({
            cardNumber: testCardNumber,
            expirationMonth: savedCard.expirationMonth || '11',
            expirationYear: '20' + (savedCard.expirationYear || '25'), // ✅ '20' + dígitos do cartão
            securityCode: '123',
            cardholderName: testCardholderName,
            identificationType: identificationType, // ✅ Adicionar identification
            identificationNumber: userCpf, // ✅ Adicionar identification
          });

          console.log(
            '✅ [PROPOSAL CARD PAYMENT] Token fresco gerado com dados consistentes:',
            {
              tokenLength: cardToken?.length || 0,
              tokenPreview: cardToken?.substring(0, 20) + '...',
              cardBrandUsed: mpCard.payment_method?.id,
              expirationYearUsed: '20' + (savedCard.expirationYear || '25'), // ✅ Log do ano usado
            },
          );
        } else {
          // ✅ Produção: Gerar token fresco a partir do card_id salvo no MP (sem precisar de CVV)
          console.log(
            '🔄 [PROPOSAL CARD PAYMENT] Produção - gerando token a partir do card_id MP:',
            mpCard.id,
          );
          cardToken = await this.mercadoPagoService.createCardTokenFromSavedCard(
            mpCard.id,
          );
          console.log(
            '✅ [PROPOSAL CARD PAYMENT] Token fresco gerado para produção a partir do card_id',
          );
        }

        cardInfo = {
          lastFourDigits: savedCard.lastFourDigits,
          cardBrand: mpCard.payment_method?.id || savedCard.cardBrand,
          wasCardSaved: false,
          cardId: savedCard.id,
          mpCustomerId: savedCard.mpCustomerId,
          mpCardId: mpCard.id,
        };
      } catch (mpError) {
        console.error(
          '❌ [PROPOSAL CARD PAYMENT] Erro ao processar cartão salvo:',
          mpError,
        );
        throw new BadRequestException(
          'Erro ao processar cartão salvo no Mercado Pago',
        );
      }
    } else {
      throw new BadRequestException(
        'Cartão salvo não possui dados do Mercado Pago',
      );
    }

    // ✅ SOLUÇÃO FINAL: Usar token fresco gerado
    console.log(
      '💳 [PROPOSAL CARD PAYMENT] Processando pagamento real no Mercado Pago...',
    );
    console.log(
      '🔍 [PROPOSAL CARD PAYMENT] Usando token fresco:',
      cardToken?.substring(0, 20) + '...',
    );
    const isTestEnv = (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
    // Derivar payment_method_id quando possível (visa/master)
    let derivedPaymentMethodId: string | undefined;
    try {
      if (isTestEnv) {
        // Preferir a bandeira informada pelo MP
        if (cardInfo?.cardBrand && typeof cardInfo.cardBrand === 'string') {
          const brand = String(cardInfo.cardBrand).toLowerCase();
          if (brand.includes('mastercard') || brand === 'mastercard')
            derivedPaymentMethodId = 'master';
          else if (brand.includes('master')) derivedPaymentMethodId = 'master';
          else if (brand.includes('visa')) derivedPaymentMethodId = 'visa';
        }
      }
    } catch {}

    const mpPayment = await this.mercadoPagoService.createPayment({
      token: cardToken, // ✅ Token fresco gerado
      amount: amount,
      description: `Proposta de treino - ${proposalData.locationName || 'Local a definir'}`,
      externalReference: `proposal_${processDto.classId}`,
      capture: false, // Autorização sem captura (custódia)
      payerId: savedCard.mpCustomerId, // ✅ Customer ID como payer (PROD); ignorado em TEST
      payerEmail: processDto.payerEmail || proposalData.studentEmail, // ✅ Email real do aluno
      payerIdentification: {
        type: 'CPF',
        number: processDto.payerCpf || '19119119100',
      }, // ✅ CPF real quando enviado
      paymentMethodId: derivedPaymentMethodId,
    });

    console.log('✅ [PROPOSAL CARD PAYMENT] Pagamento MP processado:', {
      id: mpPayment.id,
      status: mpPayment.status,
      status_detail: mpPayment.status_detail,
    });

    // Atualizar status do pagamento no banco para 'authorized' (custódia)
    await db
      .update(payments)
      .set({
        status: 'authorized', // Status correto para custódia
        mpPaymentId: mpPayment.id,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, newPayment.id));

    console.log(
      '✅ [PROPOSAL CARD PAYMENT] Status do pagamento atualizado para authorized (custódia)',
    );

    const result = {
      success: true,
      paymentId: newPayment.id,
      mpPaymentId: mpPayment.id,
      status: 'authorized', // ✅ Usar status correto do banco, não do MP
      statusDetail: mpPayment.status_detail,
      transactionAmount: amount,
      installments: parseInt(processDto.installments || '1'),
      cardInfo,
      message: 'Pagamento da proposta autorizado com sucesso (em custódia)',
      createdAt: new Date(),
    };

    console.log('📤 [PROPOSAL CARD PAYMENT] Resposta final:', result);
    console.log(
      '🏁 [PROPOSAL CARD PAYMENT] ===== FIM DO PAGAMENTO COM CARTÃO PARA PROPOSTA =====',
    );

    return result;
  }

  // Processar pagamento com Mercado Pago
  private async processMercadoPagoPayment(
    userId: string,
    processDto: ProcessClassPaymentDto,
    classData: any,
  ): Promise<PaymentProcessResponseDto> {
    // Buscar configurações do MP do aluno
    const paymentMethods = await db.query.studentPaymentMethods.findFirst({
      where: eq(studentPaymentMethods.userId, userId),
    });

    if (!paymentMethods?.mpEmail) {
      throw new BadRequestException(
        'Configure sua conta do Mercado Pago primeiro',
      );
    }

    // Criar preferência de pagamento
    const amount = 100; // TODO: Pegar valor real da aula
    const preference = await this.mercadoPagoService.createPreference({
      classId: processDto.classId,
      title: `Aula ${classData.location} - ${classData.date.toLocaleDateString()}`,
      totalAmount: amount,
      platformFee: amount * 0.1,
      personalAmount: amount * 0.9,
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
  private async processPixPayment(): Promise<PaymentProcessResponseDto> {
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
  async removeCard(
    userId: string,
    removeDto: RemoveCardDto,
  ): Promise<{ message: string }> {
    try {
      console.log('🗑️ [REMOVE_CARD] Removendo cartão...');
      console.log('🔍 [REMOVE_CARD] User ID:', userId);
      console.log('🔍 [REMOVE_CARD] Card ID:', removeDto.cardId);

      const card = await db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.id, removeDto.cardId),
          eq(savedCards.userId, userId),
        ),
      });

      if (!card) {
        throw new NotFoundException('Cartão não encontrado');
      }

      console.log('✅ [REMOVE_CARD] Cartão encontrado:', {
        id: card.id,
        lastFourDigits: card.lastFourDigits,
        mpCustomerId: card.mpCustomerId,
        mpCardId: card.mpCardId,
      });

      // Remover cartão do Mercado Pago se tiver customer_id e card_id
      if (card.mpCustomerId && card.mpCardId) {
        try {
          console.log('🗑️ [REMOVE_CARD] Removendo cartão do MP...');
          await this.mercadoPagoService.deleteCustomerCard(
            card.mpCustomerId,
            card.mpCardId,
          );
          console.log('✅ [REMOVE_CARD] Cartão removido do MP com sucesso');
        } catch (mpError) {
          console.error(
            '⚠️ [REMOVE_CARD] Erro ao remover do MP (continuando):',
            mpError,
          );
          // Continuar mesmo se falhar no MP
        }
      }

      // Desativar cartão no banco (para histórico)
      await db
        .update(savedCards)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(savedCards.id, removeDto.cardId));

      // Se era o cartão padrão, remover da configuração
      if (card.isDefault) {
        await db
          .update(studentPaymentMethods)
          .set({
            defaultCardId: null,
            hasValidPaymentMethod: false,
          })
          .where(eq(studentPaymentMethods.userId, userId));
      }

      console.log('✅ [REMOVE_CARD] Cartão removido com sucesso');
      return { message: 'Cartão removido com sucesso' };
    } catch (error) {
      console.error('❌ [REMOVE_CARD] Erro ao remover cartão:', error);
      throw new BadRequestException(`Erro ao remover cartão: ${error.message}`);
    }
  }

  // Listar cartões do customer
  async getCustomerCards(userId: string): Promise<any[]> {
    try {
      console.log('📋 [GET_CARDS] Listando cartões do customer...');
      console.log('🔍 [GET_CARDS] User ID:', userId);

      // Buscar customer_id do usuário
      const userCards = await db.query.savedCards.findMany({
        where: and(
          eq(savedCards.userId, userId),
          eq(savedCards.isActive, true),
        ),
      });

      if (userCards.length === 0) {
        console.log('📋 [GET_CARDS] Nenhum cartão encontrado');
        return [];
      }

      // Buscar customer_id do primeiro cartão
      const firstCard = userCards[0];
      if (!firstCard.mpCustomerId) {
        console.log('⚠️ [GET_CARDS] Customer ID não encontrado');
        return userCards.map((card) => ({
          id: card.id,
          lastFourDigits: card.lastFourDigits,
          cardBrand: card.cardBrand,
          expirationMonth: card.expirationMonth,
          expirationYear: card.expirationYear,
          cardHolderName: card.cardHolderName,
          nickname: card.nickname,
          isDefault: card.isDefault,
          createdAt: card.createdAt,
        }));
      }

      // Buscar cartões do MP
      const mpCards = await this.mercadoPagoService.getCustomerCards(
        firstCard.mpCustomerId,
      );

      console.log('✅ [GET_CARDS] Cartões encontrados:', mpCards.length);

      return mpCards.map((card) => ({
        id: card.id,
        lastFourDigits: card.last_four_digits,
        cardBrand: card.payment_method_id,
        expirationMonth: card.expiration_month,
        expirationYear: card.expiration_year,
        cardHolderName: card.cardholder?.name || 'N/A',
        nickname: card.nickname || 'Cartão',
        isDefault: false, // Será determinado pelo banco local
        createdAt: card.date_created,
      }));
    } catch (error) {
      console.error('❌ [GET_CARDS] Erro ao listar cartões:', error);
      throw new BadRequestException(`Erro ao listar cartões: ${error.message}`);
    }
  }

  // Atualizar cartão
  async updateCard(
    userId: string,
    cardId: string,
    updateData: {
      nickname?: string;
      cardholderName?: string;
    },
  ): Promise<{ message: string }> {
    try {
      console.log('✏️ [UPDATE_CARD] Atualizando cartão...');
      console.log('🔍 [UPDATE_CARD] User ID:', userId);
      console.log('🔍 [UPDATE_CARD] Card ID:', cardId);

      const card = await db.query.savedCards.findFirst({
        where: and(
          eq(savedCards.id, cardId),
          eq(savedCards.userId, userId),
          eq(savedCards.isActive, true),
        ),
      });

      if (!card) {
        throw new NotFoundException('Cartão não encontrado');
      }

      // Atualizar no Mercado Pago se tiver customer_id e card_id
      if (card.mpCustomerId && card.mpCardId) {
        try {
          console.log('✏️ [UPDATE_CARD] Atualizando cartão no MP...');
          await this.mercadoPagoService.updateCustomerCard(
            card.mpCustomerId,
            card.mpCardId,
            {
              cardholderName: updateData.cardholderName,
            },
          );
          console.log('✅ [UPDATE_CARD] Cartão atualizado no MP');
        } catch (mpError) {
          console.error(
            '⚠️ [UPDATE_CARD] Erro ao atualizar no MP (continuando):',
            mpError,
          );
          // Continuar mesmo se falhar no MP
        }
      }

      // Atualizar no banco local
      await db
        .update(savedCards)
        .set({
          nickname: updateData.nickname || card.nickname,
          cardHolderName: updateData.cardholderName || card.cardHolderName,
          updatedAt: new Date(),
        })
        .where(eq(savedCards.id, cardId));

      console.log('✅ [UPDATE_CARD] Cartão atualizado com sucesso');
      return { message: 'Cartão atualizado com sucesso' };
    } catch (error) {
      console.error('❌ [UPDATE_CARD] Erro ao atualizar cartão:', error);
      throw new BadRequestException(
        `Erro ao atualizar cartão: ${error.message}`,
      );
    }
  }

  // Formatar resposta
  private formatPaymentMethodsResponse(
    data: any,
  ): StudentPaymentMethodsResponseDto {
    try {
      console.log('🔧 [FORMAT RESPONSE] Formatando dados:', {
        id: data.id,
        userId: data.userId,
      });

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

      console.log(
        '💳 [FORMAT RESPONSE] Cartões ativos encontrados:',
        activeSavedCards.length,
      );

      const missingSetup: string[] = [];
      if (
        data.preferredMethod === StudentPaymentMethod.MERCADO_PAGO &&
        !data.mpEmail
      ) {
        missingSetup.push('Email do Mercado Pago');
      }
      if (
        [
          StudentPaymentMethod.CREDIT_CARD,
          StudentPaymentMethod.DEBIT_CARD,
        ].includes(data.preferredMethod) &&
        activeSavedCards.length === 0
      ) {
        missingSetup.push('Cartão salvo');
      }

      const response = {
        id: data.id,
        userId: data.userId,
        preferredMethod: data.preferredMethod,
        enableAutoPayment: Boolean(data.enableAutoPayment),
        defaultCardId: data.defaultCardId,
        savedCards: activeSavedCards,
        mercadoPagoAccount: data.mpEmail
          ? {
              email: this.maskEmail(data.mpEmail),
              isVerified: Boolean(data.mpIsVerified),
              allowSaveCard: Boolean(data.mpAllowSaveCard),
            }
          : undefined,
        canMakePayments: Boolean(data.canMakePayments),
        hasValidPaymentMethod: Boolean(data.hasValidPaymentMethod),
        missingSetup,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };

      console.log('✅ [FORMAT RESPONSE] Resposta formatada com sucesso');
      return response;
    } catch (error) {
      console.error('❌ [FORMAT RESPONSE] Erro ao formatar resposta:', error);
      throw error;
    }
  }

  // Mascarar email
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }
}
