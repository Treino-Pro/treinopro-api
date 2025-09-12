// Mock database para desenvolvimento quando PostgreSQL não está disponível
export class MockDatabase {
  private users: any[] = [];
  private nextId = 1;

  query = {
    users: {
      findFirst: async (options: any) => {
        console.log('🔍 [MOCK-DB] Buscando usuário:', options);
        const { where } = options;
        if (where && where.email) {
          const user = this.users.find(user => user.email === where.email);
          console.log('🔍 [MOCK-DB] Usuário encontrado:', user ? 'Sim' : 'Não');
          return user;
        }
        return null;
      },
      findMany: async () => this.users,
    },
  };

  insert = (table: any) => {
    console.log('👤 [MOCK-DB] Inserindo dados na tabela:', table);
    return {
      values: (data: any) => {
        console.log('👤 [MOCK-DB] Dados para inserção:', data);
        return {
          returning: async () => {
            const newUser = { 
              id: `mock-${this.nextId++}`, 
              ...data, 
              createdAt: new Date(), 
              updatedAt: new Date(),
              isVerified: false
            };
            this.users.push(newUser);
            console.log('✅ [MOCK-DB] Usuário criado:', newUser);
            return [newUser];
          },
        };
      },
    };
  };

  update = (table: any) => {
    return {
      set: (data: any) => ({
        where: (condition: any) => {
          // Mock update - não implementado completamente
          return Promise.resolve();
        },
      }),
    };
  };
}

export const mockDb = new MockDatabase();
