import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CrefCacheService } from './cref-cache.service';
import { CrefValidationResult } from './interfaces/cref.interface';

describe('CrefCacheService', () => {
  let service: CrefCacheService;
  let cacheManager: any;

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrefCacheService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<CrefCacheService>(CrefCacheService);
    cacheManager = module.get(CACHE_MANAGER);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return cached validation result', async () => {
      const crefNumber = 'SP-123456';
      const mockValidation: CrefValidationResult = {
        isValid: true,
        crefNumber,
        nome: 'João Silva',
        categoria: 'BACHAREL',
        uf: 'SP',
        naturezaTitulo: 'LICENCIADO/BACHAREL',
        validatedAt: new Date(),
        details: 'Validação bem-sucedida',
      };

      mockCacheManager.get.mockResolvedValue(mockValidation);

      const result = await service.get(crefNumber);

      expect(result).toEqual(mockValidation);
      expect(mockCacheManager.get).toHaveBeenCalledWith('cref:SP-123456');
    });

    it('should return null when cache miss', async () => {
      const crefNumber = 'SP-123456';
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.get(crefNumber);

      expect(result).toBeNull();
      expect(mockCacheManager.get).toHaveBeenCalledWith('cref:SP-123456');
    });

    it('should return null when cache error occurs', async () => {
      const crefNumber = 'SP-123456';
      mockCacheManager.get.mockRejectedValue(new Error('Cache error'));

      const result = await service.get(crefNumber);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store validation result in cache', async () => {
      const crefNumber = 'SP-123456';
      const mockValidation: CrefValidationResult = {
        isValid: true,
        crefNumber,
        nome: 'João Silva',
        categoria: 'BACHAREL',
        uf: 'SP',
        naturezaTitulo: 'LICENCIADO/BACHAREL',
        validatedAt: new Date(),
        details: 'Validação bem-sucedida',
      };

      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set(crefNumber, mockValidation);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'cref:SP-123456',
        mockValidation,
        3600000, // 1 hora em ms
      );
    });

    it('should handle cache error gracefully', async () => {
      const crefNumber = 'SP-123456';
      const mockValidation: CrefValidationResult = {
        isValid: true,
        crefNumber,
        nome: 'João Silva',
        categoria: 'BACHAREL',
        uf: 'SP',
        naturezaTitulo: 'LICENCIADO/BACHAREL',
        validatedAt: new Date(),
        details: 'Validação bem-sucedida',
      };

      mockCacheManager.set.mockRejectedValue(new Error('Cache error'));

      // Should not throw
      await expect(
        service.set(crefNumber, mockValidation),
      ).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should remove validation from cache', async () => {
      const crefNumber = 'SP-123456';
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.delete(crefNumber);

      expect(mockCacheManager.del).toHaveBeenCalledWith('cref:SP-123456');
    });

    it('should handle cache error gracefully', async () => {
      const crefNumber = 'SP-123456';
      mockCacheManager.del.mockRejectedValue(new Error('Cache error'));

      // Should not throw
      await expect(service.delete(crefNumber)).resolves.toBeUndefined();
    });
  });

  describe('healthCheck', () => {
    it('should return true when cache is working', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);
      mockCacheManager.get.mockResolvedValue({
        test: true,
        timestamp: new Date(),
      });
      mockCacheManager.del.mockResolvedValue(undefined);

      const result = await service.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when cache is not working', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Cache error'));

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return default stats', async () => {
      const result = await service.getStats();

      expect(result).toEqual({
        hits: 0,
        misses: 0,
        keys: 0,
      });
    });
  });
});
