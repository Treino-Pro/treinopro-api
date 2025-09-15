import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SearchLocationsDto, SearchLocationsResponseDto, LocationDto, UserFavoriteLocationDto } from './dto/locations.dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly googlePlacesApiKey: string;
  private readonly googlePlacesBaseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly configService: ConfigService,
  ) {
    this.googlePlacesApiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
  }

  async searchLocations(searchDto: SearchLocationsDto, userId: string): Promise<SearchLocationsResponseDto> {
    const { query, userLat, userLng, radius, type, limit } = searchDto;

    try {
      // 1. Buscar locais favoritos do usuário primeiro
      const favoriteLocations = await this.getUserFavoriteLocations(userId, query, limit);
      
      // 2. Buscar na Google Places API
      const googleLocations = await this.searchGooglePlaces(query, userLat, userLng, radius, type, limit);
      
      // 3. Combinar e ordenar resultados
      const allLocations = [...favoriteLocations, ...googleLocations];
      
      // 4. Remover duplicatas baseado no endereço
      const uniqueLocations = this.removeDuplicateLocations(allLocations);
      
      // 5. Ordenar por relevância (favoritos primeiro, depois por distância)
      const sortedLocations = this.sortLocationsByRelevance(uniqueLocations, userLat, userLng);
      
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

  private async getUserFavoriteLocations(userId: string, query: string, limit: number): Promise<LocationDto[]> {
    try {
      // Buscar locais favoritos do usuário que correspondem à query
      const favoriteLocations = await this.db
        .select({
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
          usageCount: 'user_favorite_locations.usage_count',
          lastUsedAt: 'user_favorite_locations.last_used_at',
        })
        .from('user_favorite_locations')
        .innerJoin('locations', 'user_favorite_locations.location_id', 'locations.id')
        .where(
          'user_favorite_locations.user_id = ? AND (locations.name ILIKE ? OR locations.address ILIKE ?)',
          [userId, `%${query}%`, `%${query}%`]
        )
        .orderBy('user_favorite_locations.usage_count', 'desc')
        .limit(limit);

      return favoriteLocations.map(loc => this.mapToLocationDto(loc));
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
    limit?: number
  ): Promise<LocationDto[]> {
    if (!this.googlePlacesApiKey) {
      this.logger.warn('Google Places API key não configurada');
      return [];
    }

    try {
      // Construir parâmetros da API
      const params = new URLSearchParams({
        key: this.googlePlacesApiKey,
        input: query,
        inputtype: 'textquery',
        fields: 'place_id,name,formatted_address,geometry,rating,opening_hours,formatted_phone_number,website,photos',
        language: 'pt-BR',
        region: 'br',
      });

      // Adicionar localização do usuário se disponível
      if (userLat && userLng) {
        params.append('location', `${userLat},${userLng}`);
        params.append('radius', radius?.toString() || '10000');
      }

      // Fazer requisição para Google Places API
      const response = await axios.get(
        `${this.googlePlacesBaseUrl}/findplacefromtext/json?${params}`,
        { timeout: 5000 }
      );

      if (response.data.status !== 'OK') {
        this.logger.warn('Google Places API retornou status:', response.data.status);
        return [];
      }

      // Processar resultados
      const places = response.data.candidates || [];
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
      return [];
    }
  }

  private async processGooglePlace(place: any): Promise<LocationDto | null> {
    try {
      // Obter detalhes adicionais do local
      const detailsResponse = await axios.get(
        `${this.googlePlacesBaseUrl}/details/json`,
        {
          params: {
            key: this.googlePlacesApiKey,
            place_id: place.place_id,
            fields: 'name,formatted_address,geometry,rating,opening_hours,formatted_phone_number,website,photos,types',
            language: 'pt-BR',
          },
          timeout: 5000,
        }
      );

      if (detailsResponse.data.status !== 'OK') {
        return null;
      }

      const details = detailsResponse.data.result;
      const geometry = details.geometry?.location;

      if (!geometry) {
        return null;
      }

      // Determinar tipo do local baseado nos tipos do Google
      const placeType = this.determineLocationType(details.types);

      return {
        id: place.place_id,
        name: details.name,
        address: details.formatted_address,
        coordinates: {
          lat: geometry.lat,
          lng: geometry.lng,
        },
        type: placeType,
        rating: details.rating,
        openingHours: this.formatOpeningHours(details.opening_hours),
        phone: details.formatted_phone_number,
        website: details.website,
        photos: details.photos?.map((photo: any) => 
          `${this.googlePlacesBaseUrl}/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${this.googlePlacesApiKey}`
        ) || [],
      };
    } catch (error) {
      this.logger.warn('Erro ao processar detalhes do local:', error);
      return null;
    }
  }

  private determineLocationType(types: string[]): string {
    if (types.includes('gym') || types.includes('health')) return 'gym';
    if (types.includes('park') || types.includes('recreation_area')) return 'park';
    if (types.includes('home') || types.includes('residential')) return 'home';
    return 'other';
  }

  private formatOpeningHours(openingHours: any): string | undefined {
    if (!openingHours?.weekday_text) return undefined;
    return openingHours.weekday_text.join(', ');
  }

  private removeDuplicateLocations(locations: LocationDto[]): LocationDto[] {
    const seen = new Set<string>();
    return locations.filter(location => {
      const key = `${location.name}-${location.address}`.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private sortLocationsByRelevance(locations: LocationDto[], userLat?: number, userLng?: number): LocationDto[] {
    return locations.sort((a, b) => {
      // 1. Favoritos primeiro (baseado no usageCount)
      if (a.usageCount && !b.usageCount) return -1;
      if (!a.usageCount && b.usageCount) return 1;
      if (a.usageCount && b.usageCount) return b.usageCount - a.usageCount;

      // 2. Por distância se coordenadas do usuário disponíveis
      if (userLat && userLng) {
        const distanceA = this.calculateDistance(userLat, userLng, a.coordinates.lat, a.coordinates.lng);
        const distanceB = this.calculateDistance(userLat, userLng, b.coordinates.lat, b.coordinates.lng);
        return distanceA - distanceB;
      }

      // 3. Por rating
      if (a.rating && b.rating) return b.rating - a.rating;

      return 0;
    });
  }

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

  private mapToLocationDto(location: any): LocationDto {
    return {
      id: location.id,
      name: location.name,
      address: location.address,
      coordinates: {
        lat: location.lat,
        lng: location.lng,
      },
      type: location.type,
      rating: location.rating,
      openingHours: location.openingHours,
      phone: location.phone,
      website: location.website,
      photos: location.photos || [],
      distance: location.distance,
      usageCount: location.usageCount,
    };
  }

  async addToFavorites(userId: string, locationId: string, customName?: string): Promise<void> {
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
        await this.db
          .insert('user_favorite_locations')
          .values({
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
        .innerJoin('locations', 'user_favorite_locations.location_id', 'locations.id')
        .where('user_favorite_locations.user_id = ?', [userId])
        .orderBy('user_favorite_locations.usage_count', 'desc');

      return favorites.map(fav => ({
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
}
