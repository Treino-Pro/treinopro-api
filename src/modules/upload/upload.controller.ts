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
  BadRequestException,
  ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';
import { FileValidationGuard } from './guards/file-validation.guard';
import { UploadFileDto, FileResponseDto, FileCategory } from './dto/upload.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('profile-image')
  @UseInterceptors(FileInterceptor('file'))
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
          description: 'Arquivo de imagem (JPEG, PNG, WebP)',
        },
        metadata: {
          type: 'string',
          description: 'Metadados adicionais (JSON string)',
          example: '{"description": "Foto de perfil principal"}',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Arquivo enviado com sucesso',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou muito grande' })
  async uploadProfileImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
    @Request() req: any,
  ): Promise<FileResponseDto> {
    console.log('📸 [UPLOAD] Upload de imagem de perfil:');
    console.log('- file:', !!file);
    console.log('- file.originalname:', file?.originalname);
    console.log('- file.size:', file?.size);
    console.log('- file.mimetype:', file?.mimetype);
    console.log('- uploadDto:', uploadDto);
    console.log('- userId:', req.user?.id);

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    // Validar arquivo manualmente
    const fileValidationGuard = new FileValidationGuard();
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          file,
          body: { ...uploadDto, category: FileCategory.PROFILE },
        }),
      }),
    } as ExecutionContext;

    await fileValidationGuard.canActivate(mockContext);

    const userId = req.user?.id;
    return this.uploadService.uploadFile(
      file,
      { ...uploadDto, category: FileCategory.PROFILE },
      userId,
    );
  }

  @Post('document')
  @Public()
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload de documento (RG, CNH, CREF) - Público para cadastro',
  })
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
          description: 'Arquivo de documento (JPEG, PNG, WebP, PDF)',
        },
        metadata: {
          type: 'string',
          description: 'Metadados adicionais (JSON string)',
          example:
            '{"documentType": "RG", "description": "Documento de identidade"}',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Documento enviado com sucesso',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou muito grande' })
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
  ): Promise<FileResponseDto> {
    console.log('uploadDocument - Debug:');
    console.log('- file:', !!file);
    console.log('- file.originalname:', file?.originalname);
    console.log('- file.size:', file?.size);
    console.log('- uploadDto:', uploadDto);

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    // Para uploads públicos (cadastro), não há userId
    const result = await this.uploadService.uploadFile(
      file,
      { ...uploadDto, category: FileCategory.DOCUMENT },
      null,
    );
    console.log('uploadDocument - Resposta:', JSON.stringify(result, null, 2));
    return result;
  }

  @Post('temp')
  @Public()
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(FileValidationGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload temporário de arquivo - Público para cadastro',
  })
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
          description: 'Arquivo temporário (JPEG, PNG, WebP)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Arquivo temporário enviado com sucesso',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou muito grande' })
  async uploadTempFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
  ): Promise<FileResponseDto> {
    // Para uploads públicos (cadastro), não há userId
    return this.uploadService.uploadFile(
      file,
      { ...uploadDto, category: FileCategory.TEMP },
      null,
    );
  }

  @Post('dispute-evidence')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(FileValidationGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload de evidência de disputa (ausência)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo de evidência para disputa de ausência',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo de evidência (JPEG, PNG, WebP)',
        },
        metadata: {
          type: 'string',
          description: 'Metadados adicionais (JSON string)',
          example: '{"classId": "uuid", "description": "Foto do local vazio"}',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Evidência enviada com sucesso',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou muito grande' })
  async uploadDisputeEvidence(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
    @Request() req: any,
  ): Promise<FileResponseDto> {
    console.log('📸 [UPLOAD] Upload de evidência de disputa:');
    console.log('- file:', !!file);
    console.log('- file.originalname:', file?.originalname);
    console.log('- file.size:', file?.size);
    console.log('- uploadDto:', uploadDto);
    console.log('- userId:', req.user?.id);

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const userId = req.user?.id;
    return this.uploadService.uploadFile(
      file,
      { ...uploadDto, category: FileCategory.DISPUTE_EVIDENCE },
      userId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter informações de um arquivo' })
  @ApiResponse({
    status: 200,
    description: 'Informações do arquivo',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Arquivo não encontrado' })
  async getFile(@Param('id') id: string): Promise<FileResponseDto> {
    return this.uploadService.getFileById(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Listar arquivos de um usuário' })
  @ApiResponse({
    status: 200,
    description: 'Lista de arquivos do usuário',
    type: [FileResponseDto],
  })
  async getUserFiles(
    @Param('userId') userId: string,
    @Body() body: { category?: string },
  ): Promise<FileResponseDto[]> {
    return this.uploadService.getFilesByUserId(userId, body.category);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar um arquivo' })
  @ApiResponse({ status: 204, description: 'Arquivo deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Arquivo não encontrado' })
  @ApiResponse({
    status: 403,
    description: 'Sem permissão para deletar este arquivo',
  })
  async deleteFile(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<void> {
    const userId = req.user?.id;
    return this.uploadService.deleteFile(id, userId);
  }

  @Post('test')
  @Public()
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Teste de upload - Debug' })
  async testUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ): Promise<any> {
    return {
      success: true,
      file: file
        ? {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
          }
        : null,
      body: body,
    };
  }

  @Post('cleanup/temp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Limpar arquivos temporários antigos' })
  @ApiResponse({
    status: 200,
    description: 'Arquivos temporários limpos',
    schema: {
      type: 'object',
      properties: { deletedCount: { type: 'number' } },
    },
  })
  async cleanupTempFiles(): Promise<{ deletedCount: number }> {
    const deletedCount = await this.uploadService.cleanupTempFiles();
    return { deletedCount };
  }
}
