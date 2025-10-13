export interface CrefValidationResult {
  isValid: boolean;
  crefNumber: string;
  nome?: string;
  categoria?: string;
  uf?: string;
  naturezaTitulo?: string;
  validatedAt: Date;
  details: string;
}

export interface ConfefData {
  nome: string;
  categoria: string;
  uf: string;
  cref: string;
  naturezaTitulo: string;
}

export interface CrefFormatted {
  uf: string;
  numero: string;
  full: string; // SP-106227
}
