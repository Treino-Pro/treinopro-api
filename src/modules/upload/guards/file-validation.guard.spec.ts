import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, BadRequestException } from '@nestjs/common';
import { FileValidationGuard } from './file-validation.guard';
import { FileCategory } from '../dto/upload.dto';

// Mock Sharp
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      format: 'jpeg',
    }),
  }));

  return mockSharp;
});

describe('FileValidationGuard', () => {
  let guard: FileValidationGuard;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileValidationGuard],
    }).compile();

    guard = module.get<FileValidationGuard>(FileValidationGuard);

    // Mock ExecutionContext
    const mockGetRequest = jest.fn().mockReturnValue({
      file: {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from('test image'),
      },
      body: {
        category: FileCategory.PROFILE,
      },
    });

    const mockSwitchToHttp = jest.fn().mockReturnValue({
      getRequest: mockGetRequest,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    });

    mockExecutionContext = {
      switchToHttp: mockSwitchToHttp,
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should return true for valid file', async () => {
      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw error when no file is provided', async () => {
      const mockGetRequest = jest.fn().mockReturnValue({
        file: null,
        body: { category: FileCategory.PROFILE },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error for invalid category', async () => {
      const mockGetRequest = jest.fn().mockReturnValue({
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024 * 1024,
          buffer: Buffer.from('test image'),
        },
        body: { category: 'invalid' },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Categoria inválida: invalid',
      );
    });

    it('should throw error for file too large', async () => {
      const mockGetRequest = jest.fn().mockReturnValue({
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 10 * 1024 * 1024, // 10MB
          buffer: Buffer.from('test image'),
        },
        body: { category: FileCategory.PROFILE },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Arquivo muito grande',
      );
    });

    it('should throw error for invalid MIME type', async () => {
      const mockGetRequest = jest.fn().mockReturnValue({
        file: {
          originalname: 'test.txt',
          mimetype: 'text/plain',
          size: 1024,
          buffer: Buffer.from('test content'),
        },
        body: { category: FileCategory.PROFILE },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Tipo de arquivo não permitido',
      );
    });

    it('should throw error for empty filename', async () => {
      const mockGetRequest = jest.fn().mockReturnValue({
        file: {
          originalname: '',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('test image'),
        },
        body: { category: FileCategory.PROFILE },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Nome do arquivo inválido',
      );
    });

    it('should throw error for mismatched extension and MIME type', async () => {
      const mockGetRequest = jest.fn().mockReturnValue({
        file: {
          originalname: 'test.png',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('test image'),
        },
        body: { category: FileCategory.PROFILE },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Extensão do arquivo (png) não corresponde ao tipo MIME (image/jpeg)',
      );
    });

    it('should validate image dimensions for profile category', async () => {
      // Mock sharp to return large image
      const sharp = require('sharp');
      sharp.mockImplementation(() => ({
        metadata: jest.fn().mockResolvedValue({
          width: 3000,
          height: 2000,
          format: 'jpeg',
        }),
      }));

      const mockGetRequest = jest.fn().mockReturnValue({
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('test image'),
        },
        body: { category: FileCategory.PROFILE },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Imagem muito grande',
      );
    });

    it('should pass validation for image within dimensions', async () => {
      // Mock sharp to return normal sized image
      const sharp = require('sharp');
      sharp.mockImplementation(() => ({
        metadata: jest.fn().mockResolvedValue({
          width: 1000,
          height: 800,
          format: 'jpeg',
        }),
      }));

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should not validate dimensions for non-image files', async () => {
      const mockGetRequest = jest.fn().mockReturnValue({
        file: {
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('test content'),
        },
        body: { category: FileCategory.DOCUMENT },
      });
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });
  });

  describe('validateFileExtension', () => {
    it('should pass for valid JPEG extension', () => {
      expect(() =>
        guard['validateFileExtension']('test.jpg', 'image/jpeg'),
      ).not.toThrow();
    });

    it('should pass for valid PNG extension', () => {
      expect(() =>
        guard['validateFileExtension']('test.png', 'image/png'),
      ).not.toThrow();
    });

    it('should pass for valid WebP extension', () => {
      expect(() =>
        guard['validateFileExtension']('test.webp', 'image/webp'),
      ).not.toThrow();
    });

    it('should pass for valid PDF extension', () => {
      expect(() =>
        guard['validateFileExtension']('test.pdf', 'application/pdf'),
      ).not.toThrow();
    });

    it('should throw for mismatched extension and MIME type', () => {
      expect(() =>
        guard['validateFileExtension']('test.jpg', 'image/png'),
      ).toThrow(
        'Extensão do arquivo (jpg) não corresponde ao tipo MIME (image/png)',
      );
    });
  });

  describe('validateImageDimensions', () => {
    it('should pass for image within dimensions', async () => {
      const sharp = require('sharp');
      sharp.mockImplementation(() => ({
        metadata: jest.fn().mockResolvedValue({
          width: 1000,
          height: 800,
          format: 'jpeg',
        }),
      }));

      const buffer = Buffer.from('test image');
      const maxDimensions = { width: 2048, height: 2048 };

      await expect(
        guard['validateImageDimensions'](buffer, maxDimensions),
      ).resolves.not.toThrow();
    });

    it('should throw for image exceeding dimensions', async () => {
      const sharp = require('sharp');
      sharp.mockImplementation(() => ({
        metadata: jest.fn().mockResolvedValue({
          width: 3000,
          height: 2000,
          format: 'jpeg',
        }),
      }));

      const buffer = Buffer.from('test image');
      const maxDimensions = { width: 2048, height: 2048 };

      await expect(
        guard['validateImageDimensions'](buffer, maxDimensions),
      ).rejects.toThrow('Imagem muito grande');
    });

    it('should handle sharp errors gracefully', async () => {
      const sharp = require('sharp');
      sharp.mockImplementation(() => {
        throw new Error('Sharp error');
      });

      const buffer = Buffer.from('test image');
      const maxDimensions = { width: 2048, height: 2048 };

      await expect(
        guard['validateImageDimensions'](buffer, maxDimensions),
      ).rejects.toThrow('Erro ao validar dimensões da imagem');
    });
  });
});
