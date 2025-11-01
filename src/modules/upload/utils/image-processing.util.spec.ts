import { Test, TestingModule } from '@nestjs/testing';
import { ImageProcessingUtil } from './image-processing.util';
import { FileStorageUtil } from './file-storage.util';
import { ImageProcessingOptions } from '../interfaces/file.interface';

// Mock Sharp
const mockSharpInstance = {
  metadata: jest.fn().mockResolvedValue({
    width: 1920,
    height: 1080,
    format: 'jpeg',
  }),
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed image')),
};

jest.mock('sharp', () => {
  return jest.fn(() => mockSharpInstance);
});

describe('ImageProcessingUtil', () => {
  let service: ImageProcessingUtil;
  let mockFileStorageUtil: jest.Mocked<FileStorageUtil>;
  let mockSharp: jest.MockedFunction<any>;

  beforeEach(async () => {
    const mockFileStorageUtilValue = {
      saveFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageProcessingUtil,
        {
          provide: FileStorageUtil,
          useValue: mockFileStorageUtilValue,
        },
      ],
    }).compile();

    service = module.get<ImageProcessingUtil>(ImageProcessingUtil);
    mockFileStorageUtil = module.get(FileStorageUtil);

    // Get reference to the mocked sharp function
    mockSharp = require('sharp');

    // Reset sharp mock to default behavior
    mockSharp.mockImplementation(() => mockSharpInstance);

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processImage', () => {
    it('should process image and generate thumbnails', async () => {
      const buffer = Buffer.from('test image');
      const originalName = 'test.jpg';
      const category = 'profile';
      const options: ImageProcessingOptions = {
        generateThumbnails: true,
        thumbnailSizes: [
          { name: 'small', width: 150, height: 150 },
          { name: 'medium', width: 300, height: 300 },
        ],
        quality: 85,
        format: 'jpeg',
      };

      mockFileStorageUtil.saveFile
        .mockResolvedValueOnce({
          storedName: 'main-file.jpg',
          path: '/path/main-file.jpg',
          url: 'https://api.treinopro.com/static/images/profiles/main-file.jpg',
        })
        .mockResolvedValueOnce({
          storedName: 'small_test.jpg',
          path: '/path/small_test.jpg',
          url: 'https://api.treinopro.com/static/thumbnails/small_test.jpg',
        })
        .mockResolvedValueOnce({
          storedName: 'medium_test.jpg',
          path: '/path/medium_test.jpg',
          url: 'https://api.treinopro.com/static/thumbnails/medium_test.jpg',
        });

      const result = await service.processImage(
        buffer,
        originalName,
        category,
        options,
      );

      expect(result).toHaveProperty('mainFile');
      expect(result).toHaveProperty('thumbnails');
      expect(result.thumbnails).toHaveLength(2);
      expect(mockFileStorageUtil.saveFile).toHaveBeenCalledTimes(3);
    });

    it('should process image without thumbnails when generateThumbnails is false', async () => {
      const buffer = Buffer.from('test image');
      const originalName = 'test.jpg';
      const category = 'temp';
      const options: ImageProcessingOptions = {
        generateThumbnails: false,
        thumbnailSizes: [],
        quality: 85,
        format: 'jpeg',
      };

      mockFileStorageUtil.saveFile.mockResolvedValueOnce({
        storedName: 'main-file.jpg',
        path: '/path/main-file.jpg',
        url: 'https://api.treinopro.com/static/temp/main-file.jpg',
      });

      const result = await service.processImage(
        buffer,
        originalName,
        category,
        options,
      );

      expect(result).toHaveProperty('mainFile');
      expect(result.thumbnails).toHaveLength(0);
      expect(mockFileStorageUtil.saveFile).toHaveBeenCalledTimes(1);
    });

    it('should handle processing errors gracefully', async () => {
      const buffer = Buffer.from('test image');
      const originalName = 'test.jpg';
      const category = 'profile';
      const options: ImageProcessingOptions = {
        generateThumbnails: true,
        thumbnailSizes: [{ name: 'small', width: 150, height: 150 }],
        quality: 85,
        format: 'jpeg',
      };

      mockFileStorageUtil.saveFile.mockRejectedValue(new Error('Save failed'));

      await expect(
        service.processImage(buffer, originalName, category, options),
      ).rejects.toThrow('Falha no processamento de imagem');
    });
  });

  describe('optimizeImage', () => {
    it('should optimize JPEG image', async () => {
      const buffer = Buffer.from('test image');
      const options: ImageProcessingOptions = {
        generateThumbnails: false,
        thumbnailSizes: [],
        quality: 85,
        format: 'jpeg',
      };

      const result = await service.optimizeImage(buffer, options);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('processed image');
    });

    it('should optimize PNG image', async () => {
      const buffer = Buffer.from('test image');
      const options: ImageProcessingOptions = {
        generateThumbnails: false,
        thumbnailSizes: [],
        quality: 90,
        format: 'png',
      };

      const result = await service.optimizeImage(buffer, options);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should optimize WebP image', async () => {
      const buffer = Buffer.from('test image');
      const options: ImageProcessingOptions = {
        generateThumbnails: false,
        thumbnailSizes: [],
        quality: 80,
        format: 'webp',
      };

      const result = await service.optimizeImage(buffer, options);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle optimization errors', async () => {
      const buffer = Buffer.from('test image');
      const options: ImageProcessingOptions = {
        generateThumbnails: false,
        thumbnailSizes: [],
        quality: 85,
        format: 'jpeg',
      };

      // Mock sharp to throw error
      mockSharp.mockImplementationOnce(() => {
        throw new Error('Sharp error');
      });

      await expect(service.optimizeImage(buffer, options)).rejects.toThrow(
        'Falha na otimização da imagem',
      );
    });
  });

  describe('generateThumbnail', () => {
    it('should generate thumbnail with correct dimensions', async () => {
      const buffer = Buffer.from('test image');
      const width = 150;
      const height = 150;
      const quality = 85;

      const result = await service.generateThumbnail(
        buffer,
        width,
        height,
        quality,
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('processed image');
    });

    it('should handle thumbnail generation errors', async () => {
      const buffer = Buffer.from('test image');
      const width = 150;
      const height = 150;
      const quality = 85;

      // Mock sharp to throw error
      mockSharp.mockImplementationOnce(() => {
        throw new Error('Sharp error');
      });

      await expect(
        service.generateThumbnail(buffer, width, height, quality),
      ).rejects.toThrow('Falha na geração de thumbnail');
    });
  });

  describe('getImageMetadata', () => {
    it('should extract image metadata', async () => {
      const buffer = Buffer.from('test image');

      const result = await service.getImageMetadata(buffer);

      expect(result).toEqual({
        width: 1920,
        height: 1080,
        format: 'jpeg',
      });
    });

    it('should handle metadata extraction errors', async () => {
      const buffer = Buffer.from('test image');

      // Mock sharp to throw error
      mockSharp.mockImplementationOnce(() => {
        throw new Error('Sharp error');
      });

      await expect(service.getImageMetadata(buffer)).rejects.toThrow(
        'Falha na extração de metadados',
      );
    });
  });
});
