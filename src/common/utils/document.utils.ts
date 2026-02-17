/**
 * Validação de CPF usando o algoritmo oficial de dígitos verificadores (módulo 11).
 */
export function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false; // sequência repetida

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i]) * (10 - i);
  }
  let rest = sum % 11;
  const dv1 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(clean[9]) !== dv1) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i]) * (11 - i);
  }
  rest = sum % 11;
  const dv2 = rest < 2 ? 0 : 11 - rest;
  return parseInt(clean[10]) === dv2;
}
