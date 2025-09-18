import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';
import { FileValidationGuard } from './guards/file-validation.guard';
import { UploadFileDto, FileResponseDto, FileCategory } from './dto/upload.dto';

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('profile-image')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(FileValidationGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload de foto de perfil' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo de imagem para foto de perfil',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo de imagem (JPEG, PNG, WebP)'
        },
        metadata: {
          type: 'string',
          description: 'Metadados adicionais (JSON string)',
          example: '{"description": "Foto de perfil principal"}'
        }
      }
    }
  })
  @ApiResponse({ status: 201, description: 'Arquivo enviado com sucesso', type: FileResponseDto })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou muito grande' })
  async uploadProfileImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
    @Request() req: any
  ): Promise<FileResponseDto> {
    const userId = req.user?.id;
    return this.uploadService.uploadFile(file, { ...uploadDto, category: FileCategory.PROFILE }, userId);
  }

  @Post('document')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(FileValidationGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload de documento (RG, CNH, CREF)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo de documento',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo de documento (JPEG, PNG, WebP, PDF)'
        },
        metadata: {
          type: 'string',
          description: 'Metadados adicionais (JSON string)',
          example: '{"documentType": "RG", "description": "Documento de identidade"}'
        }
      }
    }
  })
  @ApiResponse({ status: 201, description: 'Documento enviado com sucesso', type: FileResponseDto })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou muito grande' })
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
    @Request() req: any
  ): Promise<FileResponseDto> {
    const userId = req.user?.id;
    return this.uploadService.uploadFile(file, { ...uploadDto, category: FileCategory.DOCUMENT }, userId);
  }

  @Post('temp')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(FileValidationGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload temporário de arquivo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo temporário',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo temporário (JPEG, PNG, WebP)'
        }
      }
    }
  })
  @ApiResponse({ status: 201, description: 'Arquivo temporário enviado com sucesso', type: FileResponseDto })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou muito grande' })
  async uploadTempFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
    @Request() req: any
  ): Promise<FileResponseDto> {
    const userId = req.user?.id;
    return this.uploadService.uploadFile(file, { ...uploadDto, category: FileCategory.TEMP }, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter informações de um arquivo' })
  @ApiResponse({ status: 200, description: 'Informações do arquivo', type: FileResponseDto })
  @ApiResponse({ status: 404, description: 'Arquivo não encontrado' })
  async getFile(@Param('id') id: string): Promise<FileResponseDto> {
    return this.uploadService.getFileById(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Listar arquivos de um usuário' })
  @ApiResponse({ status: 200, description: 'Lista de arquivos do usuário', type: [FileResponseDto] })
  async getUserFiles(
    @Param('userId') userId: string,
    @Body() body: { category?: string }
  ): Promise<FileResponseDto[]> {
    return this.uploadService.getFilesByUserId(userId, body.category);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar um arquivo' })
  @ApiResponse({ status: 204, description: 'Arquivo deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Arquivo não encontrado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para deletar este arquivo' })
  async deleteFile(@Param('id') id: string, @Request() req: any): Promise<void> {
    const userId = req.user?.id;
    return this.uploadService.deleteFile(id, userId);
  }

  @Post('cleanup/temp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Limpar arquivos temporários antigos' })
  @ApiResponse({ status: 200, description: 'Arquivos temporários limpos', schema: { type: 'object', properties: { deletedCount: { type: 'number' } } } })
  async cleanupTempFiles(): Promise<{ deletedCount: number }> {
    const deletedCount = await this.uploadService.cleanupTempFiles();
    return { deletedCount };
  }
}
