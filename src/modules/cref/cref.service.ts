import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CrefValidationResult, ConfefData, CrefFormatted } from './interfaces/cref.interface';

@Injectable()
export class CrefService {
  private readonly logger = new Logger(CrefService.name);
  private readonly CONFEF_BASE = 'https://www.confef.org.br/confefv2';
  private readonly TOKEN_URL = `${this.CONFEF_BASE}/includes/api/token_generator.php`;
  private readonly API_URL = `${this.CONFEF_BASE}/includes/api/registrados_pf/get_registrados.php`;
  
  private tokenCache: { token: string; expires: number } | null = null;
  private readonly TOKEN_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(private configService: ConfigService) {}

  async validateCref(crefNumber: string): Promise<CrefValidationResult> {
    this.logger.log(`🔍 [CREF] Iniciando validação do CREF: ${crefNumber}`);
    
    try {
      // 1. Validar formato: SP-106227
      if (!this.isValidCrefFormat(crefNumber)) {
        this.logger.warn(`❌ [CREF] Formato inválido: ${crefNumber}`);
        throw new BadRequestException('Formato de CREF inválido. Use: UF-NÚMERO (ex: SP-106227)');
      }

      // 2. Buscar no CONFEF
      this.logger.log(`🌐 [CREF] Buscando no CONFEF: ${crefNumber}`);
      const confefData = await this.fetchFromConfef(crefNumber);
      
      if (!confefData) {
        this.logger.warn(`❌ [CREF] CREF não encontrado: ${crefNumber}`);
        throw new BadRequestException('CREF não encontrado no CONFEF');
      }

      // 3. Validar tipo de graduação (apenas BACHAREL)
      if (!this.isValidGraduationType(confefData.naturezaTitulo)) {
        this.logger.warn(`❌ [CREF] Graduação inválida: ${confefData.naturezaTitulo}`);
        throw new BadRequestException(`Personal Trainer deve ser BACHAREL. Tipo encontrado: ${confefData.naturezaTitulo}`);
      }

      this.logger.log(`✅ [CREF] Validação bem-sucedida: ${crefNumber} - ${confefData.nome}`);

      return {
        isValid: true,
        crefNumber,
        nome: confefData.nome,
        categoria: confefData.categoria,
        uf: confefData.uf,
        naturezaTitulo: confefData.naturezaTitulo,
        validatedAt: new Date(),
        details: 'Validação bem-sucedida'
      };

    } catch (error) {
      this.logger.error(`💥 [CREF] Erro na validação: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Erro na validação do CREF: ${error.message}`);
    }
  }

  parseCrefNumber(crefNumber: string): CrefFormatted {
    const [uf, numero] = crefNumber.split('-');
    return {
      uf: uf.toUpperCase(),
      numero,
      full: crefNumber.toUpperCase()
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

  private async fetchFromConfef(crefNumber: string): Promise<ConfefData | null> {
    try {
      const token = await this.getToken();
      
      const response = await this.makeConfefRequest(token, crefNumber);
      
      this.logger.log(`📡 [CREF] Resposta CONFEF: ${response.status}`);

      // Se retornou 401, token expirou - tentar novamente com token novo
      if (response.status === 401) {
        this.logger.warn(`🔄 [CREF] Token expirado (401), renovando...`);
        this.tokenCache = null; // Limpar cache
        const newToken = await this.getToken();
        
        const retryResponse = await this.makeConfefRequest(newToken, crefNumber);
        this.logger.log(`📡 [CREF] Resposta CONFEF (retry): ${retryResponse.status}`);
        return this.processConfefResponse(retryResponse.data, crefNumber);
      }

      return this.processConfefResponse(response.data, crefNumber);
    } catch (error) {
      this.logger.error(`💥 [CREF] Erro na consulta CONFEF: ${error.message}`);
      throw new Error('Falha na consulta ao CONFEF');
    }
  }

  private async makeConfefRequest(token: string, crefNumber: string) {
    return await axios.get(this.API_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Origin': 'https://www.confef.org.br',
        'Referer': `${this.CONFEF_BASE}/registrados/`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      params: {
        draw: '1',
        start: '0',
        length: '200',
        'search[value]': crefNumber,
        'search[regex]': 'false',
      },
      timeout: 12000
    });
  }

  private processConfefResponse(responseData: any, crefNumber: string): ConfefData | null {
    const data = responseData?.data || [];
    
    // Debug: Log da resposta completa
    console.log('🔍 [CREF] Resposta completa da API CONFEF:', JSON.stringify(responseData, null, 2));
    console.log('🔍 [CREF] Dados extraídos:', JSON.stringify(data, null, 2));
    console.log('🔍 [CREF] Número de registros encontrados:', data.length);
    
    // Buscar correspondência
    console.log('🔍 [CREF] Buscando correspondência para CREF:', crefNumber);
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Mapear campos corretos da resposta da API
      const nome = row.Nome || row.nome || row['2'];
      const situacao = row.Categoria || row.categoria || row['4'];
      const uf = row.UF || row.uf || row['0'];
      const naturezaTitulo = row.NaturezaTitulo || row.naturezaTitulo || row['5'];
      const crefCompleto = row.NUM_REGISTRO || row.numeroRegistro || row['7'];
      const registroOriginal = row.Registro || row.registro || row['1'];
      
      console.log(`🔍 [CREF] Registro ${i + 1}:`, {
        nome,
        situacao,
        uf,
        naturezaTitulo,
        crefCompleto,
        registroOriginal
      });
      
      // Verificar se o CREF completo corresponde
      const crefMatch = crefCompleto === crefNumber;
      
      console.log(`🔍 [CREF] Match tests:`, {
        crefMatch,
        crefNumber,
        crefCompleto,
        naturezaTitulo
      });
      
      if (crefMatch) {
        this.logger.log(`✅ [CREF] Registro encontrado: ${nome}`);
        return {
          nome,
          categoria: situacao,
          uf,
          cref: crefCompleto,
          naturezaTitulo
        };
      }
    }

    this.logger.warn(`❌ [CREF] Nenhum registro encontrado para: ${crefNumber}`);
    return null;
  }

  private async getToken(): Promise<string> {
    // Verificar cache
    if (this.tokenCache && Date.now() < this.tokenCache.expires) {
      this.logger.log(`🔄 [CREF] Usando token em cache`);
      return this.tokenCache.token;
    }

    try {
      this.logger.log(`🔑 [CREF] Obtendo novo token do CONFEF`);
      
      const response = await axios.get(this.TOKEN_URL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://www.confef.org.br',
          'Referer': `${this.CONFEF_BASE}/registrados/`,
          'X-Requested-With': 'XMLHttpRequest',
        }
      });

      let token = '';
      try {
        const json = response.data;
        token = json.token || json.jwt || '';
      } catch {
        token = response.data?.toString().trim() || '';
      }

      if (!token) {
        throw new Error('Token não encontrado na resposta');
      }

      // Cache do token
      this.tokenCache = {
        token,
        expires: Date.now() + this.TOKEN_TTL
      };

      this.logger.log(`✅ [CREF] Token obtido com sucesso`);
      return token;
    } catch (error) {
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
