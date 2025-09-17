import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard summary' })
  async getDashboard() {
    return this.adminService.getDashboardSummary();
  }

  @Get('users')
  @ApiOperation({ summary: 'List users (basic info)' })
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Update user basic info/status' })
  async updateUser(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateUser(id, body);
  }

  // ===== FINANCIAL =====
  @Get('financial')
  @ApiOperation({ summary: 'Get financial summary' })
  async getFinancialSummary() {
    return this.adminService.getFinancialSummary();
  }

  // ===== MISSIONS (Gamification) =====
  @Get('missions')
  @ApiOperation({ summary: 'List missions (gamification)' })
  async listMissions() {
    return this.adminService.listMissions();
  }

  @Put('missions/:id')
  @ApiOperation({ summary: 'Update mission (gamification)' })
  async updateMission(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateMission(id, body);
  }

  // ===== ANALYTICS =====
  @Get('analytics')
  @ApiOperation({ summary: 'Get platform analytics (aggregated metrics)' })
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }
}


