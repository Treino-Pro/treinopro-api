import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatService: ChatService;
  let jwtService: JwtService;
  let mockSocket: any;
  let mockServer: any;

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
  };

  beforeEach(async () => {
    const mockChatService = {
      sendMessage: jest.fn(),
      markAsRead: jest.fn(),
    };

    const mockJwtService = {
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    chatService = module.get<ChatService>(ChatService);
    jwtService = module.get<JwtService>(JwtService);

    // Mock server
    mockServer = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      sockets: {
        sockets: new Map(),
      },
    };
    gateway.server = mockServer;

    // Mock socket
    mockSocket = {
      id: 'socket-1',
      userId: 'user-1',
      userType: 'student',
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      handshake: {
        headers: {},
        query: {},
        auth: {},
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should connect user successfully with valid token', async () => {
      const mockToken = 'valid-token';
      mockSocket.handshake.headers.authorization = `Bearer ${mockToken}`;
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockUser);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.userId).toBe('user-1');
      expect(mockSocket.userType).toBe('student');
      expect(mockServer.emit).toHaveBeenCalledWith('user_online', {
        userId: 'user-1',
        userType: 'student',
        timestamp: expect.any(Date),
      });
    });

    it('should connect user with token from query params', async () => {
      const mockToken = 'valid-token';
      mockSocket.handshake.query.token = mockToken;
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockUser);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.userId).toBe('user-1');
      expect(mockSocket.userType).toBe('student');
    });

    it('should connect user with token from auth object', async () => {
      const mockToken = 'valid-token';
      mockSocket.handshake.auth.token = mockToken;
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockUser);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.userId).toBe('user-1');
      expect(mockSocket.userType).toBe('student');
    });

    it('should disconnect user with invalid token', async () => {
      const mockToken = 'invalid-token';
      mockSocket.handshake.headers.authorization = `Bearer ${mockToken}`;
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect user with no token', async () => {
      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should handle user disconnect', () => {
      mockSocket.userId = 'user-1';
      mockSocket.userType = 'student';

      gateway.handleDisconnect(mockSocket);

      expect(mockServer.emit).toHaveBeenCalledWith('user_offline', {
        userId: 'user-1',
        userType: 'student',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('handleSendMessage', () => {
    it('should send message successfully', async () => {
      const sendMessageDto: SendMessageDto = {
        classId: 'class-1',
        receiverId: 'personal-1',
        messageText: 'Olá! Como está?',
      };

      mockSocket.userId = 'user-1';
      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);

      // Mock receiver socket
      const receiverSocket = {
        id: 'socket-2',
        emit: jest.fn(),
      };
      mockServer.sockets.sockets.set('socket-2', receiverSocket);

      // Mock connectedUsers map
      (gateway as any).connectedUsers = new Map([['personal-1', 'socket-2']]);

      await gateway.handleSendMessage(mockSocket, sendMessageDto);

      expect(chatService.sendMessage).toHaveBeenCalledWith('user-1', sendMessageDto);
      expect(mockSocket.emit).toHaveBeenCalledWith('message_sent', expect.any(Object));
      expect(receiverSocket.emit).toHaveBeenCalledWith('message_received', expect.any(Object));
    });

    it('should emit error when user is not authenticated', async () => {
      const sendMessageDto: SendMessageDto = {
        classId: 'class-1',
        receiverId: 'personal-1',
        messageText: 'Olá! Como está?',
      };

      mockSocket.userId = undefined;

      await gateway.handleSendMessage(mockSocket, sendMessageDto);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Usuário não autenticado',
      });
    });

    it('should emit error when service throws error', async () => {
      const sendMessageDto: SendMessageDto = {
        classId: 'class-1',
        receiverId: 'personal-1',
        messageText: 'Olá! Como está?',
      };

      mockSocket.userId = 'user-1';
      jest.spyOn(chatService, 'sendMessage').mockRejectedValue(new Error('Service error'));

      await gateway.handleSendMessage(mockSocket, sendMessageDto);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Service error',
      });
    });
  });

  describe('handleJoinClass', () => {
    it('should join class successfully', async () => {
      const classData = { classId: 'class-1' };
      mockSocket.userId = 'user-1';

      await gateway.handleJoinClass(mockSocket, classData);

      expect(mockSocket.join).toHaveBeenCalledWith('class_class-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('joined_class', {
        classId: 'class-1',
        timestamp: expect.any(Date),
      });
    });

    it('should emit error when user is not authenticated', async () => {
      const classData = { classId: 'class-1' };
      mockSocket.userId = undefined;

      await gateway.handleJoinClass(mockSocket, classData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Usuário não autenticado',
      });
    });
  });

  describe('handleLeaveClass', () => {
    it('should leave class successfully', async () => {
      const classData = { classId: 'class-1' };
      mockSocket.userId = 'user-1';

      await gateway.handleLeaveClass(mockSocket, classData);

      expect(mockSocket.leave).toHaveBeenCalledWith('class_class-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('left_class', {
        classId: 'class-1',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('handleTypingStart', () => {
    it('should handle typing start', async () => {
      const data = { classId: 'class-1', receiverId: 'personal-1' };
      mockSocket.userId = 'user-1';
      mockSocket.userType = 'student';

      // Mock receiver socket
      const receiverSocket = {
        id: 'socket-2',
        emit: jest.fn(),
      };
      mockServer.sockets.sockets.set('socket-2', receiverSocket);

      // Mock connectedUsers map
      (gateway as any).connectedUsers = new Map([['personal-1', 'socket-2']]);

      await gateway.handleTypingStart(mockSocket, data);

      expect(receiverSocket.emit).toHaveBeenCalledWith('typing_start', {
        classId: 'class-1',
        userId: 'user-1',
        userType: 'student',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('handleTypingStop', () => {
    it('should handle typing stop', async () => {
      const data = { classId: 'class-1', receiverId: 'personal-1' };
      mockSocket.userId = 'user-1';
      mockSocket.userType = 'student';

      // Mock receiver socket
      const receiverSocket = {
        id: 'socket-2',
        emit: jest.fn(),
      };
      mockServer.sockets.sockets.set('socket-2', receiverSocket);

      // Mock connectedUsers map
      (gateway as any).connectedUsers = new Map([['personal-1', 'socket-2']]);

      await gateway.handleTypingStop(mockSocket, data);

      expect(receiverSocket.emit).toHaveBeenCalledWith('typing_stop', {
        classId: 'class-1',
        userId: 'user-1',
        userType: 'student',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('handleMarkAsRead', () => {
    it('should mark message as read successfully', async () => {
      const data = { classId: 'class-1', messageId: 'message-1' };
      mockSocket.userId = 'user-1';
      jest.spyOn(chatService, 'markAsRead').mockResolvedValue({ success: true });

      await gateway.handleMarkAsRead(mockSocket, data);

      expect(chatService.markAsRead).toHaveBeenCalledWith('user-1', data);
      expect(mockServer.emit).toHaveBeenCalledWith('message_read', {
        classId: 'class-1',
        messageId: 'message-1',
        readBy: 'user-1',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('utility methods', () => {
    it('should check if user is online', () => {
      (gateway as any).connectedUsers = new Map([['user-1', 'socket-1']]);

      expect(gateway.isUserOnline('user-1')).toBe(true);
      expect(gateway.isUserOnline('user-2')).toBe(false);
    });

    it('should get user socket', () => {
      const mockUserSocket = { id: 'socket-1' };
      mockServer.sockets.sockets.set('socket-1', mockUserSocket);
      (gateway as any).connectedUsers = new Map([['user-1', 'socket-1']]);

      const result = gateway.getUserSocket('user-1');
      expect(result).toBe(mockUserSocket);
    });

    it('should return undefined for non-connected user', () => {
      const result = gateway.getUserSocket('user-2');
      expect(result).toBeUndefined();
    });
  });
});
