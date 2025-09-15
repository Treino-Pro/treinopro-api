# 🗺️ Módulo de Locais - TreinoPRO API

## ✅ Status da Implementação

O módulo de locais foi **completamente implementado** com sistema de busca inteligente similar ao Uber, integração com Google Places API e sistema de favoritos!

## 🚀 **Funcionalidades Implementadas**

### **🔍 Sistema de Busca Inteligente**

#### **1. Busca com Sugestões em Tempo Real**
```http
GET /locations/search?query=academia paulista&userLat=-23.5505&userLng=-46.6333&radius=5000&type=gym&limit=10
Authorization: Bearer <jwt_token>
```

**Características:**
- ✅ **Busca Híbrida**: Combina locais favoritos + Google Places API
- ✅ **Sugestões Inteligentes**: Locais mais usados aparecem primeiro
- ✅ **Filtros Avançados**: Por tipo, distância, rating
- ✅ **Geolocalização**: Ordenação por proximidade do usuário
- ✅ **Debounce**: Otimização para evitar muitas requisições

#### **2. Sistema de Favoritos**
```http
POST /locations/favorites
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "locationId": "123e4567-e89b-12d3-a456-426614174000",
  "customName": "Minha Academia Favorita"
}
```

**Características:**
- ✅ **Histórico de Uso**: Conta quantas vezes o local foi usado
- ✅ **Nomes Personalizados**: Usuário pode dar nomes customizados
- ✅ **Ordenação Inteligente**: Locais mais usados aparecem primeiro
- ✅ **Persistência**: Dados salvos no banco de dados

### **📱 Integração com Frontend Flutter**

#### **Fluxo de Busca no Frontend:**
1. **Usuário digita** no campo de busca
2. **Debounce de 300ms** para otimizar requisições
3. **API retorna sugestões** ordenadas por relevância
4. **Usuário seleciona** um local
5. **Local é salvo** como favorito automaticamente
6. **Próxima busca** mostra favoritos primeiro

#### **Exemplo de Implementação Flutter:**
```dart
class LocationSearchController {
  Timer? _debounceTimer;
  final Duration _debounceDelay = Duration(milliseconds: 300);
  
  void onSearchChanged(String query) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_debounceDelay, () {
      _searchLocations(query);
    });
  }
  
  Future<void> _searchLocations(String query) async {
    final response = await _apiClient.get('/locations/search', {
      'query': query,
      'userLat': _currentLocation?.latitude,
      'userLng': _currentLocation?.longitude,
      'radius': 5000,
      'type': 'gym',
      'limit': 10,
    });
    
    _updateSuggestions(response.data['locations']);
  }
}
```

## 🏗️ **Arquitetura Implementada**

### **Estrutura de Arquivos**
```
src/modules/locations/
├── dto/
│   └── locations.dto.ts          # DTOs de validação
├── locations.controller.ts       # Controller REST
├── locations.service.ts          # Lógica de negócio + Google Places
├── locations.module.ts           # Módulo Nest.js
└── README.md                     # Documentação
```

### **Database Schema**
```sql
-- Tabela de locais
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  type VARCHAR(50) DEFAULT 'other',
  rating DECIMAL(3,2),
  opening_hours TEXT,
  phone VARCHAR(20),
  website TEXT,
  photos JSON,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de favoritos do usuário
CREATE TABLE user_favorite_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  location_id UUID NOT NULL,
  custom_name VARCHAR(255),
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔧 **Configuração do Google Places API**

### **1. Obter API Key**
1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione existente
3. Ative a **Places API**
4. Crie uma **API Key**
5. Configure restrições de uso (recomendado)

### **2. Configurar Variáveis de Ambiente**
```bash
# Adicionar ao arquivo .env
GOOGLE_PLACES_API_KEY=your-google-places-api-key-here
```

### **3. Configurar Restrições (Opcional)**
- **Application restrictions**: HTTP referrers
- **API restrictions**: Places API apenas
- **Quotas**: Configurar limites de uso

## 📊 **Algoritmo de Ordenação**

### **1. Prioridade dos Resultados**
1. **Locais Favoritos** (ordenados por usage_count)
2. **Distância** (se coordenadas do usuário disponíveis)
3. **Rating** (avaliação do Google Places)
4. **Relevância** (correspondência com query)

### **2. Cálculo de Distância**
```typescript
// Fórmula de Haversine para calcular distância
private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distância em metros
}
```

## 🎯 **Endpoints Disponíveis**

### **1. Buscar Locais**
```http
GET /locations/search
Query Parameters:
- query: string (obrigatório)
- userLat: number (opcional)
- userLng: number (opcional)
- radius: number (opcional, padrão: 10000)
- type: string (opcional)
- limit: number (opcional, padrão: 10)
```

### **2. Adicionar aos Favoritos**
```http
POST /locations/favorites
Body: { locationId: string, customName?: string }
```

### **3. Listar Favoritos**
```http
GET /locations/favorites
```

### **4. Verificar se é Favorito**
```http
GET /locations/favorites/{locationId}
```

## 📱 **Exemplo de Resposta da API**

```json
{
  "locations": [
    {
      "id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
      "name": "Academia Smart Fit - Shopping Iguatemi",
      "address": "Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100",
      "coordinates": {
        "lat": -23.5505,
        "lng": -46.6333
      },
      "type": "gym",
      "rating": 4.5,
      "openingHours": "Seg-Sex: 6h-22h, Sáb: 8h-20h, Dom: 8h-18h",
      "phone": "(11) 99999-9999",
      "website": "https://www.smartfit.com.br",
      "photos": [
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=...&key=..."
      ],
      "distance": 1500,
      "usageCount": 5
    }
  ],
  "total": 1,
  "query": "academia paulista"
}
```

## 🧪 **Como Testar**

### **1. Usando Swagger UI**
1. Acesse `http://localhost:3000/api/docs`
2. Faça login para obter o token JWT
3. Use o botão "Authorize" para inserir o token
4. Teste o endpoint `/locations/search`

### **2. Usando cURL**
```bash
# Buscar locais
curl -X GET "http://localhost:3000/locations/search?query=academia%20paulista&userLat=-23.5505&userLng=-46.6333" \
  -H "Authorization: Bearer <jwt_token>"

# Adicionar aos favoritos
curl -X POST http://localhost:3000/locations/favorites \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"locationId": "ChIJN1t_tDeuEmsRUsoyG83frY4", "customName": "Minha Academia"}'
```

## 🔮 **Próximos Passos**

### **Melhorias Futuras**
- [ ] **Cache Redis**: Cache de resultados de busca
- [ ] **Geolocalização Automática**: Detectar localização do usuário
- [ ] **Sugestões Personalizadas**: ML para sugerir locais
- [ ] **Histórico de Buscas**: Salvar buscas anteriores
- [ ] **Avaliações**: Sistema de avaliações dos locais

### **Integrações**
- [ ] **Mapas**: Integração com mapas no frontend
- [ ] **Navegação**: Integração com apps de navegação
- [ ] **Calendário**: Verificar horários de funcionamento
- [ ] **Reservas**: Sistema de reservas de espaços

---

**🎉 Sistema de Busca de Locais Implementado com Sucesso!**

O sistema está totalmente funcional e pronto para ser integrado com o frontend Flutter. A busca funciona de forma inteligente, priorizando locais favoritos e oferecendo sugestões relevantes baseadas na localização do usuário! 🚀✨
