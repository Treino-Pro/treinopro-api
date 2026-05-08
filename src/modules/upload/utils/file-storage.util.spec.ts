import { Test, TestingModule } from '@nestjs/testing';
import { FileStorageUtil } from './file-storage.util';
import * as fs from 'fs/promises';
import * as sharp from 'sharp';

// Mock fs/promises
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

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

describe('FileStorageUtil', () => {
  let service: FileStorageUtil;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileStorageUtil],
    }).compile();

    service = module.get<FileStorageUtil>(FileStorageUtil);

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateUniqueFileName', () => {
    it('should generate unique filename with original extension', () => {
      const originalName = 'test-image.jpg';
      const result = service.generateUniqueFileName(originalName);

      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
      );
    });

    it('should handle files without extension', () => {
      const originalName = 'test-file';
      const result = service.generateUniqueFileName(originalName);

      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('getStoragePath', () => {
    it('should return correct path for profile category', () => {
      const result = service.getStoragePath('profile', 'test.jpg');
      expect(result).toContain('images/profiles/test.jpg');
    });

    it('should return correct path for document category', () => {
      const result = service.getStoragePath('document', 'test.pdf');
      expect(result).toContain('images/documents/test.pdf');
    });

    it('should return correct path for temp category', () => {
      const result = service.getStoragePath('temp', 'test.jpg');
      expect(result).toContain('temp/test.jpg');
    });
  });

  describe('getPublicUrl', () => {
    it('should return correct URL for profile category', () => {
      const result = service.getPublicUrl('profile', 'test.jpg');
      expect(result).toBe(
        'https://api.treinopro.com/static/images/profiles/test.jpg',
      );
    });

    it('should return correct URL for document category', () => {
      const result = service.getPublicUrl('document', 'test.pdf');
      expect(result).toBe(
        'https://api.treinopro.com/static/images/documents/test.pdf',
      );
    });
  });

  describe('saveFile', () => {
    it('should save file successfully', async () => {
      const buffer = Buffer.from('test content');
      const originalName = 'test.jpg';
      const category = 'profile';
      const mimeType = 'image/jpeg';

      mockedFs.writeFile.mockResolvedValue(undefined);

      const result = await service.saveFile(
        buffer,
        originalName,
        category,
        mimeType,
      );

      expect(result).toHaveProperty('storedName');
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('url');
      expect(result.storedName).toMatch(/^[0-9a-f-]+\.jpg$/);
      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('images/profiles'),
        { recursive: true },
      );
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('images/profiles'),
        buffer,
      );
    });

    it('should throw error when file save fails', async () => {
      const buffer = Buffer.from('test content');
      const originalName = 'test.jpg';
      const category = 'profile';
      const mimeType = 'image/jpeg';

      mockedFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(
        service.saveFile(buffer, originalName, category, mimeType),
      ).rejects.toThrow('Falha ao salvar arquivo');
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const filePath = '/path/to/file.jpg';
      mockedFs.unlink.mockResolvedValue(undefined);

      await service.deleteFile(filePath);

      expect(mockedFs.unlink).toHaveBeenCalledWith(filePath);
    });

    it('should throw error when file deletion fails', async () => {
      const filePath = '/path/to/file.jpg';
      mockedFs.unlink.mockRejectedValue(new Error('Delete failed'));

      await expect(service.deleteFile(filePath)).rejects.toThrow(
        'Falha ao deletar arquivo',
      );
    });
  });

  describe('validateFile', () => {
    it('should pass validation for valid file', async () => {
      const buffer = Buffer.alloc(1024); // 1KB
      const mimeType = 'image/jpeg';
      const options = {
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        category: 'profile',
      };

      await expect(
        service.validateFile(buffer, mimeType, options),
      ).resolves.not.toThrow();
    });

    it('should throw error for file too large', async () => {
      const buffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const mimeType = 'image/jpeg';
      const options = {
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        category: 'profile',
      };

      await expect(
        service.validateFile(buffer, mimeType, options),
      ).rejects.toThrow('Arquivo muito grande');
    });

    it('should throw error for invalid MIME type', async () => {
      const buffer = Buffer.alloc(1024);
      const mimeType = 'text/plain';
      const options = {
        maxSize: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        category: 'profile',
      };

      await expect(
        service.validateFile(buffer, mimeType, options),
      ).rejects.toThrow('Tipo de arquivo não permitido');
    });

    it('should throw error when image dimensions exceed limits', async () => {
      // Mock sharp to return large image
      (sharp as any).mockImplementation(() => ({
        metadata: jest.fn().mockResolvedValue({
          width: 5000,
          height: 5000,
        }),
      }));

      const buffer = Buffer.alloc(1024);
      const mimeType = 'image/jpeg';
      const options = {
        maxSize: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg'],
        maxDimensions: { width: 2048, height: 2048 },
        category: 'profile',
      };

      await expect(
        service.validateFile(buffer, mimeType, options),
      ).rejects.toThrow('Imagem muito grande');
    });

    it('should pass when image dimensions are within limits', async () => {
      // Mock sharp to return normal image
      (sharp as any).mockImplementation(() => ({
        metadata: jest.fn().mockResolvedValue({
          width: 1024,
          height: 768,
        }),
      }));

      const buffer = Buffer.alloc(1024);
      const mimeType = 'image/jpeg';
      const options = {
        maxSize: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg'],
        maxDimensions: { width: 2048, height: 2048 },
        category: 'profile',
      };

      await expect(
        service.validateFile(buffer, mimeType, options),
      ).resolves.not.toThrow();
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockedFs.access.mockResolvedValue(undefined);

      const result = await service.fileExists('/path/to/file.jpg');

      expect(result).toBe(true);
      expect(mockedFs.access).toHaveBeenCalledWith('/path/to/file.jpg');
    });

    it('should return false when file does not exist', async () => {
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const result = await service.fileExists('/path/to/file.jpg');

      expect(result).toBe(false);
    });
  });
});
