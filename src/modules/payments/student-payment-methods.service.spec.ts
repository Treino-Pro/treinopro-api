import { BadRequestException } from '@nestjs/common';
import { StudentPaymentMethodsService } from './student-payment-methods.service';
import { StudentPaymentMethod } from './dto/student-payment-methods.dto';

describe('StudentPaymentMethodsService CVV guard', () => {
  let service: StudentPaymentMethodsService;

  beforeEach(() => {
    service = new StudentPaymentMethodsService({} as any, {} as any);
  });

  it('bloqueia cartao salvo de credito sem CVV', () => {
    expect(() =>
      service['assertCreditCardSecurityCode']({
        classId: 'proposal-1',
        paymentMethod: StudentPaymentMethod.CREDIT_CARD,
        cardId: 'card-1',
      } as any),
    ).toThrow(BadRequestException);

    expect(() =>
      service['assertCreditCardSecurityCode']({
        classId: 'proposal-1',
        paymentMethod: StudentPaymentMethod.CREDIT_CARD,
        cardId: 'card-1',
      } as any),
    ).toThrow(
      'Por motivos de segurança, o código de segurança (CVV) do seu cartão é obrigatório para confirmar o pagamento.',
    );
  });

  it('normaliza o CVV recebido para cartao salvo de credito', () => {
    const processDto = {
      classId: 'proposal-1',
      paymentMethod: StudentPaymentMethod.CREDIT_CARD,
      cardId: 'card-1',
      savedCardCvv: ' 123 ',
    } as any;

    const result = service['assertCreditCardSecurityCode'](processDto);

    expect(result).toBe('123');
    expect(processDto.savedCardCvv).toBe('123');
  });
});
