import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UserType, DocumentType } from './dto/auth.dto';

// Mock do JwtAuthGuard
jest.mock('./guards/jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: () => true,
  })),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    forgotPassword: jest.fn(),
    changePassword: jest.fn(),
    refreshToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('deve chamar authService.register com os dados corretos', async () => {
      // Arrange
      const registerDto: RegisterDto = {
        email: 'joao@email.com',
        password: '123456',
        firstName: 'João',
        lastName: 'Silva',
        phone: '11999999999',
        birthDate: '1990-01-01',
        userType: UserType.STUDENT,
        documentType: DocumentType.RG,
        documentNumber: '12345678901',
        documentImageUrl: 'https://example.com/rg-joao.jpg',
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      };

      const expectedResult = {
        user: {
          id: '1',
          email: registerDto.email,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          userType: registerDto.userType,
          isVerified: false,
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.register(registerDto);

      // Assert
      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(expectedResult);
    });

    it('deve propagar erros do authService', async () => {
      // Arrange
      const registerDto: RegisterDto = {
        email: 'joao@email.com',
        password: '123456',
        firstName: 'João',
        lastName: 'Silva',
        phone: '11999999999',
        birthDate: '1990-01-01',
        userType: UserType.STUDENT,
        documentType: DocumentType.RG,
        documentNumber: '12345678901',
        documentImageUrl: 'https://example.com/rg-joao.jpg',
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      };

      const error = new Error('Database error');
      mockAuthService.register.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.register(registerDto)).rejects.toThrow(error);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    it('deve chamar authService.login com os dados corretos', async () => {
      // Arrange
      const loginDto: LoginDto = {
        email: 'joao@email.com',
        password: '123456',
      };

      const expectedResult = {
        user: {
          id: '1',
          email: loginDto.email,
          firstName: 'João',
          lastName: 'Silva',
          userType: UserType.STUDENT,
        documentType: DocumentType.RG,
        documentNumber: '12345678901',
        documentImageUrl: 'https://example.com/rg-joao.jpg',
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
          isVerified: true,
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.login(loginDto);

      // Assert
      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual(expectedResult);
    });

    it('deve propagar erros do authService', async () => {
      // Arrange
      const loginDto: LoginDto = {
        email: 'joao@email.com',
        password: '123456',
      };

      const error = new Error('Invalid credentials');
      mockAuthService.login.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.login(loginDto)).rejects.toThrow(error);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('forgotPassword', () => {
    it('deve chamar authService.forgotPassword com os dados corretos', async () => {
      // Arrange
      const forgotPasswordDto = {
        email: 'joao@email.com',
      };

      const expectedResult = {
        message: 'Email de recuperação enviado',
      };

      mockAuthService.forgotPassword.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.forgotPassword(forgotPasswordDto);

      // Assert
      expect(authService.forgotPassword).toHaveBeenCalledWith(forgotPasswordDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('changePassword', () => {
    it('deve chamar authService.changePassword com os dados corretos', async () => {
      // Arrange
      const changePasswordDto = {
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123',
      };
      const mockUser = { user: { sub: 'user-id' } };

      const expectedResult = {
        message: 'Senha alterada com sucesso',
      };

      mockAuthService.changePassword.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.changePassword(mockUser, changePasswordDto);

      // Assert
      expect(authService.changePassword).toHaveBeenCalledWith('user-id', changePasswordDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('refreshToken', () => {
    it('deve chamar authService.refreshToken com os dados corretos', async () => {
      // Arrange
      const refreshTokenDto = {
        refreshToken: 'refresh-token',
      };

      const expectedResult = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockAuthService.refreshToken.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.refreshToken(refreshTokenDto);

      // Assert
      expect(authService.refreshToken).toHaveBeenCalledWith(refreshTokenDto.refreshToken);
      expect(result).toEqual(expectedResult);
    });
  });
});
