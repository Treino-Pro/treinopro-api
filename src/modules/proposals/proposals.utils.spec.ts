import { buildTrainingStartDate, isProposalExpired } from './proposals.utils';

describe('proposals.utils', () => {
  it('preserva a data de calendario do ISO ao combinar com trainingTime', () => {
    const result = buildTrainingStartDate(
      '2026-04-18T00:43:00.000Z',
      '00:43',
    );

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(43);
  });

  it('nao considera a proposta expirada antes do horario local correto', () => {
    const now = new Date(2026, 3, 18, 0, 38, 32, 754);

    const expired = isProposalExpired(now, {
      trainingDate: '2026-04-18T00:43:00.000Z',
      trainingTime: '00:43',
    });

    expect(expired).toBe(false);
  });
});
