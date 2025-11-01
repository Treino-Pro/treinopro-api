import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { FileCategory } from './dto/upload.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('UploadController', () => {
  let controller: UploadController;
  let mockUploadService: jest.Mocked<UploadService>;

  beforeEach(async () => {
    const mockUploadServiceValue = {
      uploadFile: jest.fn(),
      getFileById: jest.fn(),
      getFilesByUserId: jest.fn(),
      deleteFile: jest.fn(),
      cleanupTempFiles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: UploadService,
          useValue: mockUploadServiceValue,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UploadController>(UploadController);
    mockUploadService = module.get(UploadService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadProfileImage', () => {
    it('should upload profile image successfully', async () => {
      const file = {
        originalname: 'profile.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test image'),
      } as Express.Multer.File;

      const uploadDto = {
        category: FileCategory.PROFILE,
        metadata: '{"description": "Profile photo"}',
      };

      const req = {
        user: { id: 'user-id' },
      };

      const expectedResult = {
        id: 'file-id',
        originalName: 'profile.jpg',
        storedName: 'uuid-profile.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        url: 'https://api.treinopro.com/static/images/profiles/uuid-profile.jpg',
        category: 'profile',
        isProcessed: true,
        metadata: { description: 'Profile photo' },
        createdAt: new Date(),
      };

      mockUploadService.uploadFile.mockResolvedValue(expectedResult);

      const result = await controller.uploadProfileImage(file, uploadDto, req);

      expect(result).toEqual(expectedResult);
      expect(mockUploadService.uploadFile).toHaveBeenCalledWith(
        file,
        { ...uploadDto, category: FileCategory.PROFILE },
        'user-id',
      );
    });
  });

  describe('uploadDocument', () => {
    it('should upload document successfully', async () => {
      const file = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('test pdf'),
      } as Express.Multer.File;

      const uploadDto = {
        category: FileCategory.DOCUMENT,
        metadata: '{"documentType": "RG"}',
      };

      const req = {
        user: { id: 'user-id' },
      };

      const expectedResult = {
        id: 'file-id',
        originalName: 'document.pdf',
        storedName: 'uuid-document.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        url: 'https://api.treinopro.com/static/images/documents/uuid-document.pdf',
        category: 'document',
        isProcessed: true,
        metadata: { documentType: 'RG' },
        createdAt: new Date(),
      };

      mockUploadService.uploadFile.mockResolvedValue(expectedResult);

      const result = await controller.uploadDocument(file, uploadDto, req);

      expect(result).toEqual(expectedResult);
      expect(mockUploadService.uploadFile).toHaveBeenCalledWith(
        file,
        { ...uploadDto, category: FileCategory.DOCUMENT },
        'user-id',
      );
    });
  });

  describe('uploadTempFile', () => {
    it('should upload temp file successfully', async () => {
      const file = {
        originalname: 'temp.jpg',
        mimetype: 'image/jpeg',
        size: 512,
        buffer: Buffer.from('test image'),
      } as Express.Multer.File;

      const uploadDto = {
        category: FileCategory.TEMP,
      };

      const req = {
        user: { id: 'user-id' },
      };

      const expectedResult = {
        id: 'file-id',
        originalName: 'temp.jpg',
        storedName: 'uuid-temp.jpg',
        mimeType: 'image/jpeg',
        size: 512,
        url: 'https://api.treinopro.com/static/temp/uuid-temp.jpg',
        category: 'temp',
        isProcessed: false,
        metadata: null,
        createdAt: new Date(),
      };

      mockUploadService.uploadFile.mockResolvedValue(expectedResult);

      const result = await controller.uploadTempFile(file, uploadDto, req);

      expect(result).toEqual(expectedResult);
      expect(mockUploadService.uploadFile).toHaveBeenCalledWith(
        file,
        { ...uploadDto, category: FileCategory.TEMP },
        'user-id',
      );
    });
  });

  describe('getFile', () => {
    it('should return file by id', async () => {
      const fileId = 'file-id';
      const expectedResult = {
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

      mockUploadService.getFileById.mockResolvedValue(expectedResult);

      const result = await controller.getFile(fileId);

      expect(result).toEqual(expectedResult);
      expect(mockUploadService.getFileById).toHaveBeenCalledWith(fileId);
    });
  });

  describe('getUserFiles', () => {
    it('should return user files', async () => {
      const userId = 'user-id';
      const body = { category: 'profile' };
      const expectedResult = [
        {
          id: 'file1',
          originalName: 'profile1.jpg',
          storedName: 'uuid-profile1.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          url: 'https://api.treinopro.com/static/images/profiles/uuid-profile1.jpg',
          category: 'profile',
          isProcessed: true,
          metadata: null,
          createdAt: new Date(),
        },
        {
          id: 'file2',
          originalName: 'profile2.jpg',
          storedName: 'uuid-profile2.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          url: 'https://api.treinopro.com/static/images/profiles/uuid-profile2.jpg',
          category: 'profile',
          isProcessed: true,
          metadata: null,
          createdAt: new Date(),
        },
      ];

      mockUploadService.getFilesByUserId.mockResolvedValue(expectedResult);

      const result = await controller.getUserFiles(userId, body);

      expect(result).toEqual(expectedResult);
      expect(mockUploadService.getFilesByUserId).toHaveBeenCalledWith(
        userId,
        'profile',
      );
    });

    it('should return all user files when no category specified', async () => {
      const userId = 'user-id';
      const body = {};
      const expectedResult = [
        {
          id: 'file1',
          originalName: 'profile.jpg',
          storedName: 'uuid-profile.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          url: 'https://api.treinopro.com/static/images/profiles/uuid-profile.jpg',
          category: 'profile',
          isProcessed: true,
          metadata: null,
          createdAt: new Date(),
        },
        {
          id: 'file2',
          originalName: 'document.pdf',
          storedName: 'uuid-document.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          url: 'https://api.treinopro.com/static/images/documents/uuid-document.pdf',
          category: 'document',
          isProcessed: true,
          metadata: null,
          createdAt: new Date(),
        },
      ];

      mockUploadService.getFilesByUserId.mockResolvedValue(expectedResult);

      const result = await controller.getUserFiles(userId, body);

      expect(result).toEqual(expectedResult);
      expect(mockUploadService.getFilesByUserId).toHaveBeenCalledWith(
        userId,
        undefined,
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const fileId = 'file-id';
      const req = {
        user: { id: 'user-id' },
      };

      mockUploadService.deleteFile.mockResolvedValue(undefined);

      await controller.deleteFile(fileId, req);

      expect(mockUploadService.deleteFile).toHaveBeenCalledWith(
        fileId,
        'user-id',
      );
    });
  });

  describe('cleanupTempFiles', () => {
    it('should cleanup temp files successfully', async () => {
      const expectedResult = { deletedCount: 5 };

      mockUploadService.cleanupTempFiles.mockResolvedValue(5);

      const result = await controller.cleanupTempFiles();

      expect(result).toEqual(expectedResult);
      expect(mockUploadService.cleanupTempFiles).toHaveBeenCalled();
    });
  });
});
