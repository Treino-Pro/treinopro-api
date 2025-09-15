// Mock database para desenvolvimento quando PostgreSQL não está disponível
export class MockDatabase {
  private users: any[] = [];
  private messages: any[] = [];
  private classes: any[] = [];
  private nextId = 1;

  // Implementar interface do Drizzle ORM
  select = (columns?: any) => {
    const createQueryBuilder = (tableName: string = 'unknown') => {
      return {
        from: (table: any) => {
          const newTableName = table?.name || tableName;
          return createQueryBuilder(newTableName);
        },
        where: (condition: any) => createQueryBuilder(tableName),
        leftJoin: (joinTable: any, condition: any) => createQueryBuilder(tableName),
        orderBy: (order: any) => createQueryBuilder(tableName),
        limit: (count: number) => createQueryBuilder(tableName),
        offset: (offset: number) => createQueryBuilder(tableName),
        then: (callback: any) => {
          console.log(`🔍 [MOCK-DB] Executando select na tabela: ${tableName}`);
          
          // Simular dados baseados na tabela
          let result = [];
          if (tableName === 'users' || tableName.includes('user')) {
            result = this.users.slice(0, 10);
          } else if (tableName === 'messages' || tableName.includes('message')) {
            result = this.messages.slice(0, 10);
          } else if (tableName === 'classes' || tableName.includes('class')) {
            result = this.classes.slice(0, 10);
          }
          
          console.log(`🔍 [MOCK-DB] Retornando ${result.length} registros da tabela ${tableName}`);
          return Promise.resolve(result);
        }
      };
    };
    
    return createQueryBuilder();
  };

  query = {
    users: {
      findFirst: async (options: any) => {
        console.log('🔍 [MOCK-DB] Buscando usuário:', options);
        console.log('🔍 [MOCK-DB] Total de usuários no banco:', this.users.length);
        console.log('🔍 [MOCK-DB] Usuários disponíveis:', this.users.map(u => ({ id: u.id, email: u.email })));
        const { where } = options;
        
        // Verificar se where é uma função (caso do Drizzle ORM)
        if (typeof where === 'function') {
          const user = this.users.find(where);
          console.log('🔍 [MOCK-DB] Usuário encontrado (função):', user ? 'Sim' : 'Não');
          if (user) {
            console.log('🔍 [MOCK-DB] Dados do usuário encontrado:', { id: user.id, email: user.email });
          }
          return user || null;
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
                console.log('🔍 [MOCK-DB] Comparando com emails disponíveis:', this.users.map(u => u.email));
                const user = this.users.find(user => user.email === email);
                console.log('🔍 [MOCK-DB] Usuário encontrado (SQL):', user ? 'Sim' : 'Não');
                if (user) {
                  console.log('🔍 [MOCK-DB] Dados do usuário encontrado:', { id: user.id, email: user.email });
                } else {
                  console.log('🔍 [MOCK-DB] Motivo: nenhum usuário com email', email, 'encontrado');
                }
                return user || null;
              }
            }
          }
          
          // Se não encontrou email nos chunks, tentar buscar por outros padrões
          console.log('🔍 [MOCK-DB] Nenhum email encontrado nos chunks, tentando busca genérica');
          // Para testes, vamos retornar null se não encontrar email específico
          return null;
        }
        
        // Verificar se where tem email (caso direto)
        if (where && where.email) {
          const user = this.users.find(user => user.email === where.email);
          console.log('🔍 [MOCK-DB] Usuário encontrado (email):', user ? 'Sim' : 'Não');
          if (user) {
            console.log('🔍 [MOCK-DB] Dados do usuário encontrado:', { id: user.id, email: user.email });
          }
          return user || null;
        }
        
        console.log('🔍 [MOCK-DB] Nenhuma condição where compatível encontrada, retornando null');
        return null;
      },
      findMany: async () => this.users,
      clear: () => {
        this.users = [];
        this.nextId = 1;
        console.log('🧹 [MOCK-DB] Banco de dados limpo');
      },
      // Método para adicionar usuário diretamente (para testes)
      addUser: (userData: any) => {
        const newUser = {
          id: `mock-user-${this.nextId++}`,
          ...userData,
          isVerified: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.users.push(newUser);
        console.log('👤 [MOCK-DB] Usuário adicionado diretamente:', newUser);
        return newUser;
      },
    },
  };

  insert = (table: any) => {
    // Se table é uma string, usar diretamente; se é um objeto, extrair o nome
    const tableName = typeof table === 'string' ? table : (table?.name || 'unknown');
    console.log('👤 [MOCK-DB] Inserindo dados na tabela:', tableName);
    return {
      values: (data: any) => {
        console.log('👤 [MOCK-DB] Dados para inserção:', data);
        return {
          returning: async () => {
            // Ajustar nome da tabela para ID (remover 's' do final para singular)
            const idTableName = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName;
            const baseRecord = { 
              id: `mock-${idTableName}-${this.nextId++}`, 
              ...data, 
              createdAt: new Date(), 
              updatedAt: new Date()
            };

            // Adicionar campos específicos baseados na tabela
            if (tableName === 'users' || tableName === 'unknown') {
              const newUser = { ...baseRecord, isVerified: false };
              this.users.push(newUser);
              console.log('✅ [MOCK-DB] Usuário criado:', newUser);
              return [newUser];
            } else if (tableName === 'messages') {
              const newMessage = { 
                ...baseRecord, 
                isRead: false,
                sentAt: new Date()
              };
              this.messages.push(newMessage);
              console.log('✅ [MOCK-DB] Mensagem criada:', newMessage);
              return [newMessage];
            } else if (tableName === 'classes') {
              const newClass = { 
                ...baseRecord,
                status: 'active'
              };
              this.classes.push(newClass);
              console.log('✅ [MOCK-DB] Classe criada:', newClass);
              return [newClass];
            }

            console.log('✅ [MOCK-DB] Registro criado:', baseRecord);
            return [baseRecord];
          },
        };
      },
    };
  };

  update = (table: any) => {
    const tableName = table?.name || 'unknown';
    return {
      set: (data: any) => ({
        where: (condition: any) => ({
          returning: () => {
            console.log('🔄 [MOCK-DB] Atualizando dados na tabela:', tableName);
            console.log('🔄 [MOCK-DB] Dados para atualização:', data);
            
            // Simular atualização baseada na tabela
            let updatedRecords = [];
            
            if (tableName === 'messages') {
              // Simular atualização de mensagens
              const messagesToUpdate = this.messages.filter(msg => !msg.isRead);
              messagesToUpdate.forEach(msg => {
                Object.assign(msg, data, { updatedAt: new Date() });
              });
              updatedRecords = messagesToUpdate;
              console.log(`🔄 [MOCK-DB] ${updatedRecords.length} mensagens atualizadas`);
            } else {
              // Atualização genérica
              const updatedRecord = {
                id: `mock-${tableName}-${this.nextId}`,
                ...data,
                updatedAt: new Date()
              };
              updatedRecords = [updatedRecord];
            }
            
            return updatedRecords;
          }
        }),
      }),
    };
  };

  // Método para adicionar dados de teste
  addTestData() {
    // Adicionar uma classe de teste
    this.classes.push({
      id: 'test-class-id',
      studentId: 'mock-users-1',
      personalId: 'mock-users-2',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('🧪 [MOCK-DB] Dados de teste adicionados');
  }
}

export const mockDb = new MockDatabase();
