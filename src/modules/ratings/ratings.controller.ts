import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RatingsService } from './ratings.service';
import {
  CreateRatingDto,
  UpdateRatingDto,
  RatingResponseDto,
  RatingStatsDto,
  RatingSummaryDto,
  RatingFiltersDto,
  CreateAutomaticRatingsDto,
  RatingType,
  RatingStatus,
} from './dto/ratings.dto';

@ApiTags('Ratings')
@Controller('ratings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // Criar nova avaliação
  @Post()
  @ApiOperation({ summary: 'Criar nova avaliação' })
  @ApiResponse({
    status: 201,
    description: 'Avaliação criada com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        raterId: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174001',
        },
        ratedId: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174002',
        },
        classId: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174003',
        },
        type: {
          type: 'string',
          example: 'student_to_personal',
          description: 'Tipo da avaliação',
        },
        rating: {
          type: 'number',
          example: 5,
          description: 'Nota da avaliação (1-5)',
        },
        comment: {
          type: 'string',
          example: 'Excelente aula! Muito motivador.',
          description: 'Comentário da avaliação',
        },
        status: {
          type: 'string',
          example: 'completed',
          description: 'Status da avaliação',
        },
        punctuality: {
          type: 'number',
          example: 5,
          description: 'Nota de pontualidade',
        },
        communication: {
          type: 'number',
          example: 4,
          description: 'Nota de comunicação',
        },
        knowledge: {
          type: 'number',
          example: 5,
          description: 'Nota de conhecimento',
        },
        motivation: {
          type: 'number',
          example: 5,
          description: 'Nota de motivação',
        },
        equipment: {
          type: 'number',
          example: 4,
          description: 'Nota de equipamentos',
        },
        createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
        updatedAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
      },
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        raterId: '123e4567-e89b-12d3-a456-426614174001',
        ratedId: '123e4567-e89b-12d3-a456-426614174002',
        classId: '123e4567-e89b-12d3-a456-426614174003',
        type: 'student_to_personal',
        rating: 5,
        comment: 'Excelente aula! Muito motivador.',
        status: 'completed',
        punctuality: 5,
        communication: 4,
        knowledge: 5,
        motivation: 5,
        equipment: 4,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async createRating(
    @Body(ValidationPipe) createRatingDto: CreateRatingDto,
    @Request() req: any,
  ): Promise<RatingResponseDto> {
    return this.ratingsService.createRating(createRatingDto, req.user.sub);
  }

  // Atualizar avaliação existente
  @Put(':id')
  @ApiOperation({ summary: 'Atualizar avaliação existente' })
  @ApiParam({ name: 'id', description: 'ID da avaliação' })
  @ApiResponse({
    status: 200,
    description: 'Avaliação atualizada com sucesso',
    type: RatingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Avaliação não encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async updateRating(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateRatingDto: UpdateRatingDto,
    @Request() req: any,
  ): Promise<RatingResponseDto> {
    return this.ratingsService.updateRating(id, updateRatingDto, req.user.sub);
  }

  // Obter avaliação por ID
  @Get(':id')
  @ApiOperation({ summary: 'Obter avaliação por ID' })
  @ApiParam({ name: 'id', description: 'ID da avaliação' })
  @ApiResponse({
    status: 200,
    description: 'Avaliação encontrada com sucesso',
    type: RatingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Avaliação não encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async getRatingById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<RatingResponseDto> {
    return this.ratingsService.getRatingById(id, req.user.sub);
  }

  // Listar avaliações do usuário com filtros
  @Get()
  @ApiOperation({ summary: 'Listar avaliações com filtros' })
  @ApiResponse({
    status: 200,
    description: 'Lista de avaliações retornada com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174000',
          },
          raterId: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174001',
          },
          ratedId: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174002',
          },
          classId: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174003',
          },
          type: { type: 'string', example: 'student_to_personal' },
          rating: { type: 'number', example: 5 },
          comment: { type: 'string', example: 'Excelente aula!' },
          status: { type: 'string', example: 'completed' },
          punctuality: { type: 'number', example: 5 },
          communication: { type: 'number', example: 4 },
          knowledge: { type: 'number', example: 5 },
          motivation: { type: 'number', example: 5 },
          equipment: { type: 'number', example: 4 },
          createdAt: { type: 'string', example: '2024-01-15T10:00:00.000Z' },
        },
      },
    },
    example: [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        raterId: '123e4567-e89b-12d3-a456-426614174001',
        ratedId: '123e4567-e89b-12d3-a456-426614174002',
        classId: '123e4567-e89b-12d3-a456-426614174003',
        type: 'student_to_personal',
        rating: 5,
        comment: 'Excelente aula! Muito motivador.',
        status: 'completed',
        punctuality: 5,
        communication: 4,
        knowledge: 5,
        motivation: 5,
        equipment: 4,
        createdAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        raterId: '123e4567-e89b-12d3-a456-426614174002',
        ratedId: '123e4567-e89b-12d3-a456-426614174001',
        classId: '123e4567-e89b-12d3-a456-426614174004',
        type: 'personal_to_student',
        rating: 4,
        comment: 'Aluno muito dedicado e esforçado.',
        status: 'completed',
        engagement: 4,
        effort: 5,
        progress: 4,
        createdAt: '2024-01-14T15:30:00.000Z',
      },
    ],
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async getRatings(
    @Query(ValidationPipe) filters: RatingFiltersDto,
    @Request() req: any,
  ): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings(filters, req.user.sub);
  }

  // Obter avaliações recebidas pelo usuário
  @Get('received')
  async getReceivedRatings(
    @Query(ValidationPipe) filters: RatingFiltersDto,
    @Request() req: any,
  ): Promise<RatingResponseDto[]> {
    return this.ratingsService.getReceivedRatings(req.user.sub, filters);
  }

  // Obter estatísticas de avaliações do usuário
  @Get('stats/my')
  @ApiOperation({ summary: 'Obter estatísticas de avaliações do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas de avaliações retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalRatings: {
          type: 'number',
          example: 15,
          description: 'Total de avaliações feitas',
        },
        averageRating: {
          type: 'number',
          example: 4.2,
          description: 'Média das avaliações feitas',
        },
        ratingDistribution: {
          type: 'object',
          properties: {
            '1': { type: 'number', example: 0 },
            '2': { type: 'number', example: 1 },
            '3': { type: 'number', example: 2 },
            '4': { type: 'number', example: 5 },
            '5': { type: 'number', example: 7 },
          },
          description: 'Distribuição das notas',
        },
        completedRatings: {
          type: 'number',
          example: 12,
          description: 'Avaliações concluídas',
        },
        pendingRatings: {
          type: 'number',
          example: 3,
          description: 'Avaliações pendentes',
        },
        cancelledRatings: {
          type: 'number',
          example: 0,
          description: 'Avaliações canceladas',
        },
        studentToPersonal: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 10 },
            average: { type: 'number', example: 4.5 },
            punctuality: { type: 'number', example: 4.3 },
            communication: { type: 'number', example: 4.2 },
            knowledge: { type: 'number', example: 4.7 },
            motivation: { type: 'number', example: 4.6 },
            equipment: { type: 'number', example: 4.1 },
          },
        },
        personalToStudent: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 5 },
            average: { type: 'number', example: 3.8 },
            engagement: { type: 'number', example: 4.0 },
            effort: { type: 'number', example: 3.6 },
            progress: { type: 'number', example: 3.8 },
          },
        },
      },
      example: {
        totalRatings: 15,
        averageRating: 4.2,
        ratingDistribution: { '1': 0, '2': 1, '3': 2, '4': 5, '5': 7 },
        completedRatings: 12,
        pendingRatings: 3,
        cancelledRatings: 0,
        studentToPersonal: {
          total: 10,
          average: 4.5,
          punctuality: 4.3,
          communication: 4.2,
          knowledge: 4.7,
          motivation: 4.6,
          equipment: 4.1,
        },
        personalToStudent: {
          total: 5,
          average: 3.8,
          engagement: 4.0,
          effort: 3.6,
          progress: 3.8,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token JWT inválido',
  })
  async getMyRatingStats(@Request() req: any): Promise<RatingStatsDto> {
    return this.ratingsService.getRatingStats(req.user.sub);
  }

  // Obter resumo de avaliações de um usuário específico
  @Get('summary/:userId')
  @ApiOperation({
    summary: 'Obter resumo de avaliações de um usuário específico',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID do usuário',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumo de avaliações retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        totalRatings: {
          type: 'number',
          example: 25,
          description: 'Total de avaliações recebidas',
        },
        averageRating: {
          type: 'number',
          example: 4.5,
          description: 'Média das avaliações',
        },
        ratingDistribution: {
          type: 'object',
          properties: {
            '1': { type: 'number', example: 0 },
            '2': { type: 'number', example: 1 },
            '3': { type: 'number', example: 2 },
            '4': { type: 'number', example: 7 },
            '5': { type: 'number', example: 15 },
          },
        },
        recentRatings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                example: '123e4567-e89b-12d3-a456-426614174001',
              },
              rating: { type: 'number', example: 5 },
              comment: { type: 'string', example: 'Excelente profissional!' },
              createdAt: {
                type: 'string',
                example: '2024-01-15T10:00:00.000Z',
              },
            },
          },
        },
        strengths: {
          type: 'array',
          items: { type: 'string' },
          example: ['Pontualidade', 'Conhecimento', 'Motivação'],
          description: 'Pontos fortes identificados',
        },
        areasForImprovement: {
          type: 'array',
          items: { type: 'string' },
          example: ['Comunicação', 'Equipamentos'],
          description: 'Áreas para melhoria',
        },
      },
      example: {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        totalRatings: 25,
        averageRating: 4.5,
        ratingDistribution: { '1': 0, '2': 1, '3': 2, '4': 7, '5': 15 },
        recentRatings: [
          {
            id: '123e4567-e89b-12d3-a456-426614174001',
            rating: 5,
            comment: 'Excelente profissional!',
            createdAt: '2024-01-15T10:00:00.000Z',
          },
        ],
        strengths: ['Pontualidade', 'Conhecimento', 'Motivação'],
        areasForImprovement: ['Comunicação', 'Equipamentos'],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado',
  })
  async getRatingSummary(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<RatingSummaryDto> {
    return this.ratingsService.getRatingSummary(userId);
  }

  // Cancelar avaliação
  @Delete(':id')
  async cancelRating(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<RatingResponseDto> {
    return this.ratingsService.cancelRating(id, req.user.sub);
  }

  // Criar avaliações automáticas após aula (endpoint administrativo)
  @Post('automatic')
  @ApiOperation({ summary: 'Criar avaliações automáticas após aula (Admin)' })
  @ApiResponse({
    status: 201,
    description: 'Avaliações automáticas criadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Avaliações automáticas criadas com sucesso',
        },
        ratingsCreated: {
          type: 'number',
          example: 2,
          description: 'Número de avaliações criadas',
        },
        studentRatingId: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174000',
          description: 'ID da avaliação do aluno',
        },
        personalRatingId: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174001',
          description: 'ID da avaliação do personal',
        },
      },
      example: {
        message: 'Avaliações automáticas criadas com sucesso',
        ratingsCreated: 2,
        studentRatingId: '123e4567-e89b-12d3-a456-426614174000',
        personalRatingId: '123e4567-e89b-12d3-a456-426614174001',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Aula não encontrada',
  })
  async createAutomaticRatings(
    @Body(ValidationPipe) createDto: CreateAutomaticRatingsDto,
  ): Promise<{ message: string }> {
    await this.ratingsService.createAutomaticRatings(createDto);
    return { message: 'Avaliações automáticas criadas com sucesso' };
  }

  // Endpoints específicos para diferentes tipos de avaliação

  // Avaliações pendentes do usuário
  @Get('pending')
  async getPendingRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings(
      { status: RatingStatus.PENDING },
      req.user.sub,
    );
  }

  // Avaliações concluídas do usuário
  @Get('completed')
  async getCompletedRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings(
      { status: RatingStatus.COMPLETED },
      req.user.sub,
    );
  }

  // Avaliações de personal trainers (quando aluno avalia)
  @Get('personal')
  async getPersonalRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings(
      { type: RatingType.STUDENT_TO_PERSONAL },
      req.user.sub,
    );
  }

  // Avaliações de alunos (quando personal avalia)
  @Get('student')
  async getStudentRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings(
      { type: RatingType.PERSONAL_TO_STUDENT },
      req.user.sub,
    );
  }

  // Avaliações recebidas de personal trainers
  @Get('received/personal')
  async getReceivedPersonalRatings(
    @Request() req: any,
  ): Promise<RatingResponseDto[]> {
    return this.ratingsService.getReceivedRatings(req.user.sub, {
      type: RatingType.STUDENT_TO_PERSONAL,
    });
  }

  // Avaliações recebidas de alunos
  @Get('received/student')
  async getReceivedStudentRatings(
    @Request() req: any,
  ): Promise<RatingResponseDto[]> {
    return this.ratingsService.getReceivedRatings(req.user.sub, {
      type: RatingType.PERSONAL_TO_STUDENT,
    });
  }

  // Estatísticas de avaliações recebidas
  @Get('stats/received')
  async getReceivedRatingStats(@Request() req: any): Promise<RatingStatsDto> {
    // Para estatísticas recebidas, precisamos adaptar o método
    const receivedRatings = await this.ratingsService.getReceivedRatings(
      req.user.sub,
    );

    // Calcular estatísticas das avaliações recebidas
    const totalRatings = receivedRatings.length;
    const averageRating =
      totalRatings > 0
        ? receivedRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
        : 0;

    const ratingDistribution = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };

    receivedRatings.forEach((rating) => {
      ratingDistribution[
        rating.rating.toString() as keyof typeof ratingDistribution
      ]++;
    });

    const completedRatings = receivedRatings.filter(
      (r) => r.status === 'completed',
    ).length;
    const pendingRatings = receivedRatings.filter(
      (r) => r.status === 'pending',
    ).length;
    const cancelledRatings = receivedRatings.filter(
      (r) => r.status === 'cancelled',
    ).length;

    return {
      totalRatings,
      averageRating,
      ratingDistribution,
      completedRatings,
      pendingRatings,
      cancelledRatings,
      studentToPersonal: {
        total: receivedRatings.filter((r) => r.type === 'student_to_personal')
          .length,
        average: 0,
        punctuality: 0,
        communication: 0,
        knowledge: 0,
        motivation: 0,
        equipment: 0,
      },
      personalToStudent: {
        total: receivedRatings.filter((r) => r.type === 'personal_to_student')
          .length,
        average: 0,
        engagement: 0,
        effort: 0,
        progress: 0,
      },
    };
  }

  // Endpoint para buscar rating de um usuário específico (como Uber)
  @Get('user/:userId/rating')
  async getUserRating(@Param('userId') userId: string): Promise<{
    userId: string;
    rating: number;
    totalRatings: number;
    userType: 'personal' | 'student';
  }> {
    // Verificar se o usuário existe e seu tipo
    const user = await this.ratingsService.getUserById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Buscar rating baseado no tipo do usuário
    let rating = 5.0; // Rating padrão como Uber
    let totalRatings = 0;

    if (user.userType === 'personal') {
      // Buscar avaliações recebidas pelo personal (de alunos)
      const personalRatings = await this.ratingsService.getReceivedRatings(
        userId,
        { type: RatingType.STUDENT_TO_PERSONAL },
      );
      if (personalRatings.length > 0) {
        const totalRating = personalRatings.reduce(
          (sum, r) => sum + r.rating,
          0,
        );
        rating = totalRating / personalRatings.length;
        rating = Math.max(1.0, Math.min(5.0, rating)); // Garantir entre 1.0 e 5.0
        totalRatings = personalRatings.length;
      }
    } else {
      // Buscar avaliações recebidas pelo aluno (de personais)
      const studentRatings = await this.ratingsService.getReceivedRatings(
        userId,
        { type: RatingType.PERSONAL_TO_STUDENT },
      );
      if (studentRatings.length > 0) {
        const totalRating = studentRatings.reduce(
          (sum, r) => sum + r.rating,
          0,
        );
        rating = totalRating / studentRatings.length;
        rating = Math.max(1.0, Math.min(5.0, rating)); // Garantir entre 1.0 e 5.0
        totalRatings = studentRatings.length;
      }
    }

    return {
      userId,
      rating: Math.round(rating * 10) / 10, // Arredondar para 1 casa decimal
      totalRatings,
      userType: user.userType as 'personal' | 'student',
    };
  }
}
