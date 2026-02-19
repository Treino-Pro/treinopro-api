/**
 * Lançada quando a validação do CREF falha por erro técnico recuperável:
 * timeout, falha de rede, resposta HTML em vez de JSON, 5xx, redirect/challenge irresolvível.
 *
 * Diferente de BadRequestException (erro de negócio), este erro indica indisponibilidade
 * temporária do CONFEF e deve acionar o fallback de aprovação manual.
 */
export class CrefTechnicalErrorException extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'CrefTechnicalErrorException';
  }
}
