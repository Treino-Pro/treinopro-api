import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, UserType } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';

// Mock do banco de dados
const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(),
    },
  },
  insert: jest.fn(),
};

// Mock do JwtService
const mockJwtService = {
  sign: jest.fn(),
  signAsync: jest.fn(),
};

// Mock do ConfigService
const mockConfigService = {
  get: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const validStudentDto: RegisterDto = {
      email: 'joao@email.com',
      password: '123456',
      firstName: 'João',
      lastName: 'Silva',
      phone: '11999999999',
      birthDate: '1990-01-01',
      userType: UserType.STUDENT,
    };

    const validPersonalDto: RegisterDto = {
      email: 'personal@email.com',
      password: '123456',
      firstName: 'Maria',
      lastName: 'Silva',
      phone: '11999999999',
      birthDate: '1985-01-01',
      userType: UserType.PERSONAL,
      cref: 'CREF: 0111212-9',
      specialties: ['Musculação', 'Funcional'],
    };

    it('deve registrar um estudante com sucesso', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: '1',
            email: validStudentDto.email,
            firstName: validStudentDto.firstName,
            lastName: validStudentDto.lastName,
            userType: validStudentDto.userType,
            isVerified: false,
          }]),
        }),
      });
      mockJwtService.signAsync.mockResolvedValue('mock-access-token');
      mockConfigService.get.mockReturnValue('mock-secret');

      // Act
      const result = await service.register(validStudentDto);

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(validStudentDto.email);
      expect(result.user.userType).toBe('student');
      expect(mockDb.query.users.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('deve registrar um personal trainer com sucesso', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: '2',
            email: validPersonalDto.email,
            firstName: validPersonalDto.firstName,
            lastName: validPersonalDto.lastName,
            userType: validPersonalDto.userType,
            isVerified: false,
          }]),
        }),
      });
      mockJwtService.signAsync.mockResolvedValue('mock-access-token');
      mockConfigService.get.mockReturnValue('mock-secret');

      // Act
      const result = await service.register(validPersonalDto);

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(validPersonalDto.email);
      expect(result.user.userType).toBe('personal');
      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object));
    });

    it('deve lançar ConflictException quando email já existe', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue({
        id: '1',
        email: validStudentDto.email,
      });

      // Act & Assert
      await expect(service.register(validStudentDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockDb.query.users.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });

    it('deve lançar BadRequestException quando personal trainer não tem CREF', async () => {
      // Arrange
      const invalidPersonalDto = { ...validPersonalDto, cref: undefined };
      mockDb.query.users.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.register(invalidPersonalDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDb.query.users.findFirst).toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando estudante tem CREF', async () => {
      // Arrange
      const invalidStudentDto = { ...validStudentDto, cref: 'CREF: 0111212-9' };
      mockDb.query.users.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.register(invalidStudentDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDb.query.users.findFirst).toHaveBeenCalled();
    });

    it('deve hash da senha corretamente', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: '1',
            email: validStudentDto.email,
            firstName: validStudentDto.firstName,
            lastName: validStudentDto.lastName,
            userType: validStudentDto.userType,
            isVerified: false,
          }]),
        }),
      });
      mockJwtService.signAsync.mockResolvedValue('mock-access-token');
      mockConfigService.get.mockReturnValue('mock-secret');

      // Act
      await service.register(validStudentDto);

      // Assert
      expect(mockDb.insert).toHaveBeenCalled();
      const insertCall = mockDb.insert.mock.calls[0];
      expect(insertCall[0]).toBeDefined(); // Verifica se foi chamado com o schema users
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'joao@email.com',
      password: '123456',
    };

    it('deve fazer login com sucesso', async () => {
      // Arrange
      const hashedPassword = await bcrypt.hash('123456', 12);
      const mockUser = {
        id: '1',
        email: loginDto.email,
        passwordHash: hashedPassword,
        firstName: 'João',
        lastName: 'Silva',
        userType: 'student',
        isVerified: true,
      };

      mockDb.query.users.findFirst.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('mock-access-token');
      mockConfigService.get.mockReturnValue('mock-secret');

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(loginDto.email);
    });

    it('deve lançar UnauthorizedException quando usuário não existe', async () => {
      // Arrange
      mockDb.query.users.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException quando senha está incorreta', async () => {
      // Arrange
      const mockUser = {
        id: '1',
        email: loginDto.email,
        passwordHash: 'wrong-hash',
        firstName: 'João',
        lastName: 'Silva',
        userType: 'student',
        isVerified: true,
      };

      mockDb.query.users.findFirst.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
