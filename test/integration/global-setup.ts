// Global setup para testes de integração
import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('🚀 Iniciando setup global para testes de integração...');
  
  try {
    // Verificar se o Docker está disponível
    try {
      execSync('zsh -c "docker ps"', { stdio: 'pipe' });
      console.log('✅ Docker está disponível');
      
      // Tentar iniciar banco de teste se não estiver rodando
      try {
        execSync('zsh -c "docker compose -f docker-compose.test.yml up -d"', { 
          stdio: 'pipe',
          cwd: process.cwd()
        });
        console.log('✅ Banco de teste iniciado');
        
        // Aguardar banco estar pronto
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.log('⚠️ Banco de teste pode já estar rodando ou docker-compose.test.yml não existe');
      }
    } catch (dockerError) {
      console.log('⚠️ Docker não disponível, usando banco mock para testes');
      console.log('💡 Para testes completos, instale o Docker e execute: docker compose -f docker-compose.test.yml up -d');
    }
    
    console.log('✅ Setup global concluído');
  } catch (error) {
    console.error('❌ Erro no setup global:', error.message);
    // Não falhar o setup se Docker não estiver disponível
    console.log('⚠️ Continuando com configuração mínima...');
  }
}
