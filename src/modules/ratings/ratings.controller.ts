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
  ValidationPipe
} from '@nestjs/common';
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
  RatingStatus
} from './dto/ratings.dto';

@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // Criar nova avaliação
  @Post()
  async createRating(
    @Body(ValidationPipe) createRatingDto: CreateRatingDto,
    @Request() req: any,
  ): Promise<RatingResponseDto> {
    return this.ratingsService.createRating(createRatingDto, req.user.sub);
  }

  // Atualizar avaliação existente
  @Put(':id')
  async updateRating(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateRatingDto: UpdateRatingDto,
    @Request() req: any,
  ): Promise<RatingResponseDto> {
    return this.ratingsService.updateRating(id, updateRatingDto, req.user.sub);
  }

  // Obter avaliação por ID
  @Get(':id')
  async getRatingById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<RatingResponseDto> {
    return this.ratingsService.getRatingById(id, req.user.sub);
  }

  // Listar avaliações do usuário com filtros
  @Get()
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
  async getMyRatingStats(@Request() req: any): Promise<RatingStatsDto> {
    return this.ratingsService.getRatingStats(req.user.sub);
  }

  // Obter resumo de avaliações de um usuário específico
  @Get('summary/:userId')
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
    return this.ratingsService.getRatings({ status: RatingStatus.PENDING }, req.user.sub);
  }

  // Avaliações concluídas do usuário
  @Get('completed')
  async getCompletedRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings({ status: RatingStatus.COMPLETED }, req.user.sub);
  }

  // Avaliações de personal trainers (quando aluno avalia)
  @Get('personal')
  async getPersonalRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings({ type: RatingType.STUDENT_TO_PERSONAL }, req.user.sub);
  }

  // Avaliações de alunos (quando personal avalia)
  @Get('student')
  async getStudentRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getRatings({ type: RatingType.PERSONAL_TO_STUDENT }, req.user.sub);
  }

  // Avaliações recebidas de personal trainers
  @Get('received/personal')
  async getReceivedPersonalRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getReceivedRatings(req.user.sub, { type: RatingType.STUDENT_TO_PERSONAL });
  }

  // Avaliações recebidas de alunos
  @Get('received/student')
  async getReceivedStudentRatings(@Request() req: any): Promise<RatingResponseDto[]> {
    return this.ratingsService.getReceivedRatings(req.user.sub, { type: RatingType.PERSONAL_TO_STUDENT });
  }

  // Estatísticas de avaliações recebidas
  @Get('stats/received')
  async getReceivedRatingStats(@Request() req: any): Promise<RatingStatsDto> {
    // Para estatísticas recebidas, precisamos adaptar o método
    const receivedRatings = await this.ratingsService.getReceivedRatings(req.user.sub);
    
    // Calcular estatísticas das avaliações recebidas
    const totalRatings = receivedRatings.length;
    const averageRating = totalRatings > 0 
      ? receivedRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings 
      : 0;

    const ratingDistribution = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };

    receivedRatings.forEach(rating => {
      ratingDistribution[rating.rating.toString() as keyof typeof ratingDistribution]++;
    });

    const completedRatings = receivedRatings.filter(r => r.status === 'completed').length;
    const pendingRatings = receivedRatings.filter(r => r.status === 'pending').length;
    const cancelledRatings = receivedRatings.filter(r => r.status === 'cancelled').length;

    return {
      totalRatings,
      averageRating,
      ratingDistribution,
      completedRatings,
      pendingRatings,
      cancelledRatings,
      studentToPersonal: {
        total: receivedRatings.filter(r => r.type === 'student_to_personal').length,
        average: 0,
        punctuality: 0,
        communication: 0,
        knowledge: 0,
        motivation: 0,
        equipment: 0,
      },
      personalToStudent: {
        total: receivedRatings.filter(r => r.type === 'personal_to_student').length,
        average: 0,
        engagement: 0,
        effort: 0,
        progress: 0,
      },
    };
  }
}
