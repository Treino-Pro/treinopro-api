const { MockDatabase } = require('./src/database/mock-db.ts');

// Simular o problema
const mockDb = new MockDatabase();

// Simular registro
console.log('=== SIMULANDO REGISTRO ===');
const registerData = {
  email: 'test@example.com',
  passwordHash: '$2a$12$hash',
  firstName: 'Test',
  lastName: 'User',
  userType: 'student'
};

mockDb.insert({ name: 'users' })
  .values(registerData)
  .returning()
  .then(result => {
    console.log('Usuário registrado:', result[0]);
    
    // Simular login
    console.log('\n=== SIMULANDO LOGIN ===');
    
    // Simular busca como o Drizzle faz
    const whereCondition = {
      queryChunks: [
        { constructor: { name: 'StringChunk' } },
        { constructor: { name: 'PgVarchar' } },
        { constructor: { name: 'StringChunk' } },
        { constructor: { name: 'Param' }, value: 'test@example.com' },
        { constructor: { name: 'StringChunk' } }
      ]
    };
    
    return mockDb.query.users.findFirst({ where: whereCondition });
  })
  .then(user => {
    console.log('Usuário encontrado no login:', user);
  })
  .catch(error => {
    console.error('Erro:', error);
  });
