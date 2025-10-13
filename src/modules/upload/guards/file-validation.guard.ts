import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import * as sharp from 'sharp';
import { FileValidationOptions } from '../interfaces/file.interface';
import { FileCategory } from '../dto/upload.dto';

@Injectable()
export class FileValidationGuard implements CanActivate {
  private readonly validationOptions: Record<string, FileValidationOptions> = {
    [FileCategory.PROFILE]: {
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxDimensions: { width: 2048, height: 2048 },
      category: FileCategory.PROFILE
    },
    [FileCategory.DOCUMENT]: {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      maxDimensions: { width: 4096, height: 4096 },
      category: FileCategory.DOCUMENT
    },
    [FileCategory.TEMP]: {
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxDimensions: { width: 2048, height: 2048 },
      category: FileCategory.TEMP
    }
  };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const file = request.file;
    const category = request.body?.category || 'temp';

    console.log('FileValidationGuard - Debug:');
    console.log('- request.file:', !!file);
    console.log('- request.body:', request.body);
    console.log('- request.headers:', request.headers);
    console.log('- category:', category);
    console.log('- file details:', file ? {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      fieldname: file.fieldname
    } : 'null');

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const options = this.validationOptions[category];
    if (!options) {
      throw new BadRequestException(`Categoria inválida: ${category}`);
    }

    // Validar tamanho
    if (file.size > options.maxSize) {
      throw new BadRequestException(
        `Arquivo muito grande. Máximo permitido: ${Math.round(options.maxSize / 1024 / 1024)}MB`
      );
    }

    // Validar tipo MIME
    if (!options.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido. Tipos aceitos: ${options.allowedMimeTypes.join(', ')}`
      );
    }

    // Validar nome do arquivo
    if (!file.originalname || file.originalname.trim() === '') {
      throw new BadRequestException('Nome do arquivo inválido');
    }

    // Validar extensão vs MIME type
    this.validateFileExtension(file.originalname, file.mimetype);

    // Validar dimensões para imagens
    if (file.mimetype.startsWith('image/') && options.maxDimensions) {
      await this.validateImageDimensions(file.buffer, options.maxDimensions);
    }

    return true;
  }

  private validateFileExtension(filename: string, mimeType: string): void {
    const extension = filename.toLowerCase().split('.').pop();
    const mimeToExtension: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
      'application/pdf': ['pdf']
    };

    const allowedExtensions = mimeToExtension[mimeType];
    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        `Extensão do arquivo (${extension}) não corresponde ao tipo MIME (${mimeType})`
      );
    }
  }

  private async validateImageDimensions(
    buffer: Buffer, 
    maxDimensions: { width: number; height: number }
  ): Promise<void> {
    try {
      const metadata = await sharp(buffer).metadata();
      
      if (metadata.width && metadata.height) {
        if (metadata.width > maxDimensions.width || metadata.height > maxDimensions.height) {
          throw new BadRequestException(
            `Imagem muito grande. Dimensões máximas permitidas: ${maxDimensions.width}x${maxDimensions.height}px. Sua imagem: ${metadata.width}x${metadata.height}px`
          );
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erro ao validar dimensões da imagem');
    }
  }
}
