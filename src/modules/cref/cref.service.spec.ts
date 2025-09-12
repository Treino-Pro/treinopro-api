import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CrefService } from './cref.service';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CrefService', () => {
  let service: CrefService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrefService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'CREF_API_URL') return 'https://api.confef.org.br/validate';
              if (key === 'CREF_API_TOKEN') return 'mock-token';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CrefService>(CrefService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Test isValidCrefFormat
  it('should return true for valid CREF format (UF-NUMBER)', () => {
    expect(service['isValidCrefFormat']('SP-123456')).toBe(true);
    expect(service['isValidCrefFormat']('RJ-987654')).toBe(true);
  });

  it('should return false for invalid CREF format', () => {
    expect(service['isValidCrefFormat']('123456')).toBe(false);
    expect(service['isValidCrefFormat']('SP123456')).toBe(false);
    expect(service['isValidCrefFormat']('SP-12345')).toBe(false); // Too short
    expect(service['isValidCrefFormat']('SP-1234567')).toBe(false); // Too long
    expect(service['isValidCrefFormat']('SP-ABCDEF')).toBe(false); // Non-digits
  });

  // Test isValidGraduationType
  it('should return true for BACHAREL', () => {
    expect(service['isValidGraduationType']('BACHAREL')).toBe(true);
  });

  it('should return true for LICENCIADO/BACHAREL', () => {
    expect(service['isValidGraduationType']('LICENCIADO/BACHAREL')).toBe(true);
  });

  it('should return false for only LICENCIADO', () => {
    expect(service['isValidGraduationType']('LICENCIADO')).toBe(false);
  });

  it('should return false for other graduation types', () => {
    expect(service['isValidGraduationType']('TECNÓLOGO')).toBe(false);
    expect(service['isValidGraduationType']('MESTRE')).toBe(false);
    expect(service['isValidGraduationType']('DOUTOR')).toBe(false);
  });

  it('should return false for null or empty graduation type', () => {
    expect(service['isValidGraduationType'](null)).toBe(false);
    expect(service['isValidGraduationType']('')).toBe(false);
  });

  // Test parseCrefNumber
  it('should parse CREF number correctly', () => {
    const result = service.parseCrefNumber('SP-106227');
    expect(result).toEqual({
      uf: 'SP',
      numero: '106227',
      full: 'SP-106227'
    });
  });

  it('should handle lowercase CREF', () => {
    const result = service.parseCrefNumber('rj-123456');
    expect(result).toEqual({
      uf: 'RJ',
      numero: '123456',
      full: 'RJ-123456'
    });
  });

  // Test getToken
  it('should fetch and cache token', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'new-test-token' } });
    const token = await service['getToken']();
    expect(token).toBe('new-test-token');
    expect(mockedAxios.get).toHaveBeenCalledWith(service['TOKEN_URL'], expect.any(Object));
    // Subsequent call should use cache
    await service['getToken']();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should throw error if token not found in response', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { someOtherKey: 'value' } });
    await expect(service['getToken']()).rejects.toThrow('Falha ao obter token de acesso');
  });

  // Test fetchFromConfef
  it('should fetch data from CONFEF API and return matching CREF', async () => {
    const mockConfefResponse = {
      data: [
        { 
          registro: 'SP-123456', 
          nome: 'João Silva', 
          categoria: 'BACHAREL', 
          uf: 'SP',
          naturezaTitulo: 'LICENCIADO/BACHAREL',
          NUM_REGISTRO: 'SP-123456'
        },
        { 
          registro: 'RJ-987654', 
          nome: 'Maria Souza', 
          categoria: 'LICENCIADO', 
          uf: 'RJ',
          naturezaTitulo: 'LICENCIADO',
          NUM_REGISTRO: 'RJ-987654'
        },
      ],
    };
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'test-token' } }); // For getToken
    mockedAxios.get.mockResolvedValueOnce({ data: mockConfefResponse }); // For fetchFromConfef

    const result = await service['fetchFromConfef']('SP-123456');
    expect(result).toEqual({
      nome: 'João Silva',
      categoria: 'BACHAREL',
      uf: 'SP',
      cref: 'SP-123456',
      naturezaTitulo: 'LICENCIADO/BACHAREL',
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(service['API_URL'], expect.any(Object));
  });

  it('should return null if CREF not found in CONFEF API', async () => {
    const mockConfefResponse = {
      data: [
        { registro: 'RJ-987654', nome: 'Maria Souza', categoria: 'LICENCIADO', uf: 'RJ' },
      ],
    };
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'test-token' } }); // For getToken
    mockedAxios.get.mockResolvedValueOnce({ data: mockConfefResponse }); // For fetchFromConfef

    const result = await service['fetchFromConfef']('SP-123456');
    expect(result).toBeNull();
  });

  it('should throw error if CONFEF API call fails', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'test-token' } }); // For getToken
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error')); // For fetchFromConfef

    await expect(service['fetchFromConfef']('SP-123456')).rejects.toThrow('Falha na consulta ao CONFEF');
  });

  // Test validateCref (main method)
  it('should successfully validate a valid CREF', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'test-token' } });
    mockedAxios.get.mockResolvedValueOnce({
      data: { 
        data: [{ 
          registro: 'SP-123456', 
          nome: 'João Silva', 
          categoria: 'BACHAREL', 
          uf: 'SP',
          naturezaTitulo: 'LICENCIADO/BACHAREL',
          NUM_REGISTRO: 'SP-123456'
        }] 
      },
    });

    const result = await service.validateCref('SP-123456');
    expect(result.isValid).toBe(true);
    expect(result.nome).toBe('João Silva');
    expect(result.categoria).toBe('BACHAREL');
  });

  it('should throw BadRequestException for invalid CREF format', async () => {
    await expect(service.validateCref('INVALID-CREF')).rejects.toThrow(BadRequestException);
    await expect(service.validateCref('INVALID-CREF')).rejects.toThrow('Formato de CREF inválido. Use: UF-NÚMERO (ex: SP-106227)');
  });

  it('should throw BadRequestException if CREF not found in CONFEF', async () => {
    // Mock do getToken
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'test-token' } });
    // Mock do fetchFromConfef - retorna dados vazios
    mockedAxios.get.mockResolvedValueOnce({ 
      data: { data: [] }, // No data found
      status: 200 
    });

    try {
      await service.validateCref('SP-123456');
      fail('Should have thrown an exception');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('CREF não encontrado no CONFEF');
    }
  });

  it('should throw BadRequestException for invalid graduation type (only LICENCIADO)', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'test-token' } });
    mockedAxios.get.mockResolvedValueOnce({
      data: { 
        data: [{ 
          registro: 'SP-123456', 
          nome: 'João Silva', 
          categoria: 'LICENCIADO', 
          uf: 'SP',
          naturezaTitulo: 'LICENCIADO',
          NUM_REGISTRO: 'SP-123456'
        }] 
      },
      status: 200
    });

    try {
      await service.validateCref('SP-123456');
      fail('Should have thrown an exception');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('Personal Trainer deve ser BACHAREL');
    }
  });

  it('should throw BadRequestException if CONFEF API call fails', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { token: 'test-token' } });
    mockedAxios.get.mockRejectedValueOnce(new Error('API is down'));

    await expect(service.validateCref('SP-123456')).rejects.toThrow(BadRequestException);
    await expect(service.validateCref('SP-123456')).rejects.toThrow('Erro na validação do CREF: Falha na consulta ao CONFEF');
  });
});
