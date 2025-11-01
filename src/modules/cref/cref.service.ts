import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CrefValidationResult,
  ConfefData,
  CrefFormatted,
} from './interfaces/cref.interface';
import { CrefCacheService } from './cref-cache.service';

@Injectable()
export class CrefService {
  private readonly logger = new Logger(CrefService.name);
  private readonly CONFEF_BASE = 'https://www.confef.org.br/confefv2';
  private readonly TOKEN_URL = `${this.CONFEF_BASE}/includes/api/token_generator.php`;
  private readonly API_URL = `${this.CONFEF_BASE}/includes/api/registrados_pf/get_registrados.php`;

  private tokenCache: { token: string; expires: number } | null = null;
  private readonly TOKEN_TTL = 10 * 60 * 1000; // 10 minutos - aumentar cache
  private readonly REQUEST_TIMEOUT = 15000; // 15 segundos
  private readonly MAX_RETRIES = 3; // Número máximo de tentativas

  constructor(
    private configService: ConfigService,
    private crefCacheService: CrefCacheService,
  ) {}

  async validateCref(crefNumber: string): Promise<CrefValidationResult> {
    this.logger.log(`🔍 [CREF] Iniciando validação do CREF: ${crefNumber}`);

    try {
      // 1. Validar formato: SP-106227
      if (!this.isValidCrefFormat(crefNumber)) {
        this.logger.warn(`❌ [CREF] Formato inválido: ${crefNumber}`);
        throw new BadRequestException(
          'Formato de CREF inválido. Use: UF-NÚMERO (ex: SP-106227)',
        );
      }

      // 2. Verificar cache primeiro
      this.logger.log(`🔍 [CACHE] Verificando cache para CREF: ${crefNumber}`);
      const cachedResult = await this.crefCacheService.get(crefNumber);
      if (cachedResult) {
        this.logger.log(`🎯 [CACHE] CREF encontrado no cache: ${crefNumber}`);
        return cachedResult;
      }

      // 3. Buscar no CONFEF
      this.logger.log(`🌐 [CREF] Buscando no CONFEF: ${crefNumber}`);
      const confefData = await this.fetchFromConfef(crefNumber);

      if (!confefData) {
        this.logger.warn(`❌ [CREF] CREF não encontrado: ${crefNumber}`);
        throw new BadRequestException('CREF não encontrado no CONFEF');
      }

      // 4. Validar tipo de graduação (apenas BACHAREL)
      if (!this.isValidGraduationType(confefData.naturezaTitulo)) {
        this.logger.warn(
          `❌ [CREF] Graduação inválida: ${confefData.naturezaTitulo}`,
        );
        throw new BadRequestException(
          `Personal Trainer deve ser BACHAREL. Tipo encontrado: ${confefData.naturezaTitulo}`,
        );
      }

      this.logger.log(
        `✅ [CREF] Validação bem-sucedida: ${crefNumber} - ${confefData.nome}`,
      );

      const validationResult: CrefValidationResult = {
        isValid: true,
        crefNumber,
        nome: confefData.nome,
        categoria: confefData.categoria,
        uf: confefData.uf,
        naturezaTitulo: confefData.naturezaTitulo,
        validatedAt: new Date(),
        details: 'Validação bem-sucedida',
      };

      // 5. Armazenar no cache
      await this.crefCacheService.set(crefNumber, validationResult);
      this.logger.log(`💾 [CACHE] CREF armazenado no cache: ${crefNumber}`);

      return validationResult;
    } catch (error) {
      this.logger.error(`💥 [CREF] Erro na validação: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Erro na validação do CREF: ${error.message}`,
      );
    }
  }

  parseCrefNumber(crefNumber: string): CrefFormatted {
    const [uf, numero] = crefNumber.split('-');
    return {
      uf: uf.toUpperCase(),
      numero,
      full: crefNumber.toUpperCase(),
    };
  }

  private isValidCrefFormat(crefNumber: string): boolean {
    // Formato: UF-NÚMERO (ex: SP-106227, RJ-123456)
    const crefRegex = /^[A-Z]{2}-\d{6}$/;
    return crefRegex.test(crefNumber.toUpperCase());
  }

  private isValidGraduationType(naturezaTitulo: string): boolean {
    if (!naturezaTitulo) return false;

    const naturezaUpper = naturezaTitulo.toUpperCase();

    // Apenas BACHAREL é permitido
    return naturezaUpper.includes('BACHAREL');
  }

  private async fetchFromConfef(
    crefNumber: string,
  ): Promise<ConfefData | null> {
    try {
      const token = await this.getToken();

      const response = await this.makeConfefRequest(token, crefNumber);

      this.logger.log(`📡 [CREF] Resposta CONFEF: ${response.status}`);

      // Se retornou 401, token expirou - tentar novamente com token novo
      if (response.status === 401) {
        this.logger.warn(`🔄 [CREF] Token expirado (401), renovando...`);
        this.tokenCache = null; // Limpar cache
        const newToken = await this.getToken();

        const retryResponse = await this.makeConfefRequest(
          newToken,
          crefNumber,
        );
        this.logger.log(
          `📡 [CREF] Resposta CONFEF (retry): ${retryResponse.status}`,
        );
        return this.processConfefResponse(retryResponse.data, crefNumber);
      }

      return this.processConfefResponse(response.data, crefNumber);
    } catch (error) {
      this.logger.error(`💥 [CREF] Erro na consulta CONFEF: ${error.message}`);
      throw new Error('Falha na consulta ao CONFEF');
    }
  }

  private async makeConfefRequest(
    token: string,
    crefNumber: string,
    retryCount = 0,
  ) {
    const url = new URL(this.API_URL);
    url.searchParams.set('draw', '1');
    url.searchParams.set('start', '0');
    url.searchParams.set('length', '50');
    url.searchParams.set('search[value]', crefNumber);
    url.searchParams.set('search[regex]', 'false');

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.REQUEST_TIMEOUT,
    );

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Origin: 'https://www.confef.org.br',
          Referer: `${this.CONFEF_BASE}/registrados/`,
          'X-Requested-With': 'XMLHttpRequest',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);

      // Retry com backoff exponencial em caso de timeout ou erro de rede
      if (
        (error.name === 'AbortError' || error.message.includes('fetch')) &&
        retryCount < this.MAX_RETRIES
      ) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        this.logger.warn(
          `⚠️ [CREF] Timeout/erro na tentativa ${retryCount + 1}/${this.MAX_RETRIES}. Aguardando ${delay}ms...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeConfefRequest(token, crefNumber, retryCount + 1);
      }

      if (error.name === 'AbortError') {
        throw new Error('Request timeout após múltiplas tentativas');
      }
      throw error;
    }
  }

  private processConfefResponse(
    responseData: any,
    crefNumber: string,
  ): ConfefData | null {
    const data = responseData?.data || [];

    this.logger.log(
      `🔍 [CREF] Número de registros encontrados: ${data.length}`,
    );

    // Buscar correspondência - otimizado para performance
    for (const row of data) {
      // Mapear campos corretos da resposta da API
      const nome = row.Nome || row.nome || row['2'];
      const situacao = row.Categoria || row.categoria || row['4'];
      const uf = row.UF || row.uf || row['0'];
      const naturezaTitulo =
        row.NaturezaTitulo || row.naturezaTitulo || row['5'];
      const crefCompleto = row.NUM_REGISTRO || row.numeroRegistro || row['7'];

      // Verificar se o CREF completo corresponde - parar no primeiro match
      if (crefCompleto === crefNumber) {
        this.logger.log(`✅ [CREF] Registro encontrado: ${nome}`);
        return {
          nome,
          categoria: situacao,
          uf,
          cref: crefCompleto,
          naturezaTitulo,
        };
      }
    }

    this.logger.warn(
      `❌ [CREF] Nenhum registro encontrado para: ${crefNumber}`,
    );
    return null;
  }

  private async getToken(retryCount = 0): Promise<string> {
    // Verificar cache
    if (this.tokenCache && Date.now() < this.tokenCache.expires) {
      this.logger.log(`🔄 [CREF] Usando token em cache`);
      return this.tokenCache.token;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.REQUEST_TIMEOUT,
    );

    try {
      this.logger.log(`🔑 [CREF] Obtendo novo token do CONFEF`);

      const response = await fetch(this.TOKEN_URL, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Origin: 'https://www.confef.org.br',
          Referer: `${this.CONFEF_BASE}/registrados/`,
          'X-Requested-With': 'XMLHttpRequest',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let token = '';
      try {
        const json = await response.json();
        token = json.token || json.jwt || '';
      } catch {
        const text = await response.text();
        token = text?.trim() || '';
      }

      if (!token) {
        throw new Error('Token não encontrado na resposta');
      }

      // Cache do token
      this.tokenCache = {
        token,
        expires: Date.now() + this.TOKEN_TTL,
      };

      this.logger.log(`✅ [CREF] Token obtido com sucesso`);
      return token;
    } catch (error) {
      clearTimeout(timeoutId);

      // Retry com backoff exponencial
      if (
        (error.name === 'AbortError' || error.message.includes('fetch')) &&
        retryCount < this.MAX_RETRIES
      ) {
        const delay = Math.pow(2, retryCount) * 1000;
        this.logger.warn(
          `⚠️ [CREF] Timeout/erro ao obter token. Tentativa ${retryCount + 1}/${this.MAX_RETRIES}. Aguardando ${delay}ms...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.getToken(retryCount + 1);
      }

      if (error.name === 'AbortError') {
        this.logger.error(
          `💥 [CREF] Timeout ao obter token após múltiplas tentativas`,
        );
        throw new Error('Timeout ao obter token de acesso');
      }
      this.logger.error(`💥 [CREF] Erro ao obter token: ${error.message}`);
      throw new Error('Falha ao obter token de acesso');
    }
  }

  private normalizeCref(cref: string): string {
    return (cref || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  }

  private matchesCref(registro: string, crefNumber: string): boolean {
    const registroDigits = registro.replace(/\D/g, '');
    const crefDigits = crefNumber.replace(/\D/g, '');
    return registroDigits.endsWith(crefDigits);
  }
}
