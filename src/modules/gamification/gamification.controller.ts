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
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GamificationService } from './gamification.service';
import {
  CreateMissionDto,
  UpdateMissionDto,
  MissionQueryDto,
  CreateAchievementDto,
  UpdateAchievementDto,
  AchievementQueryDto,
  AddXPDto,
  XPHistoryQueryDto,
  MissionProgressDto,
  AchievementProgressDto,
  UserProfileResponseDto,
  MissionResponseDto,
  UserMissionResponseDto,
  AchievementResponseDto,
  UserAchievementResponseDto,
  XPHistoryResponseDto,
  GamificationStatsResponseDto
} from './dto/gamification.dto';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  // ===== PERFIL DE USUÁRIO =====

  @Get('profile')
  async getUserProfile(@Request() req): Promise<UserProfileResponseDto> {
    return this.gamificationService.getUserProfile(req.user.id);
  }

  @Get('stats')
  async getGamificationStats(@Request() req): Promise<GamificationStatsResponseDto> {
    return this.gamificationService.getGamificationStats(req.user.id);
  }

  // ===== XP =====

  @Post('xp')
  @HttpCode(HttpStatus.OK)
  async addXP(@Body() addXPDto: AddXPDto) {
    return this.gamificationService.addXP(addXPDto);
  }

  @Get('xp/history')
  async getXPHistory(@Request() req, @Query() query: XPHistoryQueryDto) {
    return this.gamificationService.getXPHistory(req.user.id, query);
  }

  // ===== MISSÕES =====

  @Post('missions')
  async createMission(@Body() createMissionDto: CreateMissionDto): Promise<MissionResponseDto> {
    return this.gamificationService.createMission(createMissionDto);
  }

  @Get('missions')
  async getMissions(@Query() query: MissionQueryDto) {
    return this.gamificationService.getMissions(query);
  }

  @Get('missions/:id')
  async getMissionById(@Param('id') id: string): Promise<MissionResponseDto> {
    return this.gamificationService.getMissionById(id);
  }

  @Put('missions/:id')
  async updateMission(
    @Param('id') id: string,
    @Body() updateMissionDto: UpdateMissionDto
  ): Promise<MissionResponseDto> {
    return this.gamificationService.updateMission(id, updateMissionDto);
  }

  @Delete('missions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMission(@Param('id') id: string): Promise<void> {
    return this.gamificationService.deleteMission(id);
  }

  @Post('missions/:id/assign')
  async assignMissionToUser(
    @Request() req,
    @Param('id') missionId: string
  ): Promise<UserMissionResponseDto> {
    return this.gamificationService.assignMissionToUser(req.user.id, missionId);
  }

  @Get('missions/user/my-missions')
  async getUserMissions(
    @Request() req,
    @Query('status') status?: string
  ): Promise<UserMissionResponseDto[]> {
    return this.gamificationService.getUserMissions(req.user.id, status as any);
  }

  @Post('missions/progress')
  async updateMissionProgress(
    @Request() req,
    @Body() progressDto: MissionProgressDto
  ): Promise<UserMissionResponseDto[]> {
    // Garantir que o userId seja o do usuário autenticado
    progressDto.userId = req.user.id;
    return this.gamificationService.updateMissionProgress(progressDto);
  }

  // ===== CONQUISTAS =====

  @Post('achievements')
  async createAchievement(@Body() createAchievementDto: CreateAchievementDto): Promise<AchievementResponseDto> {
    return this.gamificationService.createAchievement(createAchievementDto);
  }

  @Get('achievements')
  async getAchievements(@Query() query: AchievementQueryDto) {
    return this.gamificationService.getAchievements(query);
  }

  @Get('achievements/:id')
  async getAchievementById(@Param('id') id: string): Promise<AchievementResponseDto> {
    return this.gamificationService.getAchievementById(id);
  }

  @Put('achievements/:id')
  async updateAchievement(
    @Param('id') id: string,
    @Body() updateAchievementDto: UpdateAchievementDto
  ): Promise<AchievementResponseDto> {
    return this.gamificationService.updateAchievement(id, updateAchievementDto);
  }

  @Delete('achievements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAchievement(@Param('id') id: string): Promise<void> {
    return this.gamificationService.deleteAchievement(id);
  }

  @Get('achievements/user/my-achievements')
  async getUserAchievements(@Request() req): Promise<UserAchievementResponseDto[]> {
    return this.gamificationService.getUserAchievements(req.user.id);
  }

  @Post('achievements/progress')
  async updateAchievementProgress(
    @Request() req,
    @Body() progressDto: AchievementProgressDto
  ): Promise<UserAchievementResponseDto[]> {
    // Garantir que o userId seja o do usuário autenticado
    progressDto.userId = req.user.id;
    return this.gamificationService.updateAchievementProgress(progressDto);
  }

  // ===== AÇÕES DE INTEGRAÇÃO =====

  @Post('actions/class-completion')
  @HttpCode(HttpStatus.OK)
  async processClassCompletion(
    @Request() req,
    @Body() body: { classId: string }
  ): Promise<{ message: string }> {
    await this.gamificationService.processClassCompletion(req.user.id, body.classId);
    return { message: 'XP e progresso atualizados com sucesso' };
  }

  @Post('actions/daily-login')
  @HttpCode(HttpStatus.OK)
  async processDailyLogin(@Request() req): Promise<{ message: string }> {
    await this.gamificationService.processDailyLogin(req.user.id);
    return { message: 'Progresso de login diário atualizado' };
  }
}

