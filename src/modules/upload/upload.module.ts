import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { FileStorageUtil } from './utils/file-storage.util';
import { ImageProcessingUtil } from './utils/image-processing.util';
import { FileValidationGuard } from './guards/file-validation.guard';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB máximo
      },
      fileFilter: (req, file, cb) => {
        // Validação básica de tipo de arquivo
        const allowedMimes = [
          'image/jpeg',
          'image/png', 
          'image/webp',
          'application/pdf'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Tipo de arquivo não permitido'), false);
        }
      }
    })
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    FileStorageUtil,
    ImageProcessingUtil,
    FileValidationGuard
  ],
  exports: [UploadService, FileStorageUtil]
})
export class UploadModule {}
