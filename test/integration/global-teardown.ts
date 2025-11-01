// Global teardown para testes de integração
import { execSync } from 'child_process';

export default async function globalTeardown() {
  console.log('🧹 Iniciando teardown global para testes de integração...');

  try {
    // Parar containers de teste
    try {
      execSync('zsh -c "docker compose -f docker-compose.test.yml down"', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });
      console.log('✅ Containers de teste parados');
    } catch (error) {
      console.log('⚠️ Erro ao parar containers de teste:', error.message);
    }

    console.log('✅ Teardown global concluído');
  } catch (error) {
    console.error('❌ Erro no teardown global:', error.message);
  }
}
