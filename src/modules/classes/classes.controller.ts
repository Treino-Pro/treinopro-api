import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClassesService } from './classes.service';
import { 
  CreateClassDto, 
  UpdateClassDto, 
  GetClassesDto, 
  ClassResponseDto, 
  ClassStatsDto, 
  StartClassDto, 
  CompleteClassDto,
  ConfirmClassStartDto,
  ReportNoShowDto,
  ResolveNoShowDisputeDto,
  ClassTimelineDto,
  ClassDisputeDto
} from './dto/classes.dto';

@Controller('classes')
@UseGuards(JwtAuthGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  async createClass(
    @Body() createClassDto: CreateClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.createClass(createClassDto, req.user.sub);
  }

  @Get()
  async getClasses(
    @Query() getClassesDto: GetClassesDto,
    @Request() req: any,
  ): Promise<{ classes: ClassResponseDto[]; total: number; page: number; limit: number }> {
    return this.classesService.getClasses(getClassesDto, req.user.sub);
  }

  @Get('stats')
  async getClassStats(@Request() req: any): Promise<ClassStatsDto> {
    return this.classesService.getClassStats(req.user.sub);
  }

  @Get(':id')
  async getClassById(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.getClassById(id, req.user.sub);
  }

  @Put(':id')
  async updateClass(
    @Param('id') id: string,
    @Body() updateClassDto: UpdateClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.updateClass(id, updateClassDto, req.user.sub);
  }

  @Post(':id/start')
  async startClass(
    @Param('id') id: string,
    @Body() startClassDto: StartClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.startClass(id, startClassDto, req.user.sub);
  }

  @Post(':id/complete')
  async completeClass(
    @Param('id') id: string,
    @Body() completeClassDto: CompleteClassDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.completeClass(id, completeClassDto, req.user.sub);
  }

  @Post(':id/cancel')
  async cancelClass(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.cancelClass(id, req.user.sub);
  }

  @Get(':id/timeline')
  async getClassTimeline(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ClassTimelineDto> {
    return this.classesService.getClassTimeline(id, req.user.sub);
  }

  @Post(':id/confirm-start')
  async confirmClassStart(
    @Param('id') id: string,
    @Body() confirmDto: ConfirmClassStartDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.confirmClassStart(id, confirmDto, req.user.sub);
  }

  @Post(':id/report-no-show')
  async reportNoShow(
    @Param('id') id: string,
    @Body() reportDto: ReportNoShowDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.reportNoShow(id, reportDto, req.user.sub);
  }

  @Post(':id/report-personal-no-show')
  async reportPersonalNoShow(
    @Param('id') id: string,
    @Body() reportDto: ReportNoShowDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.reportPersonalNoShow(id, reportDto, req.user.sub);
  }

  @Post(':id/resolve-dispute')
  async resolveNoShowDispute(
    @Param('id') id: string,
    @Body() resolveDto: ResolveNoShowDisputeDto,
    @Request() req: any,
  ): Promise<ClassResponseDto> {
    return this.classesService.resolveNoShowDispute(id, resolveDto, req.user.sub);
  }

  @Get('disputes')
  async getClassDisputes(@Request() req: any): Promise<ClassDisputeDto[]> {
    return this.classesService.getClassDisputes(req.user.sub);
  }
}
