import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { CrefQueueService } from './cref-queue.service';

describe('CrefQueueService', () => {
  let service: CrefQueueService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn(),
      process: jest.fn(),
      on: jest.fn(),
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      empty: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      getJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrefQueueService,
        {
          provide: getQueueToken('cref-validation'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<CrefQueueService>(CrefQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should add validation job to queue', async () => {
    const mockJob = {
      id: '123',
      data: {
        crefNumber: 'SP-123456',
        userType: 'personal',
        retryCount: 0,
      },
    };

    mockQueue.add.mockResolvedValue(mockJob);

    const result = await service.addValidationJob('SP-123456', 'personal', 'normal');

    expect(result).toEqual(mockJob);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'validate-cref',
      {
        crefNumber: 'SP-123456',
        userType: 'personal',
        retryCount: 0,
      },
      expect.objectContaining({
        priority: 5,
        delay: 0,
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 10,
        removeOnFail: 5,
      }),
    );
  });

  it('should add high priority job', async () => {
    const mockJob = { id: '123', data: {} };
    mockQueue.add.mockResolvedValue(mockJob);

    await service.addValidationJob('SP-123456', 'personal', 'high');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'validate-cref',
      expect.any(Object),
      expect.objectContaining({
        priority: 10,
      }),
    );
  });

  it('should add low priority job', async () => {
    const mockJob = { id: '123', data: {} };
    mockQueue.add.mockResolvedValue(mockJob);

    await service.addValidationJob('SP-123456', 'personal', 'low');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'validate-cref',
      expect.any(Object),
      expect.objectContaining({
        priority: 1,
      }),
    );
  });

  it('should get queue stats', async () => {
    mockQueue.getWaiting.mockResolvedValue([{ id: '1' }]);
    mockQueue.getActive.mockResolvedValue([{ id: '2' }]);
    mockQueue.getCompleted.mockResolvedValue([{ id: '3' }]);
    mockQueue.getFailed.mockResolvedValue([{ id: '4' }]);

    const stats = await service.getQueueStats();

    expect(stats).toEqual({
      waiting: 1,
      active: 1,
      completed: 1,
      failed: 1,
      total: 4,
    });
  });

  it('should clear queue', async () => {
    await service.clearQueue();

    expect(mockQueue.empty).toHaveBeenCalled();
  });

  it('should pause queue', async () => {
    await service.pauseQueue();

    expect(mockQueue.pause).toHaveBeenCalled();
  });

  it('should resume queue', async () => {
    await service.resumeQueue();

    expect(mockQueue.resume).toHaveBeenCalled();
  });

  it('should get jobs by status', async () => {
    const mockJobs = [{ id: '1', data: {} }];
    mockQueue.getWaiting.mockResolvedValue(mockJobs);

    const jobs = await service.getJobsByStatus('waiting');

    expect(jobs).toEqual(mockJobs);
    expect(mockQueue.getWaiting).toHaveBeenCalled();
  });

  it('should remove job', async () => {
    const mockJob = {
      id: '123',
      remove: jest.fn(),
    };
    mockQueue.getJob.mockResolvedValue(mockJob);

    await service.removeJob('123');

    expect(mockQueue.getJob).toHaveBeenCalledWith('123');
    expect(mockJob.remove).toHaveBeenCalled();
  });

  it('should not remove non-existent job', async () => {
    mockQueue.getJob.mockResolvedValue(null);

    await service.removeJob('123');

    expect(mockQueue.getJob).toHaveBeenCalledWith('123');
  });
});
