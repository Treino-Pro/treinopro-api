import { eq } from 'drizzle-orm';
import { db } from './connection';
import { users } from './schema/users';
import * as bcrypt from 'bcryptjs';

export async function seedAdmin() {
  if (!db) {
    console.log('⚠️ [DATABASE] Conexão com o banco de dados não disponível. Pulando seed de admin.');
    return;
  }

  const adminEmail = 'adminpatrickdev@admin.com';
  const adminPassword = 'adminpatrickdev';

  try {
    // 1. Verificar se o admin já existe
    const existingAdmin = await db.query.users.findFirst({
      where: eq(users.email, adminEmail),
    });

    if (existingAdmin) {
      console.log('ℹ️ [DATABASE] Admin padrão já existe. Pulando criação.');
      return;
    }

    console.log('👤 [DATABASE] Criando admin padrão...');

    // 2. Hash da senha
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    // 3. Inserir admin
    await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      userType: 'admin',
      firstName: 'Admin',
      lastName: 'Patrick Dev',
      birthDate: new Date('1990-01-01'),
      documentType: 'CPF',
      documentNumber: '00000000000',
      termsAccepted: true,
      privacyPolicyAccepted: true,
      termsAcceptedDate: new Date(),
      status: 'active',
      approvalStatus: 'approved',
    });

    console.log('✅ [DATABASE] Admin padrão criado com sucesso!');
  } catch (error) {
    console.error('❌ [DATABASE] Erro ao criar admin padrão:', error);
  }
}
