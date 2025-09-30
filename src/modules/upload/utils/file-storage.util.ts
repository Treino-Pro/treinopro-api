import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileValidationOptions } from '../interfaces/file.interface';

@Injectable()
export class FileStorageUtil {
  private readonly logger = new Logger(FileStorageUtil.name);
  private readonly storageBasePath = process.env.STORAGE_PATH || './storage';
  private readonly baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';

  constructor() {
    this.ensureStorageDirectories();
  }

  private async ensureStorageDirectories(): Promise<void> {
    const directories = [
      path.join(this.storageBasePath, 'images', 'profiles'),
      path.join(this.storageBasePath, 'images', 'documents'),
      path.join(this.storageBasePath, 'images', 'dispute_evidence'),
      path.join(this.storageBasePath, 'images', 'thumbnails'),
      path.join(this.storageBasePath, 'temp'),
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
        this.logger.log(`📁 Diretório criado/verificado: ${dir}`);
      } catch (error) {
        this.logger.error(`❌ Erro ao criar diretório ${dir}:`, error);
      }
    }
  }

  generateUniqueFileName(originalName: string): string {
    const extension = path.extname(originalName);
    const uuid = randomUUID();
    return `${uuid}${extension}`;
  }

  getStoragePath(category: string, fileName: string): string {
    const categoryPaths = {
      profile: 'images/profiles',
      document: 'images/documents',
      dispute_evidence: 'images/dispute_evidence',
      temp: 'temp',
    };

    const categoryPath = categoryPaths[category] || 'temp';
    return path.join(this.storageBasePath, categoryPath, fileName);
  }

  getPublicUrl(category: string, fileName: string): string {
    const categoryPaths = {
      profile: 'images/profiles',
      document: 'images/documents',
      dispute_evidence: 'images/dispute_evidence',
      temp: 'temp',
    };

    const categoryPath = categoryPaths[category] || 'temp';
    return `${this.baseUrl}/static/${categoryPath}/${fileName}`;
  }

  async saveFile(
    buffer: Buffer,
    originalName: string,
    category: string,
    mimeType: string
  ): Promise<{ storedName: string; path: string; url: string }> {
    const storedName = this.generateUniqueFileName(originalName);
    const filePath = this.getStoragePath(category, storedName);
    const publicUrl = this.getPublicUrl(category, storedName);

    try {
      await fs.writeFile(filePath, buffer);
      this.logger.log(`💾 Arquivo salvo: ${filePath}`);
      
      return {
        storedName,
        path: filePath,
        url: publicUrl,
      };
    } catch (error) {
      this.logger.error(`❌ Erro ao salvar arquivo:`, error);
      throw new Error('Falha ao salvar arquivo');
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.log(`🗑️ Arquivo deletado: ${filePath}`);
    } catch (error) {
      this.logger.error(`❌ Erro ao deletar arquivo:`, error);
      throw new Error('Falha ao deletar arquivo');
    }
  }

  validateFile(buffer: Buffer, mimeType: string, options: FileValidationOptions): void {
    // Validar tamanho
    if (buffer.length > options.maxSize) {
      throw new Error(`Arquivo muito grande. Máximo: ${options.maxSize} bytes`);
    }

    // Validar tipo MIME
    if (!options.allowedMimeTypes.includes(mimeType)) {
      throw new Error(`Tipo de arquivo não permitido: ${mimeType}`);
    }

    // Validar dimensões para imagens
    if (options.maxDimensions && mimeType.startsWith('image/')) {
      // TODO: Implementar validação de dimensões com sharp
      this.logger.warn('⚠️ Validação de dimensões não implementada ainda');
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getFileStats(filePath: string): Promise<{ size: number; mtime: Date }> {
    return fs.stat(filePath);
  }
}
