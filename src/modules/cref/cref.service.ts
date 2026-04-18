import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as FormDataLib from 'form-data';
import {
  CrefValidationResult,
  ConfefData,
  CrefFormatted,
} from './interfaces/cref.interface';
import { CrefCacheService } from './cref-cache.service';
import { CrefTechnicalErrorException } from './exceptions/cref-technical.exception';

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
  private readonly MAX_REDIRECTS = 10; // Máximo de redirects
  private readonly MAX_REDIRECTS_SESSION = 5; // Máximo de redirects para estabelecer sessão

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
      // Erros de negócio (formato inválido, CREF não encontrado, não bacharel) propagam diretamente
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Erros técnicos recuperáveis (rede, timeout, serviço instável) são sinalizados via exceção própria
      if (error instanceof CrefTechnicalErrorException) {
        throw error;
      }
      throw new CrefTechnicalErrorException(
        `Falha técnica ao validar CREF: ${error.message}`,
        error,
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

  async getTokenInfo(): Promise<{
    token: string;
    expiresAt: Date;
    isCached: boolean;
    ttl: number;
  }> {
    const cached = this.tokenCache && Date.now() < this.tokenCache.expires;
    const token = await this.getToken();

    return {
      token,
      expiresAt: this.tokenCache
        ? new Date(this.tokenCache.expires)
        : new Date(),
      isCached: cached,
      ttl: this.TOKEN_TTL,
    };
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

      // Validar se a resposta é JSON válido antes de processar
      if (
        typeof response.data === 'string' &&
        response.data.includes('<html>')
      ) {
        this.logger.error(
          `💥 [CREF] Resposta é HTML em vez de JSON. Pode ser um redirect não seguido.`,
        );
        throw new Error('Resposta do CONFEF é HTML em vez de JSON');
      }

      return this.processConfefResponse(response.data, crefNumber);
    } catch (error) {
      this.logger.error(`💥 [CREF] Erro na consulta CONFEF: ${error.message}`);
      throw new CrefTechnicalErrorException(
        'Falha na consulta ao CONFEF',
        error,
      );
    }
  }

  private createFormData(crefNumber: string): FormDataLib {
    const formData = new FormDataLib();
    formData.append('q', crefNumber);
    return formData;
  }

  private getBrowserHeaders(cookies?: string[]): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      Origin: 'https://www.confef.org.br',
      Referer: `${this.CONFEF_BASE}/registrados/`,
      Connection: 'keep-alive',
    };

    if (cookies && cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }

    return headers;
  }

  private getApiHeaders(
    formData: FormDataLib,
    token: string,
    cookies?: string[],
  ): Record<string, string> {
    return {
      ...formData.getHeaders(),
      ...this.getBrowserHeaders(cookies),
      Authorization: `Bearer ${token}`,
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
  }

  private getPageHeaders(cookies?: string[]): Record<string, string> {
    return {
      ...this.getBrowserHeaders(cookies),
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };
  }

  private extractCookies(
    response: any,
    existingCookies: string[] = [],
  ): string[] {
    const setCookieHeaders = response.headers['set-cookie'] || [];
    const newCookies = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders].filter(Boolean);
    return [...existingCookies, ...newCookies];
  }

  private normalizeUrl(url: string): string {
    return url.startsWith('http') ? url : `https://www.confef.org.br${url}`;
  }

  private isChallengeUrl(url: string): boolean {
    return url === '/challenge' || url.includes('/challenge');
  }

  private isRedirectStatus(status: number): boolean {
    return status === 302 || status === 301;
  }

  private extractTokenFromResponse(data: any): string {
    if (typeof data === 'string') {
      return data.trim();
    }
    if (data && typeof data === 'object') {
      return data.token || data.jwt || '';
    }
    return '';
  }

  private extractErrorInfo(error: unknown): { message: string; code: string } {
    if (error instanceof AxiosError) {
      return {
        message:
          error.message || error.response?.statusText || 'Erro desconhecido',
        code: error.code || 'UNKNOWN',
      };
    }
    const err = error as Error;
    return {
      message: err.message || String(error),
      code: err.name || 'UNKNOWN',
    };
  }

  private isRetryableError(errorMessage: string, errorCode: string): boolean {
    const retryableCodes = [
      'ECONNABORTED',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ERR_FR_TOO_MANY_REDIRECTS',
    ];
    const retryableMessages = [
      'timeout',
      'fetch',
      'redirect',
      'Máximo de redirects',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
    ];

    return (
      retryableCodes.includes(errorCode) ||
      retryableMessages.some((msg) => errorMessage.includes(msg))
    );
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retryCount: number,
    operationName: string,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const { message, code } = this.extractErrorInfo(error);

      if (
        this.isRetryableError(message, code) &&
        retryCount < this.MAX_RETRIES
      ) {
        const delay = Math.pow(2, retryCount) * 1000;
        this.logger.warn(
          `⚠️ [CREF] ${operationName} - Tentativa ${retryCount + 1}/${this.MAX_RETRIES}. Aguardando ${delay}ms...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retryCount + 1, operationName);
      }

      if (code === 'ECONNABORTED' || message.includes('timeout')) {
        this.logger.error(
          `💥 [CREF] ${operationName} - Timeout após múltiplas tentativas`,
        );
        throw new Error(`Timeout ao ${operationName}`);
      }

      throw error;
    }
  }

  private async followRedirectGet(
    url: string,
    redirectCount = 0,
    maxRedirects = this.MAX_REDIRECTS,
    visitedUrls: Map<string, number> = new Map(),
    cookies: string[] = [],
    headersOverride?: Record<string, string>,
  ): Promise<{ data: any; status: number; cookies: string[] }> {
    if (redirectCount >= maxRedirects) {
      throw new Error('Máximo de redirects excedido');
    }

    const targetUrl = this.normalizeUrl(url);

    // Contar visitas e detectar loops
    const visitCount = visitedUrls.get(targetUrl) || 0;
    visitedUrls.set(targetUrl, visitCount + 1);

    if (visitCount >= 2) {
      this.logger.error(
        `💥 [CREF] Loop detectado! URL visitada mais de 2 vezes: ${targetUrl}`,
      );
      throw new Error(
        `Loop de redirects detectado. URL visitada múltiplas vezes: ${targetUrl}`,
      );
    }

    this.logger.log(`🔄 [CREF] GET ${redirectCount + 1} para: ${targetUrl}`);

    const headers = headersOverride || this.getPageHeaders(cookies);
    const response = await axios.get(targetUrl, {
      headers,
      timeout: this.REQUEST_TIMEOUT,
      maxRedirects: 0,
      validateStatus: (status) => status < 600,
    });

    const allCookies = this.extractCookies(response, cookies);

    this.logger.log(
      `📡 [CREF] GET resposta: ${response.status}, Content-Type: ${response.headers['content-type']}`,
    );

    // Se retornou redirect, seguir
    if (this.isRedirectStatus(response.status)) {
      const redirectUrl = response.headers.location;
      if (!redirectUrl) {
        throw new Error('Redirect sem URL de destino');
      }

      // Se o redirect for para /challenge, resolver antes de continuar
      if (this.isChallengeUrl(redirectUrl)) {
        this.logger.log(`🛡️ [CREF] Challenge detectado, resolvendo...`);
        return this.followRedirectGet(
          redirectUrl,
          redirectCount + 1,
          maxRedirects,
          visitedUrls,
          allCookies,
          {
            ...this.getPageHeaders(allCookies),
            'Sec-Fetch-Site': 'same-origin',
          },
        );
      }

      // Seguir redirect
      const nextUrl = this.normalizeUrl(redirectUrl);
      this.logger.log(`🔄 [CREF] Seguindo redirect GET para: ${nextUrl}`);

      return this.followRedirectGet(
        nextUrl,
        redirectCount + 1,
        maxRedirects,
        visitedUrls,
        allCookies,
        headersOverride,
      );
    }

    return {
      data: response.data,
      status: response.status,
      cookies: allCookies,
    };
  }

  private async establishSession(): Promise<string[]> {
    this.logger.log(`🍪 [CREF] Estabelecendo sessão inicial...`);
    let cookies: string[] = [];

    try {
      // 1. GET na página de registrados para obter cookies iniciais
      const pageResult = await this.followRedirectGet(
        this.CONFEF_BASE + '/registrados/',
        0,
        this.MAX_REDIRECTS,
        new Map(),
        [],
        this.getPageHeaders(),
      );

      cookies = pageResult.cookies;
      this.logger.log(`🍪 [CREF] Cookies obtidos: ${cookies.length} cookies`);

      // 2. GET na API para estabelecer sessão completa
      try {
        await this.followRedirectGet(
          this.API_URL,
          0,
          this.MAX_REDIRECTS_SESSION,
          new Map(),
          cookies,
          {
            ...this.getBrowserHeaders(cookies),
            Accept: '*/*',
            'X-Requested-With': 'XMLHttpRequest',
          },
        );
        this.logger.log(`✅ [CREF] Sessão estabelecida com sucesso`);
      } catch (error) {
        this.logger.debug(
          `🔍 [CREF] Requisição de estabelecimento: ${error.message}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `⚠️ [CREF] Erro ao estabelecer sessão (continuando): ${error.message}`,
      );
    }

    return cookies;
  }

  private async resolveChallenge(
    challengeUrl: string,
    cookies: string[],
  ): Promise<string[]> {
    this.logger.log(`🛡️ [CREF] Resolvendo challenge...`);

    try {
      const result = await this.followRedirectGet(
        challengeUrl,
        0,
        this.MAX_REDIRECTS_SESSION,
        new Map(),
        cookies,
        {
          ...this.getPageHeaders(cookies),
          'Sec-Fetch-Site': 'same-origin',
        },
      );

      this.logger.log(`✅ [CREF] Challenge resolvido`);
      return result.cookies;
    } catch (error) {
      this.logger.warn(
        `⚠️ [CREF] Erro ao resolver challenge: ${error.message}`,
      );
      return cookies;
    }
  }

  private async followRedirect(
    url: string,
    token: string,
    crefNumber: string,
    redirectCount = 0,
    maxRedirects = this.MAX_REDIRECTS,
    visitedUrls: Map<string, number> = new Map(),
    cookies: string[] = [],
  ): Promise<{ data: any; status: number }> {
    if (redirectCount >= maxRedirects) {
      throw new Error('Máximo de redirects excedido');
    }

    const formData = this.createFormData(crefNumber);
    const targetUrl = this.normalizeUrl(url);

    // Contar visitas e detectar loops
    const visitCount = visitedUrls.get(targetUrl) || 0;
    visitedUrls.set(targetUrl, visitCount + 1);

    // Permitir visitar a API duas vezes (inicial e após challenge)
    if (visitCount >= 2 && targetUrl === this.API_URL) {
      this.logger.error(
        `💥 [CREF] Loop detectado! API visitada mais de 2 vezes: ${targetUrl}`,
      );
      throw new Error(
        `Loop de redirects detectado. API visitada múltiplas vezes: ${targetUrl}`,
      );
    }

    // Para outras URLs, não permitir visitar mais de uma vez
    if (visitCount >= 1 && targetUrl !== this.API_URL) {
      this.logger.error(
        `💥 [CREF] Loop detectado! URL já visitada: ${targetUrl}`,
      );
      throw new Error(
        `Loop de redirects detectado. URL repetida: ${targetUrl}`,
      );
    }

    this.logger.log(
      `🔄 [CREF] Requisição ${redirectCount + 1} para: ${targetUrl}`,
    );

    const headers = this.getApiHeaders(formData, token, cookies);
    const response = await axios.post(targetUrl, formData, {
      headers,
      timeout: this.REQUEST_TIMEOUT,
      maxRedirects: 0,
      validateStatus: (status) => status < 600,
    });

    const allCookies = this.extractCookies(response, cookies);

    this.logger.log(
      `📡 [CREF] Resposta: ${response.status}, Content-Type: ${response.headers['content-type']}`,
    );

    // Se retornou redirect, seguir
    if (this.isRedirectStatus(response.status)) {
      const redirectUrl = response.headers.location;
      if (!redirectUrl) {
        throw new Error('Redirect sem URL de destino');
      }

      // Se o redirect for para /challenge, resolver antes de continuar
      if (this.isChallengeUrl(redirectUrl)) {
        try {
          const updatedCookies = await this.resolveChallenge(
            redirectUrl,
            allCookies,
          );
          // Continuar para a API com cookies atualizados
          return this.followRedirect(
            this.API_URL,
            token,
            crefNumber,
            redirectCount + 1,
            maxRedirects,
            visitedUrls,
            updatedCookies,
          );
        } catch (error) {
          this.logger.warn(
            `⚠️ [CREF] Erro ao resolver challenge (continuando): ${error.message}`,
          );
        }
      }

      // Se o redirect for "/", voltar para a URL original da API
      const nextUrl =
        redirectUrl === '/' ||
        redirectUrl ===
          '/confefv2/includes/api/registrados_pf/get_registrados.php'
          ? this.API_URL
          : this.normalizeUrl(redirectUrl);

      this.logger.log(`🔄 [CREF] Seguindo redirect para: ${nextUrl}`);

      return this.followRedirect(
        nextUrl,
        token,
        crefNumber,
        redirectCount + 1,
        maxRedirects,
        visitedUrls,
        allCookies,
      );
    }

    // Se a resposta é HTML em vez de JSON, pode ser um redirect não detectado
    if (typeof response.data === 'string' && response.data.includes('<html>')) {
      this.logger.warn(
        `⚠️ [CREF] Resposta é HTML. Tentando extrair redirect do HTML...`,
      );
      const locationMatch = response.data.match(
        /location\s*=\s*['"]([^'"]+)['"]/i,
      );
      if (locationMatch && locationMatch[1]) {
        return this.followRedirect(
          locationMatch[1],
          token,
          crefNumber,
          redirectCount + 1,
          maxRedirects,
        );
      }
    }

    return { data: response.data, status: response.status };
  }

  private async makeConfefRequest(
    token: string,
    crefNumber: string,
    retryCount = 0,
  ) {
    return this.retryWithBackoff(
      async () => {
        this.logger.log(
          `📤 [CREF] Enviando POST para CONFEF com CREF: ${crefNumber}`,
        );

        // Estabelecer sessão inicial para evitar challenge
        const initialCookies = await this.establishSession();

        // Usar função recursiva para seguir todos os redirects com cookies
        const response = await this.followRedirect(
          this.API_URL,
          token,
          crefNumber,
          0,
          this.MAX_REDIRECTS,
          new Map(),
          initialCookies,
        );

        this.logger.log(`📡 [CREF] Resposta final: ${response.status}`);

        return { data: response.data, status: response.status };
      },
      retryCount,
      'requisição CONFEF',
    );
  }

  private processConfefResponse(
    responseData: any,
    crefNumber: string,
  ): ConfefData | null {
    // Log da estrutura completa para debug
    this.logger.debug(
      `🔍 [CREF] Estrutura da resposta: ${JSON.stringify(responseData).substring(0, 500)}`,
    );

    const data = responseData?.data || [];

    this.logger.log(
      `🔍 [CREF] Número de registros encontrados: ${data.length}`,
    );

    if (data.length === 0) {
      this.logger.warn(
        `⚠️ [CREF] Resposta vazia. Estrutura completa: ${JSON.stringify(responseData)}`,
      );
    }

    // Buscar correspondência - otimizado para performance
    for (const row of data) {
      // Mapear campos corretos da resposta da API (baseado na estrutura fornecida)
      const nome = row.Nome || row.nome;
      const situacao = row.Categoria || row.categoria;
      const uf = row.UF || row.uf;
      const naturezaTitulo = row.NaturezaTitulo || row.naturezaTitulo;
      const crefCompleto = row.NUM_REGISTRO || row.numeroRegistro;

      this.logger.debug(
        `🔍 [CREF] Verificando registro: ${crefCompleto} vs ${crefNumber}`,
      );

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

    return this.retryWithBackoff(
      async () => {
        this.logger.log(`🔑 [CREF] Obtendo novo token do CONFEF`);

        // Estabelecer sessão antes de buscar o token
        let cookies: string[] = [];
        try {
          cookies = await this.establishSession();
        } catch (error) {
          this.logger.warn(
            `⚠️ [CREF] Erro ao estabelecer sessão (continuando): ${error.message}`,
          );
        }

        // Usar a mesma função recursiva para gerenciar redirects
        const result = await this.followRedirectGet(
          this.TOKEN_URL,
          0,
          this.MAX_REDIRECTS,
          new Map(),
          cookies,
          {
            ...this.getBrowserHeaders(cookies),
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Cache-Control': 'no-cache',
          },
        );

        // Extrair token da resposta
        const token = this.extractTokenFromResponse(result.data);

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
      },
      retryCount,
      'obter token',
    );
  }
}
