import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SendMessageDto, GetMessagesDto, MarkAsReadDto } from './dto/chat.dto';

describe('ChatController', () => {
  let controller: ChatController;
  let service: ChatService;

  const mockUser = {
    sub: 'user-1',
    email: 'joao@email.com',
    userType: 'student',
  };

  const mockMessage = {
    id: 'message-1',
    classId: 'class-1',
    senderId: 'user-1',
    receiverId: 'personal-1',
    messageText: 'Olá! Como está?',
    sentAt: new Date(),
    isRead: false,
    createdAt: new Date(),
    sender: {
      id: 'user-1',
      name: 'João Silva',
      profilePicture: null,
    },
  };

  const mockMessagesResponse = {
    messages: [mockMessage],
    total: 1,
    page: 1,
    limit: 50,
    totalPages: 1,
  };

  const mockChatStats = {
    totalMessages: 10,
    unreadMessages: 3,
    totalConversations: 5,
    activeConversations: 2,
  };

  const mockConversations = [
    {
      classId: 'class-1',
      otherParticipant: {
        id: 'personal-1',
        name: 'Maria Santos',
        profilePicture: null,
      },
      lastMessage: {
        id: 'message-1',
        messageText: 'Última mensagem',
        sentAt: new Date(),
        isRead: false,
      },
      unreadCount: 2,
    },
  ];

  beforeEach(async () => {
    const mockChatService = {
      sendMessage: jest.fn(),
      getMessages: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getChatStats: jest.fn(),
      getConversations: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
            sign: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const sendMessageDto: SendMessageDto = {
        classId: 'class-1',
        receiverId: 'personal-1',
        messageText: 'Olá! Como está?',
      };

      const mockRequest = { user: mockUser };
      jest.spyOn(service, 'sendMessage').mockResolvedValue(mockMessage);

      const result = await controller.sendMessage(mockRequest, sendMessageDto);

      expect(service.sendMessage).toHaveBeenCalledWith(
        'user-1',
        sendMessageDto,
      );
      expect(result).toEqual(mockMessage);
    });
  });

  describe('getMessages', () => {
    it('should return messages with pagination', async () => {
      const getMessagesDto: GetMessagesDto = {
        classId: 'class-1',
        page: 1,
        limit: 50,
      };

      const mockRequest = { user: mockUser };
      jest
        .spyOn(service, 'getMessages')
        .mockResolvedValue(mockMessagesResponse);

      const result = await controller.getMessages(mockRequest, getMessagesDto);

      expect(service.getMessages).toHaveBeenCalledWith(
        'user-1',
        getMessagesDto,
      );
      expect(result).toEqual(mockMessagesResponse);
    });
  });

  describe('markAsRead', () => {
    it('should mark message as read successfully', async () => {
      const markAsReadDto = { classId: 'class-1' };
      const mockRequest = { user: mockUser };
      const expectedResult = { success: true };

      jest.spyOn(service, 'markAsRead').mockResolvedValue(expectedResult);

      const result = await controller.markAsRead(
        mockRequest,
        'message-1',
        markAsReadDto,
      );

      expect(service.markAsRead).toHaveBeenCalledWith('user-1', {
        classId: 'class-1',
        messageId: 'message-1',
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all messages as read successfully', async () => {
      const mockRequest = { user: mockUser };
      const expectedResult = { success: true, updatedCount: 3 };

      jest.spyOn(service, 'markAllAsRead').mockResolvedValue(expectedResult);

      const result = await controller.markAllAsRead(mockRequest, 'class-1');

      expect(service.markAllAsRead).toHaveBeenCalledWith('user-1', 'class-1');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getChatStats', () => {
    it('should return chat statistics', async () => {
      const mockRequest = { user: mockUser };
      jest.spyOn(service, 'getChatStats').mockResolvedValue(mockChatStats);

      const result = await controller.getChatStats(mockRequest);

      expect(service.getChatStats).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockChatStats);
    });
  });

  describe('getConversations', () => {
    it('should return user conversations', async () => {
      const mockRequest = { user: mockUser };
      jest
        .spyOn(service, 'getConversations')
        .mockResolvedValue(mockConversations);

      const result = await controller.getConversations(mockRequest);

      expect(service.getConversations).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockConversations);
    });
  });

  describe('getClassMessages', () => {
    it('should return messages for a specific class', async () => {
      const mockRequest = { user: mockUser };
      jest
        .spyOn(service, 'getMessages')
        .mockResolvedValue(mockMessagesResponse);

      const result = await controller.getClassMessages(
        mockRequest,
        'class-1',
        1,
        50,
      );

      expect(service.getMessages).toHaveBeenCalledWith('user-1', {
        classId: 'class-1',
        page: 1,
        limit: 50,
      });
      expect(result).toEqual(mockMessagesResponse);
    });

    it('should use default pagination values when not provided', async () => {
      const mockRequest = { user: mockUser };
      jest
        .spyOn(service, 'getMessages')
        .mockResolvedValue(mockMessagesResponse);

      const result = await controller.getClassMessages(mockRequest, 'class-1');

      expect(service.getMessages).toHaveBeenCalledWith('user-1', {
        classId: 'class-1',
        page: 1,
        limit: 50,
      });
      expect(result).toEqual(mockMessagesResponse);
    });
  });
});
