import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushNotificationService } from './push-notification.service';

const mockSend = jest.fn();

jest.mock('firebase-admin', () => ({
  __esModule: true,
  apps: [{}],
  credential: {
    cert: jest.fn(),
  },
  initializeApp: jest.fn(),
  messaging: jest.fn(() => ({
    send: mockSend,
  })),
}));

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'IOS_BUNDLE_ID') {
      return 'com.treinopro.app';
    }

    return null;
  }),
};

describe('PushNotificationService', () => {
  let service: PushNotificationService;

  beforeEach(async () => {
    mockSend.mockResolvedValue('message-id');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'DATABASE_CONNECTION',
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve usar alert_proposal.caf no payload iOS para proposal-match', async () => {
    await service.sendToToken('token-1', 'proposal-match', {
      proposalId: 'proposal-1',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        apns: expect.objectContaining({
          payload: expect.objectContaining({
            aps: expect.objectContaining({
              sound: 'alert_proposal.caf',
            }),
          }),
        }),
      }),
    );
  });
});
