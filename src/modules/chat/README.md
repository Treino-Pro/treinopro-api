# Chat Module

Módulo completo de chat em tempo real para comunicação entre alunos e personal trainers.

## Funcionalidades

### 🔌 WebSocket (Tempo Real)
- **Conexão autenticada** via JWT
- **Salas por classe** para organização
- **Mensagens instantâneas** entre usuários
- **Indicadores de digitação** (typing indicators)
- **Status online/offline** dos usuários
- **Notificações em tempo real** de propostas e aulas

### 📡 APIs REST
- **Enviar mensagens** com validação completa
- **Listar mensagens** com paginação
- **Marcar como lida** (individual e em lote)
- **Estatísticas do chat** (total, não lidas, conversas)
- **Listar conversas** com última mensagem e contadores

## Estrutura do Módulo

```
chat/
├── dto/
│   └── chat.dto.ts          # DTOs para validação e documentação
├── chat.controller.ts       # Controller REST
├── chat.gateway.ts         # WebSocket Gateway
├── chat.service.ts         # Lógica de negócio
├── chat.module.ts          # Configuração do módulo
└── README.md              # Esta documentação
```

## Endpoints REST

### Mensagens
- `POST /chat/messages` - Enviar mensagem
- `GET /chat/messages?classId=xxx` - Listar mensagens
- `PUT /chat/messages/:id/read` - Marcar como lida
- `PUT /chat/classes/:id/read-all` - Marcar todas como lidas

### Estatísticas e Conversas
- `GET /chat/stats` - Estatísticas do chat
- `GET /chat/conversations` - Listar conversas
- `GET /chat/classes/:id/messages` - Mensagens de uma classe

## Eventos WebSocket

### Conexão
- **Namespace**: `/chat`
- **Autenticação**: JWT via header, query param ou auth object

### Eventos do Cliente
- `send_message` - Enviar mensagem
- `join_class` - Entrar na sala da classe
- `leave_class` - Sair da sala da classe
- `typing_start` - Começar a digitar
- `typing_stop` - Parar de digitar
- `mark_as_read` - Marcar mensagem como lida

### Eventos do Servidor
- `message_sent` - Mensagem enviada com sucesso
- `message_received` - Nova mensagem recebida
- `new_message` - Nova mensagem na sala da classe
- `message_read` - Mensagem marcada como lida
- `typing_start` - Usuário começou a digitar
- `typing_stop` - Usuário parou de digitar
- `user_online` - Usuário conectado
- `user_offline` - Usuário desconectado
- `joined_class` - Entrou na sala da classe
- `left_class` - Saiu da sala da classe
- `proposal_update` - Atualização de proposta
- `class_update` - Atualização de aula

## Exemplo de Uso

### Cliente WebSocket (JavaScript)
```javascript
import io from 'socket.io-client';

// Conectar ao chat
const socket = io('http://localhost:3000/chat', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Entrar na sala da classe
socket.emit('join_class', { classId: 'class-uuid' });

// Enviar mensagem
socket.emit('send_message', {
  classId: 'class-uuid',
  receiverId: 'user-uuid',
  messageText: 'Olá! Como está?'
});

// Escutar mensagens
socket.on('message_received', (data) => {
  console.log('Nova mensagem:', data);
});

// Indicador de digitação
socket.emit('typing_start', {
  classId: 'class-uuid',
  receiverId: 'user-uuid'
});
```

### Cliente REST (JavaScript)
```javascript
// Enviar mensagem
const response = await fetch('/chat/messages', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    classId: 'class-uuid',
    receiverId: 'user-uuid',
    messageText: 'Olá! Como está?'
  })
});

// Listar mensagens
const messages = await fetch('/chat/messages?classId=class-uuid&page=1&limit=50', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

## Validações e Segurança

### Validação de Acesso
- ✅ Usuário deve estar autenticado
- ✅ Usuário deve ter acesso à classe (aluno ou personal)
- ✅ Destinatário deve ser o outro participante da classe
- ✅ Mensagens limitadas a 1000 caracteres

### Validação de Dados
- ✅ DTOs com validação completa
- ✅ Sanitização de entrada
- ✅ Validação de UUIDs
- ✅ Limites de paginação

### Performance
- ✅ Paginação para listas grandes
- ✅ Índices de banco otimizados
- ✅ Conexões WebSocket gerenciadas
- ✅ Cache de usuários conectados

## Integração com Outros Módulos

### Propostas
- Notificações automáticas de aceite/rejeição
- Criação automática de salas de chat

### Classes
- Notificações de início/fim de aula
- Status updates em tempo real

### Usuários
- Validação de permissões
- Dados de perfil nas mensagens

## Configuração

### Variáveis de Ambiente
```env
# JWT (já configurado no AuthModule)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h

# CORS (configurado no gateway)
FRONTEND_URL=http://localhost:3000
```

### Dependências
- `@nestjs/websockets` - WebSocket support
- `@nestjs/platform-socket.io` - Socket.io integration
- `socket.io` - WebSocket library
- `@nestjs/jwt` - JWT authentication

## Testes

### Testes Unitários
```bash
# Executar testes do módulo
npm run test chat

# Executar com coverage
npm run test:cov chat
```

### Testes de Integração
```bash
# Testar APIs REST
npm run test:integration chat

# Testar WebSocket
npm run test:integration chat.gateway
```

## Monitoramento

### Logs
- Conexões/desconexões de usuários
- Mensagens enviadas/recebidas
- Erros de validação e autenticação

### Métricas
- Usuários conectados
- Mensagens por minuto
- Taxa de erro
- Latência média

## Próximos Passos

1. **Implementar notificações push** para mensagens offline
2. **Adicionar suporte a mídia** (imagens, áudios)
3. **Implementar busca de mensagens** com filtros
4. **Adicionar reações** (emoji reactions)
5. **Implementar mensagens temporárias** (auto-delete)
6. **Adicionar moderação** de conteúdo
7. **Implementar backup** de mensagens
8. **Adicionar analytics** de uso do chat
