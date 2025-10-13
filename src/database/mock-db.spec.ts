import { MockDatabase, mockDb } from './mock-db';

describe('MockDatabase', () => {
  let mockDatabase: MockDatabase;

  beforeEach(() => {
    mockDatabase = new MockDatabase();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('query.users.findFirst', () => {
    it('deve retornar usuário quando encontrado', async () => {
      // Arrange
      const user = {
        id: '1',
        email: 'test@email.com',
        firstName: 'João',
        lastName: 'Silva',
      };
      mockDatabase['users'] = [user];

      // Act
      const result = await mockDatabase.query.users.findFirst({
        where: { email: 'test@email.com' },
      });

      // Assert
      expect(result).toEqual(user);
    });

    it('deve retornar null quando usuário não encontrado', async () => {
      // Arrange
      mockDatabase['users'] = [];

      // Act
      const result = await mockDatabase.query.users.findFirst({
        where: { email: 'nonexistent@email.com' },
      });

      // Assert
      expect(result).toBeNull();
    });

    it('deve retornar null quando where não tem email', async () => {
      // Arrange
      mockDatabase['users'] = [];

      // Act
      const result = await mockDatabase.query.users.findFirst({
        where: { id: '1' },
      });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('query.users.findMany', () => {
    it('deve retornar todos os usuários', async () => {
      // Arrange
      const users = [
        { id: '1', email: 'user1@email.com' },
        { id: '2', email: 'user2@email.com' },
      ];
      mockDatabase['users'] = users;

      // Act
      const result = await mockDatabase.query.users.findMany();

      // Assert
      expect(result).toEqual(users);
    });
  });

  describe('insert', () => {
    it('deve inserir usuário e retornar dados corretos', async () => {
      // Arrange
      const userData = {
        email: 'newuser@email.com',
        firstName: 'Maria',
        lastName: 'Silva',
        userType: 'student',
      };

      // Act
      const result = await mockDatabase.insert('users').values(userData).returning();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: expect.stringMatching(/^mock-user-\d+$/),
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        userType: userData.userType,
        isVerified: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(mockDatabase['users']).toHaveLength(1);
    });

    it('deve incrementar ID para múltiplos usuários', async () => {
      // Arrange
      const userData1 = { email: 'user1@email.com', firstName: 'User1' };
      const userData2 = { email: 'user2@email.com', firstName: 'User2' };

      // Act
      const result1 = await mockDatabase.insert('users').values(userData1).returning();
      const result2 = await mockDatabase.insert('users').values(userData2).returning();

      // Assert
      expect(result1[0].id).toBe('mock-user-1');
      expect(result2[0].id).toBe('mock-user-2');
    });
  });

  describe('update', () => {
    it('deve retornar estrutura correta para update', () => {
      // Act
      const result = mockDatabase.update('users');

      // Assert
      expect(result).toHaveProperty('set');
      expect(typeof result.set).toBe('function');
    });

    it('deve retornar where após set', () => {
      // Act
      const result = mockDatabase.update('users').set({ firstName: 'NewName' });

      // Assert
      expect(result).toHaveProperty('where');
      expect(typeof result.where).toBe('function');
    });
  });

  describe('mockDb instance', () => {
    it('deve ser uma instância de MockDatabase', () => {
      expect(mockDb).toBeInstanceOf(MockDatabase);
    });

    it('deve ter propriedades corretas', () => {
      expect(mockDb).toHaveProperty('query');
      expect(mockDb).toHaveProperty('insert');
      expect(mockDb).toHaveProperty('update');
      expect(mockDb.query).toHaveProperty('users');
      expect(mockDb.query.users).toHaveProperty('findFirst');
      expect(mockDb.query.users).toHaveProperty('findMany');
    });
  });
});
