import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SearchLocationsDto,
  SearchLocationsResponseDto,
  LocationDto,
  UserFavoriteLocationDto,
} from './dto/locations.dto';
import { locations } from '../../database/schema/locations';
import { eq } from 'drizzle-orm';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly googlePlacesApiKey: string;
  private readonly googlePlacesBaseUrl = 'https://places.googleapis.com/v1';

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly configService: ConfigService,
  ) {
    this.googlePlacesApiKey = this.configService.get<string>(
      'GOOGLE_PLACES_API_KEY',
    );
  }

  async searchLocations(
    searchDto: SearchLocationsDto,
    userId: string,
  ): Promise<SearchLocationsResponseDto> {
    const { query, userLat, userLng, radius, type, limit } = searchDto;

    try {
      // 1. Buscar locais favoritos do usuário primeiro
      const favoriteLocations = await this.getUserFavoriteLocations(
        userId,
        query,
        limit,
      );

      // 2. Buscar na Google Places API
      const googleLocations = await this.searchGooglePlaces(
        query,
        userLat,
        userLng,
        radius,
        type,
        limit,
      );

      // 3. Combinar e ordenar resultados
      const allLocations = [...favoriteLocations, ...googleLocations];

      // 4. Remover duplicatas baseado no endereço
      const uniqueLocations = this.removeDuplicateLocations(allLocations);

      // 5. Ordenar por relevância (favoritos primeiro, depois por distância)
      const sortedLocations = this.sortLocationsByRelevance(
        uniqueLocations,
        userLat,
        userLng,
      );

      // 6. Limitar resultados
      const limitedLocations = sortedLocations.slice(0, limit);

      return {
        locations: limitedLocations,
        total: limitedLocations.length,
        query,
      };
    } catch (error) {
      this.logger.error('Erro ao buscar locais:', error);
      throw new Error('Erro ao buscar locais. Tente novamente.');
    }
  }

  private async getUserFavoriteLocations(
    userId: string,
    query: string,
    limit: number,
  ): Promise<LocationDto[]> {
    try {
      // Por enquanto, retornar array vazio para evitar stack overflow
      // TODO: Implementar busca de favoritos quando necessário
      this.logger.log('Buscando locais favoritos para usuário:', userId);
      return [];
    } catch (error) {
      this.logger.warn('Erro ao buscar locais favoritos:', error);
      return [];
    }
  }

  private async searchGooglePlaces(
    query: string,
    userLat?: number,
    userLng?: number,
    radius?: number,
    type?: string,
    limit?: number,
  ): Promise<LocationDto[]> {
    if (!this.googlePlacesApiKey) {
      this.logger.warn('Google Places API key não configurada');
      return [];
    }

    try {
      // Construir corpo da requisição para a nova API
      const requestBody: any = {
        textQuery: query,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        maxResultCount: limit || 10,
      };

      // Adicionar locationBias apenas se coordenadas estiverem disponíveis
      if (userLat && userLng) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: userLat,
              longitude: userLng,
            },
            radius: radius || 10000,
          },
        };
      }

      // Adicionar includedType apenas se especificado
      if (type) {
        requestBody.includedType = type;
      }

      // Fazer requisição para Google Places API (Nova) usando fetch
      const response = await fetch(
        `${this.googlePlacesBaseUrl}/places:searchText`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.googlePlacesApiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location',
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.places) {
        this.logger.warn('Google Places API não retornou places');
        // Retornar dados mockados quando a API falhar
        return this.getMockLocations(query, userLat, userLng, limit);
      }

      // Processar resultados
      const places = data.places || [];
      const locations: LocationDto[] = [];

      for (const place of places.slice(0, limit)) {
        try {
          const location = await this.processGooglePlace(place);
          if (location) {
            locations.push(location);
          }
        } catch (error) {
          this.logger.warn('Erro ao processar local do Google:', error);
        }
      }

      return locations;
    } catch (error) {
      this.logger.error('Erro na Google Places API:', error);
      // Retornar dados mockados quando a API falhar
      return this.getMockLocations(query, userLat, userLng, limit);
    }
  }

  private getMockLocations(
    query: string,
    userLat?: number,
    userLng?: number,
    limit?: number,
  ): LocationDto[] {
    this.logger.log('Retornando dados mockados para query:', query);

    const mockLocations: LocationDto[] = [
      {
        id: 'smartfit_01',
        name: 'Smart Fit - Shopping Vila Olímpia',
        address: 'R. Olimpíadas, 360 - Vila Olímpia, São Paulo - SP',
        coordinates: {
          lat: -23.5505,
          lng: -46.6333,
        },
        type: 'gym',
        rating: 4.5,
        openingHours: 'Seg-Sex: 6h-23h, Sáb: 8h-20h, Dom: 8h-18h',
        phone: '(11) 3456-7890',
        website: 'https://smartfit.com.br',
        photos: [],
        usageCount: 0,
      },
      {
        id: 'bio_ritmo_01',
        name: 'Bio Ritmo - Moema',
        address: 'Av. Moema, 170 - Moema, São Paulo - SP',
        coordinates: {
          lat: -23.5605,
          lng: -46.6433,
        },
        type: 'gym',
        rating: 4.8,
        openingHours: 'Seg-Sex: 5h30-23h, Sáb: 7h-21h, Dom: 7h-19h',
        phone: '(11) 2345-6789',
        website: 'https://bioritmo.com.br',
        photos: [],
        usageCount: 0,
      },
      {
        id: 'parque_ibirapuera',
        name: 'Parque Ibirapuera',
        address: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP',
        coordinates: {
          lat: -23.5875,
          lng: -46.6575,
        },
        type: 'park',
        rating: 4.2,
        openingHours: 'Todos os dias: 5h-24h',
        phone: null,
        website: null,
        photos: [],
        usageCount: 0,
      },
      {
        id: 'academia_formula',
        name: 'Fórmula Academia',
        address: 'R. Augusta, 2690 - Jardim Paulista, São Paulo - SP',
        coordinates: {
          lat: -23.5705,
          lng: -46.6675,
        },
        type: 'gym',
        rating: 4.6,
        openingHours: 'Seg-Sex: 6h-22h, Sáb: 8h-18h, Dom: 8h-16h',
        phone: '(11) 3456-7890',
        website: 'https://formulaacademia.com.br',
        photos: [],
        usageCount: 0,
      },
      {
        id: 'casa_cliente',
        name: 'Casa do Cliente',
        address: 'Endereço a ser definido pelo cliente',
        coordinates: {
          lat: userLat || -23.5505,
          lng: userLng || -46.6333,
        },
        type: 'home',
        rating: 5.0,
        openingHours: 'Agendamento flexível',
        phone: null,
        website: null,
        photos: [],
        usageCount: 0,
      },
    ];

    // Filtrar por query se fornecida
    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase();
      return mockLocations
        .filter(
          (location) =>
            location.name.toLowerCase().includes(lowerQuery) ||
            location.address.toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit || 10);
    }

    return mockLocations.slice(0, limit || 10);
  }

  private async processGooglePlace(place: any): Promise<LocationDto | null> {
    try {
      const location: LocationDto = {
        id: place.id,
        name: place.displayName?.text || 'Local sem nome',
        address: place.formattedAddress || 'Endereço não disponível',
        coordinates: {
          lat: place.location?.latitude || 0,
          lng: place.location?.longitude || 0,
        },
        type: 'gym',
        rating: place.rating || 0,
        openingHours:
          place.regularOpeningHours?.weekdayDescriptions?.join(', ') || null,
        phone: place.nationalPhoneNumber || null,
        website: place.websiteUri || null,
        photos:
          place.photos?.map(
            (photo: any) =>
              `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=400&key=${this.googlePlacesApiKey}`,
          ) || [],
        usageCount: 0,
      };

      return location;
    } catch (error) {
      this.logger.warn('Erro ao processar local do Google:', error);
      return null;
    }
  }

  private determineLocationType(types: string[]): string {
    if (types.includes('gym') || types.includes('health')) return 'gym';
    if (types.includes('park') || types.includes('recreation_area'))
      return 'park';
    if (types.includes('home') || types.includes('residential')) return 'home';
    return 'other';
  }

  private formatOpeningHours(openingHours: any): string | undefined {
    if (!openingHours?.weekday_text) return undefined;
    return openingHours.weekday_text.join(', ');
  }

  private removeDuplicateLocations(locations: LocationDto[]): LocationDto[] {
    const seen = new Set<string>();
    return locations.filter((location) => {
      const key = `${location.name}-${location.address}`.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private sortLocationsByRelevance(
    locations: LocationDto[],
    userLat?: number,
    userLng?: number,
  ): LocationDto[] {
    return locations.sort((a, b) => {
      // 1. Favoritos primeiro (baseado no usageCount)
      if (a.usageCount && !b.usageCount) return -1;
      if (!a.usageCount && b.usageCount) return 1;
      if (a.usageCount && b.usageCount) return b.usageCount - a.usageCount;

      // 2. Por distância se coordenadas do usuário disponíveis
      if (userLat && userLng) {
        const distanceA = this.calculateDistance(
          userLat,
          userLng,
          a.coordinates.lat,
          a.coordinates.lng,
        );
        const distanceB = this.calculateDistance(
          userLat,
          userLng,
          b.coordinates.lat,
          b.coordinates.lng,
        );
        return distanceA - distanceB;
      }

      // 3. Por rating
      if (a.rating && b.rating) return b.rating - a.rating;

      return 0;
    });
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371e3; // Raio da Terra em metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distância em metros
  }

  private mapToLocationDto(location: any): LocationDto {
    return {
      id: location.id,
      name: location.name,
      address: location.address,
      coordinates: {
        lat: location.lat || location.latitude,
        lng: location.lng || location.longitude,
      },
      type: location.type || 'gym',
      rating: location.rating || 0,
      openingHours: location.openingHours || location.opening_hours,
      phone: location.phone,
      website: location.website,
      photos: location.photos || [],
      distance: location.distance,
      usageCount: location.usageCount || 0,
    };
  }

  async addToFavorites(
    userId: string,
    locationId: string,
    customName?: string,
  ): Promise<void> {
    try {
      // Verificar se já existe
      const existing = await this.db
        .select()
        .from('user_favorite_locations')
        .where('user_id = ? AND location_id = ?', [userId, locationId])
        .limit(1);

      if (existing.length > 0) {
        // Atualizar contador de uso
        await this.db
          .update('user_favorite_locations')
          .set({
            usage_count: existing[0].usage_count + 1,
            last_used_at: new Date(),
            custom_name: customName || existing[0].custom_name,
          })
          .where('user_id = ? AND location_id = ?', [userId, locationId]);
      } else {
        // Criar novo favorito
        await this.db.insert('user_favorite_locations').values({
          user_id: userId,
          location_id: locationId,
          custom_name: customName,
          usage_count: 1,
          last_used_at: new Date(),
          created_at: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Erro ao adicionar aos favoritos:', error);
      throw new Error('Erro ao adicionar local aos favoritos');
    }
  }

  async getUserFavorites(userId: string): Promise<UserFavoriteLocationDto[]> {
    try {
      const favorites = await this.db
        .select({
          id: 'user_favorite_locations.id',
          userId: 'user_favorite_locations.user_id',
          locationId: 'user_favorite_locations.location_id',
          customName: 'user_favorite_locations.custom_name',
          usageCount: 'user_favorite_locations.usage_count',
          lastUsedAt: 'user_favorite_locations.last_used_at',
          createdAt: 'user_favorite_locations.created_at',
          location: {
            id: 'locations.id',
            name: 'locations.name',
            address: 'locations.address',
            lat: 'locations.lat',
            lng: 'locations.lng',
            type: 'locations.type',
            rating: 'locations.rating',
            openingHours: 'locations.opening_hours',
            phone: 'locations.phone',
            website: 'locations.website',
            photos: 'locations.photos',
          },
        })
        .from('user_favorite_locations')
        .innerJoin(
          'locations',
          'user_favorite_locations.location_id',
          'locations.id',
        )
        .where('user_favorite_locations.user_id = ?', [userId])
        .orderBy('user_favorite_locations.usage_count', 'desc');

      return favorites.map((fav) => ({
        id: fav.id,
        userId: fav.userId,
        locationId: fav.locationId,
        customName: fav.customName,
        usageCount: fav.usageCount,
        lastUsedAt: fav.lastUsedAt,
        createdAt: fav.createdAt,
        location: this.mapToLocationDto(fav.location),
      }));
    } catch (error) {
      this.logger.error('Erro ao buscar favoritos:', error);
      return [];
    }
  }

  /**
   * Buscar coordenadas de um endereço usando Google Places API (Text Search)
   * Usa a mesma API que já está habilitada para busca de lugares
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.googlePlacesApiKey) {
      this.logger.warn('Google Places API key não configurada para geocoding');
      return null;
    }

    try {
      // Usar Google Places API (Text Search) - mesma API já habilitada
      const requestBody = {
        textQuery: address,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        maxResultCount: 1,
      };

      const response = await fetch(
        `${this.googlePlacesBaseUrl}/places:searchText`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.googlePlacesApiKey,
            'X-Goog-FieldMask': 'places.location',
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.places && data.places.length > 0) {
        const place = data.places[0];
        if (place.location) {
          return {
            lat: place.location.latitude,
            lng: place.location.longitude,
          };
        }
      }

      this.logger.warn(`Geocoding falhou para endereço: ${address}. Nenhum resultado encontrado.`);
      return null;
    } catch (error) {
      this.logger.error(`Erro ao fazer geocoding do endereço ${address}:`, error);
      return null;
    }
  }

  /**
   * Criar ou atualizar local na tabela locations
   */
  async createOrUpdateLocation(
    locationName: string,
    locationAddress: string,
    lat?: number,
    lng?: number,
  ): Promise<string | null> {
    try {
      // Se não tem coordenadas, tentar geocoding
      if (!lat || !lng) {
        const coords = await this.geocodeAddress(locationAddress);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        } else {
          this.logger.warn(
            `Não foi possível obter coordenadas para: ${locationAddress}`,
          );
          return null;
        }
      }

      // Verificar se local já existe (por endereço)
      const existingLocations = await this.db
        .select()
        .from(locations)
        .where(eq(locations.address, locationAddress))
        .limit(1);

      const existingLocation = existingLocations[0];

      if (existingLocation) {
        // Atualizar coordenadas se necessário
        const existingLat = parseFloat(String(existingLocation.lat));
        const existingLng = parseFloat(String(existingLocation.lng));
        
        if (existingLat !== lat || existingLng !== lng) {
          await this.db
            .update(locations)
            .set({
              lat: lat.toString(),
              lng: lng.toString(),
              name: locationName,
              updatedAt: new Date(),
            })
            .where(eq(locations.id, existingLocation.id));
        }
        this.logger.log(`Local atualizado: ${existingLocation.id} - ${locationName}`);
        return existingLocation.id;
      }

      // Criar novo local
      const [newLocation] = await this.db
        .insert(locations)
        .values({
          name: locationName,
          address: locationAddress,
          lat: lat.toString(),
          lng: lng.toString(),
          type: 'other',
        })
        .returning();

      this.logger.log(`Local criado: ${newLocation.id} - ${locationName}`);
      return newLocation.id;
    } catch (error) {
      this.logger.error('Erro ao criar/atualizar local:', error);
      return null;
    }
  }
}
