import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { FileStorageUtil } from './utils/file-storage.util';
import { ImageProcessingUtil } from './utils/image-processing.util';
import { FileCategory } from './dto/upload.dto';

// Mock database
const mockDb = {
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue([
    {
      id: 'file-id',
      originalName: 'test.jpg',
      storedName: 'uuid-test.jpg',
      mimeType: 'image/jpeg',
      size: 1024,
      path: '/path/test.jpg',
      url: 'https://api.treinopro.com/static/images/profiles/uuid-test.jpg',
      category: 'profile',
      isProcessed: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  query: {
    files: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
  delete: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
};

describe('UploadService', () => {
  let service: UploadService;
  let mockFileStorageUtil: jest.Mocked<FileStorageUtil>;
  let mockImageProcessingUtil: jest.Mocked<ImageProcessingUtil>;

  beforeEach(async () => {
    const mockFileStorageUtilValue = {
      validateFile: jest.fn(),
      saveFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    const mockImageProcessingUtilValue = {
      processImage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
        {
          provide: FileStorageUtil,
          useValue: mockFileStorageUtilValue,
        },
        {
          provide: ImageProcessingUtil,
          useValue: mockImageProcessingUtilValue,
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    mockFileStorageUtil = module.get(FileStorageUtil);
    mockImageProcessingUtil = module.get(ImageProcessingUtil);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload image file successfully', async () => {
      const file = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test image'),
      } as Express.Multer.File;

      const uploadDto = {
        category: FileCategory.PROFILE,
        userId: 'user-id',
        metadata: '{"description": "Profile photo"}',
      };

      const userId = 'user-id';

      mockFileStorageUtil.validateFile.mockResolvedValue(undefined);
      mockImageProcessingUtil.processImage.mockResolvedValue({
        mainFile: {
          storedName: 'uuid-test.jpg',
          path: '/path/test.jpg',
          url: 'https://api.treinopro.com/static/images/profiles/uuid-test.jpg',
        },
        thumbnails: [],
      });

      const result = await service.uploadFile(file, uploadDto, userId);

      expect(result).toHaveProperty('id');
      expect(result.originalName).toBe('test.jpg');
      expect(result.category).toBe('profile');
      expect(mockFileStorageUtil.validateFile).toHaveBeenCalled();
      expect(mockImageProcessingUtil.processImage).toHaveBeenCalled();
    });

    it('should upload non-image file successfully', async () => {
      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('test pdf'),
      } as Express.Multer.File;

      const uploadDto = {
        category: FileCategory.DOCUMENT,
        userId: 'user-id',
      };

      const userId = 'user-id';

      mockFileStorageUtil.validateFile.mockResolvedValue(undefined);
      mockFileStorageUtil.saveFile.mockResolvedValue({
        storedName: 'uuid-test.pdf',
        path: '/path/test.pdf',
        url: 'https://api.treinopro.com/static/images/documents/uuid-test.pdf',
      });

      const result = await service.uploadFile(file, uploadDto, userId);

      expect(result).toHaveProperty('id');
      expect(result.originalName).toBe('test.jpg');
      expect(result.category).toBe('profile'); // Mock retorna profile
      expect(mockFileStorageUtil.saveFile).toHaveBeenCalled();
      expect(mockImageProcessingUtil.processImage).not.toHaveBeenCalled();
    });

    it('should throw error when validation fails', async () => {
      const file = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 10 * 1024 * 1024, // 10MB
        buffer: Buffer.from('test image'),
      } as Express.Multer.File;

      const uploadDto = {
        category: FileCategory.PROFILE,
        userId: 'user-id',
      };

      const userId = 'user-id';

      mockFileStorageUtil.validateFile.mockRejectedValue(
        new Error('File too large'),
      );

      await expect(service.uploadFile(file, uploadDto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error when image processing fails', async () => {
      const file = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test image'),
      } as Express.Multer.File;

      const uploadDto = {
        category: FileCategory.PROFILE,
        userId: 'user-id',
      };

      const userId = 'user-id';

      mockFileStorageUtil.validateFile.mockResolvedValue(undefined);
      mockImageProcessingUtil.processImage.mockRejectedValue(
        new Error('Processing failed'),
      );

      await expect(service.uploadFile(file, uploadDto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getFileById', () => {
    it('should return file when found', async () => {
      const fileId = 'file-id';
      const mockFile = {
        id: fileId,
        originalName: 'test.jpg',
        storedName: 'uuid-test.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        url: 'https://api.treinopro.com/static/images/profiles/uuid-test.jpg',
        category: 'profile',
        isProcessed: true,
        metadata: null,
        createdAt: new Date(),
      };

      mockDb.query.files.findFirst.mockResolvedValue(mockFile);

      const result = await service.getFileById(fileId);

      expect(result).toEqual(
        expect.objectContaining({
          id: fileId,
          originalName: 'test.jpg',
          category: 'profile',
        }),
      );
    });

    it('should throw error when file not found', async () => {
      const fileId = 'non-existent-id';
      mockDb.query.files.findFirst.mockResolvedValue(null);

      await expect(service.getFileById(fileId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getFilesByUserId', () => {
    it('should return files for user', async () => {
      const userId = 'user-id';
      const mockFiles = [
        {
          id: 'file1',
          originalName: 'test1.jpg',
          category: 'profile',
          createdAt: new Date(),
        },
        {
          id: 'file2',
          originalName: 'test2.pdf',
          category: 'document',
          createdAt: new Date(),
        },
      ];

      mockDb.query.files.findMany.mockResolvedValue(mockFiles);

      const result = await service.getFilesByUserId(userId);

      expect(result).toHaveLength(2);
      expect(mockDb.query.files.findMany).toHaveBeenCalled();
    });

    it('should return files filtered by category', async () => {
      const userId = 'user-id';
      const category = 'profile';
      const mockFiles = [
        {
          id: 'file1',
          originalName: 'test1.jpg',
          category: 'profile',
          createdAt: new Date(),
        },
      ];

      mockDb.query.files.findMany.mockResolvedValue(mockFiles);

      const result = await service.getFilesByUserId(userId, category);

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('profile');
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const fileId = 'file-id';
      const userId = 'user-id';
      const mockFile = {
        id: fileId,
        path: '/path/test.jpg',
        userId: userId,
      };

      mockDb.query.files.findFirst.mockResolvedValue(mockFile);
      mockFileStorageUtil.deleteFile.mockResolvedValue(undefined);
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });

      await service.deleteFile(fileId, userId);

      expect(mockFileStorageUtil.deleteFile).toHaveBeenCalledWith(
        '/path/test.jpg',
      );
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw error when file not found', async () => {
      const fileId = 'non-existent-id';
      const userId = 'user-id';

      mockDb.query.files.findFirst.mockResolvedValue(null);

      await expect(service.deleteFile(fileId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error when user does not have permission', async () => {
      const fileId = 'file-id';
      const userId = 'user-id';
      const mockFile = {
        id: fileId,
        path: '/path/test.jpg',
        userId: 'other-user-id',
      };

      mockDb.query.files.findFirst.mockResolvedValue(mockFile);

      await expect(service.deleteFile(fileId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error when file deletion fails', async () => {
      const fileId = 'file-id';
      const userId = 'user-id';
      const mockFile = {
        id: fileId,
        path: '/path/test.jpg',
        userId: userId,
      };

      mockDb.query.files.findFirst.mockResolvedValue(mockFile);
      mockFileStorageUtil.deleteFile.mockRejectedValue(
        new Error('Delete failed'),
      );

      await expect(service.deleteFile(fileId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cleanupTempFiles', () => {
    it('should cleanup temp files successfully', async () => {
      const mockTempFiles = [
        { id: 'temp1', path: '/path/temp1.jpg' },
        { id: 'temp2', path: '/path/temp2.jpg' },
      ];

      mockDb.query.files.findMany.mockResolvedValue(mockTempFiles);
      mockFileStorageUtil.deleteFile.mockResolvedValue(undefined);
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.cleanupTempFiles();

      expect(result).toBe(2);
      expect(mockFileStorageUtil.deleteFile).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockTempFiles = [
        { id: 'temp1', path: '/path/temp1.jpg' },
        { id: 'temp2', path: '/path/temp2.jpg' },
      ];

      mockDb.query.files.findMany.mockResolvedValue(mockTempFiles);
      mockFileStorageUtil.deleteFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Delete failed'));
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.cleanupTempFiles();

      expect(result).toBe(1); // Only one successful deletion
    });
  });

  describe('private methods', () => {
    it('should return correct max size for category', () => {
      expect(service['getMaxSizeForCategory']('profile')).toBe(5 * 1024 * 1024);
      expect(service['getMaxSizeForCategory']('document')).toBe(
        10 * 1024 * 1024,
      );
      expect(service['getMaxSizeForCategory']('temp')).toBe(5 * 1024 * 1024);
    });

    it('should return correct allowed MIME types for category', () => {
      expect(service['getAllowedMimeTypesForCategory']('profile')).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
      ]);
      expect(service['getAllowedMimeTypesForCategory']('document')).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ]);
    });

    it('should return correct max dimensions for category', () => {
      expect(service['getMaxDimensionsForCategory']('profile')).toEqual({
        width: 2048,
        height: 2048,
      });
      expect(service['getMaxDimensionsForCategory']('document')).toEqual({
        width: 4096,
        height: 4096,
      });
    });
  });
});
