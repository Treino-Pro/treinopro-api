require('dotenv').config();
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    console.log('🔧 Running migration: Add CPF to document_type enum...');

    // Read and execute the migration
    const migrationPath = path.join(__dirname, '../drizzle/0006_add_cpf_to_document_type.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await sql.unsafe(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('✅ CPF added to document_type enum');

    // Verify the enum values
    const result = await sql`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = 'document_type'::regtype
      ORDER BY enumsortorder;
    `;

    console.log('📋 Current document_type enum values:', result.map(r => r.enumlabel));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
