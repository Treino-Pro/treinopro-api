import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

describe('AdminController', () => {
  let controller: AdminController;
  const mockService = {
    getDashboardSummary: jest.fn().mockResolvedValue({ users: 1 }),
    listUsers: jest.fn().mockResolvedValue([]),
    updateUser: jest.fn().mockResolvedValue({ id: 'u1' }),
    getFinancialSummary: jest.fn().mockResolvedValue({ summary: {}, latest: [] }),
    listMissions: jest.fn().mockResolvedValue([]),
    updateMission: jest.fn().mockResolvedValue({ id: 'm1' }),
    getAnalytics: jest.fn().mockResolvedValue({ users: 1, proposals: {}, classes: {}, payments: {} }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockService },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getDashboard should call service', async () => {
    const res = await controller.getDashboard();
    expect(res).toEqual({ users: 1 });
  });

  it('listUsers should call service', async () => {
    const res = await controller.listUsers();
    expect(res).toEqual([]);
  });

  it('updateUser should call service', async () => {
    const res = await controller.updateUser('u1', {});
    expect(res).toEqual({ id: 'u1' });
  });

  it('getFinancialSummary should call service', async () => {
    const res = await controller.getFinancialSummary();
    expect(res).toEqual({ summary: {}, latest: [] });
  });

  it('listMissions should call service', async () => {
    const res = await controller.listMissions();
    expect(res).toEqual([]);
  });

  it('updateMission should call service', async () => {
    const res = await controller.updateMission('m1', {});
    expect(res).toEqual({ id: 'm1' });
  });

  it('getAnalytics should call service', async () => {
    const res = await controller.getAnalytics();
    expect(res).toEqual({ users: 1, proposals: {}, classes: {}, payments: {} });
  });
});


