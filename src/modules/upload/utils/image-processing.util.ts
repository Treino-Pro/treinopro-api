import { Injectable, Logger } from '@nestjs/common';
import * as sharp from 'sharp';
import { FileStorageUtil } from './file-storage.util';
import { ImageProcessingOptions } from '../interfaces/file.interface';

@Injectable()
export class ImageProcessingUtil {
  private readonly logger = new Logger(ImageProcessingUtil.name);

  constructor(private fileStorageUtil: FileStorageUtil) {}

  async processImage(
    buffer: Buffer,
    originalName: string,
    category: string,
    options: ImageProcessingOptions
  ): Promise<{ mainFile: any; thumbnails: any[] }> {
    try {
      this.logger.log(`🖼️ Processando imagem: ${originalName}`);
      
      // Obter metadados da imagem
      const metadata = await this.getImageMetadata(buffer);
      this.logger.log(`📊 Metadados: ${metadata.width}x${metadata.height}, formato: ${metadata.format}`);

      // Otimizar imagem principal
      const optimizedBuffer = await this.optimizeImage(buffer, options);
      
      // Salvar imagem principal
      const mainFile = await this.fileStorageUtil.saveFile(
        optimizedBuffer,
        originalName,
        category,
        `image/${options.format}`
      );

      const thumbnails = [];

      // Gerar thumbnails se solicitado
      if (options.generateThumbnails) {
        for (const size of options.thumbnailSizes) {
          try {
            this.logger.log(`📐 Gerando thumbnail ${size.name}: ${size.width}x${size.height}`);
            
            const thumbnailBuffer = await this.generateThumbnail(
              buffer,
              size.width,
              size.height,
              options.quality
            );
            
            const thumbnailName = `${size.name}_${originalName}`;
            const thumbnail = await this.fileStorageUtil.saveFile(
              thumbnailBuffer,
              thumbnailName,
              'thumbnails',
              `image/${options.format}`
            );
            
            thumbnails.push({
              ...thumbnail,
              size: size.name,
              dimensions: { width: size.width, height: size.height }
            });
          } catch (error) {
            this.logger.error(`❌ Erro ao gerar thumbnail ${size.name}:`, error);
          }
        }
      }

      return { mainFile, thumbnails };
    } catch (error) {
      this.logger.error(`❌ Erro no processamento de imagem:`, error);
      throw new Error('Falha no processamento de imagem');
    }
  }

  async optimizeImage(buffer: Buffer, options: ImageProcessingOptions): Promise<Buffer> {
    try {
      this.logger.log(`⚡ Otimizando imagem...`);
      
      let sharpInstance = sharp(buffer);
      
      // Redimensionar se necessário (máximo 2048x2048)
      const metadata = await sharpInstance.metadata();
      if (metadata.width > 2048 || metadata.height > 2048) {
        sharpInstance = sharpInstance.resize(2048, 2048, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // Aplicar otimizações baseadas no formato
      switch (options.format) {
        case 'jpeg':
          sharpInstance = sharpInstance.jpeg({
            quality: options.quality,
            progressive: true,
            mozjpeg: true
          });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({
            quality: options.quality,
            progressive: true,
            compressionLevel: 9
          });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({
            quality: options.quality,
            effort: 6
          });
          break;
      }
      
      return await sharpInstance.toBuffer();
    } catch (error) {
      this.logger.error(`❌ Erro na otimização:`, error);
      throw new Error('Falha na otimização da imagem');
    }
  }

  async generateThumbnail(
    buffer: Buffer,
    width: number,
    height: number,
    quality: number = 85
  ): Promise<Buffer> {
    try {
      this.logger.log(`📐 Gerando thumbnail ${width}x${height}`);
      
      return await sharp(buffer)
        .resize(width, height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer();
    } catch (error) {
      this.logger.error(`❌ Erro na geração de thumbnail:`, error);
      throw new Error('Falha na geração de thumbnail');
    }
  }

  async getImageMetadata(buffer: Buffer): Promise<{ width: number; height: number; format: string }> {
    try {
      this.logger.log(`📊 Extraindo metadados da imagem...`);
      
      const metadata = await sharp(buffer).metadata();
      
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown'
      };
    } catch (error) {
      this.logger.error(`❌ Erro na extração de metadados:`, error);
      throw new Error('Falha na extração de metadados');
    }
  }
}
