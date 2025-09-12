// Mock database para desenvolvimento quando PostgreSQL não está disponível
export class MockDatabase {
  private users: any[] = [];
  private nextId = 1;

  query = {
    users: {
      findFirst: async (options: any) => {
        console.log('🔍 [MOCK-DB] Buscando usuário:', options);
        const { where } = options;
        
        // Verificar se where é uma função (caso do Drizzle ORM)
        if (typeof where === 'function') {
          const user = this.users.find(where);
          console.log('🔍 [MOCK-DB] Usuário encontrado (função):', user ? 'Sim' : 'Não');
          if (user) {
            console.log('🔍 [MOCK-DB] Dados do usuário encontrado:', { id: user.id, email: user.email });
          }
          return user;
        }
        
        // Verificar se where é um objeto SQL do Drizzle ORM
        if (where && where.queryChunks && Array.isArray(where.queryChunks)) {
          console.log('🔍 [MOCK-DB] Processando objeto SQL do Drizzle ORM');
          // Procurar por um chunk do tipo Param que contenha o email
          for (const chunk of where.queryChunks) {
            if (chunk && chunk.constructor && chunk.constructor.name === 'Param') {
              const email = chunk.value;
              if (email) {
                console.log('🔍 [MOCK-DB] Email encontrado no SQL:', email);
                const user = this.users.find(user => user.email === email);
                console.log('🔍 [MOCK-DB] Usuário encontrado (SQL):', user ? 'Sim' : 'Não');
                if (user) {
                  console.log('🔍 [MOCK-DB] Dados do usuário encontrado:', { id: user.id, email: user.email });
                }
                return user;
              }
            }
          }
        }
        
        // Verificar se where tem email (caso direto)
        if (where && where.email) {
          const user = this.users.find(user => user.email === where.email);
          console.log('🔍 [MOCK-DB] Usuário encontrado (email):', user ? 'Sim' : 'Não');
          if (user) {
            console.log('🔍 [MOCK-DB] Dados do usuário encontrado:', { id: user.id, email: user.email });
          }
          return user;
        }
        
        return null;
      },
      findMany: async () => this.users,
      clear: () => {
        this.users = [];
        this.nextId = 1;
        console.log('🧹 [MOCK-DB] Banco de dados limpo');
      },
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
              id: `mock-user-${this.nextId++}`, 
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
