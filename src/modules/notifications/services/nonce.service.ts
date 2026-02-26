import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NonceService {
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('NONCE_SECRET_KEY') ||
      'default-secret-change-in-prod';
  }

  /**
   * Gera um nonce assinado para uma proposta
   * Formato: uuid:timestamp:signature
   */
  generateNonce(proposalId: string, personalId: string): string {
    const uuid = randomUUID();
    const timestamp = Date.now();
    const data = `${proposalId}:${personalId}:${timestamp}:${uuid}`;
    const signature = createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex');
    return `${uuid}:${timestamp}:${signature}`;
  }

  /**
   * Valida um nonce assinado
   * @param nonce Nonce a ser validado
   * @param proposalId ID da proposta
   * @param personalId ID do personal trainer
   * @param maxAgeSeconds Idade máxima do nonce em segundos (padrão: 5 minutos)
   * @returns true se o nonce é válido, false caso contrário
   */
  validateNonce(
    nonce: string,
    proposalId: string,
    personalId: string,
    maxAgeSeconds: number = 300,
  ): boolean {
    try {
      const parts = nonce.split(':');
      if (parts.length !== 3) {
        return false;
      }

      const [uuid, timestampStr, signature] = parts;
      const timestamp = parseInt(timestampStr, 10);

      if (isNaN(timestamp)) {
        return false;
      }

      // Verificar idade do nonce
      const age = (Date.now() - timestamp) / 1000;
      if (age > maxAgeSeconds) {
        return false; // Nonce expirado
      }

      if (age < 0) {
        return false; // Timestamp no futuro (relógio desincronizado)
      }

      // Reconstruir e verificar assinatura
      const data = `${proposalId}:${personalId}:${timestamp}:${uuid}`;
      const expectedSignature = createHmac('sha256', this.secretKey)
        .update(data)
        .digest('hex');

      return signature === expectedSignature;
    } catch {
      return false;
    }
  }
}
