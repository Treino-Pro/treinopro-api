import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { files } from '../../database/schema';
import { FileStorageUtil } from './utils/file-storage.util';
import { ImageProcessingUtil } from './utils/image-processing.util';
import { FileUploadResult, FileValidationOptions, ImageProcessingOptions } from './interfaces/file.interface';
import { UploadFileDto, FileResponseDto } from './dto/upload.dto';

@Injectable()
export class UploadService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: any,
    private fileStorageUtil: FileStorageUtil,
    private imageProcessingUtil: ImageProcessingUtil,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    uploadDto: UploadFileDto,
    userId?: string
  ): Promise<FileResponseDto> {
    try {
      // Validar arquivo
      const validationOptions: FileValidationOptions = {
        maxSize: this.getMaxSizeForCategory(uploadDto.category),
        allowedMimeTypes: this.getAllowedMimeTypesForCategory(uploadDto.category),
        maxDimensions: this.getMaxDimensionsForCategory(uploadDto.category),
        category: uploadDto.category
      };

      this.fileStorageUtil.validateFile(file.buffer, file.mimetype, validationOptions);

      // Processar imagem se for o caso
      let processedFile;
      if (file.mimetype.startsWith('image/')) {
        const imageOptions: ImageProcessingOptions = {
          generateThumbnails: uploadDto.category !== 'temp',
          thumbnailSizes: [
            { name: 'small', width: 150, height: 150 },
            { name: 'medium', width: 300, height: 300 },
            { name: 'large', width: 800, height: 600 }
          ],
          quality: 85,
          format: 'jpeg'
        };

        const result = await this.imageProcessingUtil.processImage(
          file.buffer,
          file.originalname,
          uploadDto.category,
          imageOptions
        );

        processedFile = result.mainFile;
        
        // Log dos thumbnails gerados
        if (result.thumbnails.length > 0) {
          console.log(`📸 Thumbnails gerados: ${result.thumbnails.map(t => t.size).join(', ')}`);
        }
      } else {
        // Para arquivos não-imagem, salvar diretamente
        const result = await this.fileStorageUtil.saveFile(
          file.buffer,
          file.originalname,
          uploadDto.category,
          file.mimetype
        );
        processedFile = result;
      }

      // Salvar metadados no banco
      const fileRecord = await this.db.insert(files).values({
        originalName: file.originalname,
        storedName: processedFile.storedName,
        mimeType: file.mimetype,
        size: file.size,
        path: processedFile.path,
        url: processedFile.url,
        userId: userId || uploadDto.userId,
        category: uploadDto.category,
        isProcessed: uploadDto.category !== 'temp',
        metadata: uploadDto.metadata
      }).returning();

      return this.mapToFileResponseDto(fileRecord[0]);
    } catch (error) {
      throw new BadRequestException(`Erro no upload: ${error.message}`);
    }
  }

  async getFileById(id: string): Promise<FileResponseDto> {
    const fileRecord = await this.db.query.files.findFirst({
      where: eq(files.id, id)
    });

    if (!fileRecord) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    return this.mapToFileResponseDto(fileRecord);
  }

  async getFilesByUserId(userId: string, category?: string): Promise<FileResponseDto[]> {
    const whereConditions = [eq(files.userId, userId)];
    
    if (category) {
      whereConditions.push(eq(files.category, category));
    }

    const fileRecords = await this.db.query.files.findMany({
      where: and(...whereConditions),
      orderBy: [files.createdAt]
    });

    return fileRecords.map(record => this.mapToFileResponseDto(record));
  }

  async deleteFile(id: string, userId?: string): Promise<void> {
    const fileRecord = await this.db.query.files.findFirst({
      where: eq(files.id, id)
    });

    if (!fileRecord) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    // Verificar se o usuário tem permissão para deletar
    if (userId && fileRecord.userId !== userId) {
      throw new BadRequestException('Você não tem permissão para deletar este arquivo');
    }

    try {
      // Deletar arquivo físico
      await this.fileStorageUtil.deleteFile(fileRecord.path);

      // Deletar registro do banco
      await this.db.delete(files).where(eq(files.id, id));
    } catch (error) {
      throw new BadRequestException(`Erro ao deletar arquivo: ${error.message}`);
    }
  }

  async cleanupTempFiles(): Promise<number> {
    // Deletar arquivos temporários mais antigos que 24 horas
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const tempFiles = await this.db.query.files.findMany({
      where: and(
        eq(files.category, 'temp'),
        // TODO: Adicionar condição de data quando implementado
      )
    });

    let deletedCount = 0;
    for (const file of tempFiles) {
      try {
        await this.deleteFile(file.id);
        deletedCount++;
      } catch (error) {
        console.error(`Erro ao deletar arquivo temporário ${file.id}:`, error);
      }
    }

    return deletedCount;
  }

  private getMaxSizeForCategory(category: string): number {
    const sizes = {
      profile: 5 * 1024 * 1024, // 5MB
      document: 10 * 1024 * 1024, // 10MB
      temp: 5 * 1024 * 1024, // 5MB
      dispute_evidence: 10 * 1024 * 1024 // 10MB
    };
    return sizes[category] || 5 * 1024 * 1024;
  }

  private getAllowedMimeTypesForCategory(category: string): string[] {
    const types = {
      profile: ['image/jpeg', 'image/png', 'image/webp'],
      document: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      temp: ['image/jpeg', 'image/png', 'image/webp'],
      dispute_evidence: ['image/jpeg', 'image/png', 'image/webp']
    };
    return types[category] || ['image/jpeg', 'image/png', 'image/webp'];
  }

  private getMaxDimensionsForCategory(category: string): { width: number; height: number } {
    const dimensions = {
      profile: { width: 2048, height: 2048 },
      document: { width: 4096, height: 4096 },
      temp: { width: 2048, height: 2048 },
      dispute_evidence: { width: 4096, height: 4096 }
    };
    return dimensions[category] || { width: 2048, height: 2048 };
  }

  private mapToFileResponseDto(fileRecord: any): FileResponseDto {
    return {
      id: fileRecord.id,
      originalName: fileRecord.originalName,
      storedName: fileRecord.storedName,
      mimeType: fileRecord.mimeType,
      size: fileRecord.size,
      url: fileRecord.url,
      category: fileRecord.category,
      isProcessed: fileRecord.isProcessed,
      metadata: fileRecord.metadata ? JSON.parse(fileRecord.metadata) : undefined,
      createdAt: fileRecord.createdAt
    };
  }
}
