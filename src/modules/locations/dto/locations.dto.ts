import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsLatitude, IsLongitude } from 'class-validator';
import { Type } from 'class-transformer';

export class LocationCoordinatesDto {
  @ApiProperty({
    description: 'Latitude do local',
    example: -23.5505,
  })
  @IsLatitude()
  lat: number;

  @ApiProperty({
    description: 'Longitude do local',
    example: -46.6333,
  })
  @IsLongitude()
  lng: number;
}

export class LocationDto {
  @ApiProperty({
    description: 'ID único do local',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Nome do local',
    example: 'Academia Smart Fit - Shopping Iguatemi',
  })
  name: string;

  @ApiProperty({
    description: 'Endereço completo do local',
    example: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100',
  })
  address: string;

  @ApiProperty({
    description: 'Coordenadas geográficas do local',
    type: LocationCoordinatesDto,
  })
  @ValidateNested()
  @Type(() => LocationCoordinatesDto)
  coordinates: LocationCoordinatesDto;

  @ApiProperty({
    description: 'Tipo do local',
    example: 'gym',
    enum: ['gym', 'park', 'home', 'other'],
  })
  type: string;

  @ApiProperty({
    description: 'Distância em metros do usuário',
    example: 1500,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  distance?: number;

  @ApiProperty({
    description: 'Avaliação do local (0-5)',
    example: 4.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  rating?: number;

  @ApiProperty({
    description: 'Horário de funcionamento',
    example: 'Seg-Sex: 6h-22h, Sáb: 8h-20h, Dom: 8h-18h',
    required: false,
  })
  @IsOptional()
  @IsString()
  openingHours?: string;

  @ApiProperty({
    description: 'Telefone do local',
    example: '(11) 99999-9999',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Website do local',
    example: 'https://www.smartfit.com.br',
    required: false,
  })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({
    description: 'Fotos do local',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiProperty({
    description: 'Número de vezes que o local foi usado pelo usuário',
    example: 5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  usageCount?: number;
}

export class SearchLocationsDto {
  @ApiProperty({
    description: 'Termo de busca',
    example: 'academia paulista',
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'Latitude do usuário para cálculo de distância',
    example: -23.5505,
    required: false,
  })
  @IsOptional()
  @IsLatitude()
  userLat?: number;

  @ApiProperty({
    description: 'Longitude do usuário para cálculo de distância',
    example: -46.6333,
    required: false,
  })
  @IsOptional()
  @IsLongitude()
  userLng?: number;

  @ApiProperty({
    description: 'Raio de busca em metros',
    example: 5000,
    required: false,
    default: 10000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radius?: number = 10000;

  @ApiProperty({
    description: 'Tipo de local para filtrar',
    example: 'gym',
    enum: ['gym', 'park', 'home', 'other'],
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({
    description: 'Limite de resultados',
    example: 10,
    required: false,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}

export class SearchLocationsResponseDto {
  @ApiProperty({
    description: 'Lista de locais encontrados',
    type: [LocationDto],
  })
  locations: LocationDto[];

  @ApiProperty({
    description: 'Total de locais encontrados',
    example: 15,
  })
  total: number;

  @ApiProperty({
    description: 'Termo de busca utilizado',
    example: 'academia paulista',
  })
  query: string;
}

export class UserFavoriteLocationDto {
  @ApiProperty({
    description: 'ID do local favorito',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'ID do usuário',
    example: '456e7890-e89b-12d3-a456-426614174000',
  })
  userId: string;

  @ApiProperty({
    description: 'ID do local',
    example: '789e0123-e89b-12d3-a456-426614174000',
  })
  locationId: string;

  @ApiProperty({
    description: 'Nome personalizado do local pelo usuário',
    example: 'Minha Academia Favorita',
    required: false,
  })
  @IsOptional()
  @IsString()
  customName?: string;

  @ApiProperty({
    description: 'Número de vezes que o local foi usado',
    example: 5,
  })
  usageCount: number;

  @ApiProperty({
    description: 'Data da última utilização',
    example: '2024-01-10T10:00:00.000Z',
  })
  lastUsedAt: Date;

  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-01T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Informações do local',
    type: LocationDto,
  })
  location: LocationDto;
}
