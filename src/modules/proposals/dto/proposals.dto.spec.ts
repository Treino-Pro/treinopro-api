import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProposalDto } from './proposals.dto';

describe('CreateProposalDto', () => {
  const basePayload = {
    locationName: 'Academia Central',
    locationAddress: 'Av. Paulista, 1000',
    trainingDate: '2026-05-20T14:00:00.000Z',
    trainingTime: '14:00',
    durationMinutes: 60,
    modalityName: 'Musculacao',
    price: 80,
    paymentMethod: 'credit_card',
  };

  it('exige savedCardCvv para cartao salvo em pagamento com cartao de credito', async () => {
    const dto = plainToInstance(CreateProposalDto, {
      ...basePayload,
      cardId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const errors = await validate(dto);
    const savedCardCvvError = errors.find(
      (error) => error.property === 'savedCardCvv',
    );

    expect(savedCardCvvError?.constraints).toBeDefined();
    expect(Object.values(savedCardCvvError?.constraints || {})).toContain(
      'Por motivos de segurança, o código de segurança (CVV) do seu cartão é obrigatório para confirmar o pagamento.',
    );
  });

  it('aceita savedCardCvv com 3 ou 4 digitos para cartao salvo', async () => {
    const dto = plainToInstance(CreateProposalDto, {
      ...basePayload,
      cardId: '123e4567-e89b-12d3-a456-426614174000',
      savedCardCvv: '1234',
    });

    const errors = await validate(dto);

    expect(
      errors.find((error) => error.property === 'savedCardCvv'),
    ).toBeUndefined();
  });
});
