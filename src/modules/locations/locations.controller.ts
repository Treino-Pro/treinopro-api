import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  UseGuards, 
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Param,
  Logger
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiQuery
} from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { 
  SearchLocationsDto, 
  SearchLocationsResponseDto, 
  UserFavoriteLocationDto 
} from './dto/locations.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Locations')
@Controller('locations')
export class LocationsController {
  private readonly logger = new Logger(LocationsController.name);

  constructor(private readonly locationsService: LocationsService) {}

  @Get('search')
  @ApiOperation({ 
    summary: 'Buscar locais',
    description: 'Busca locais com sugestões inteligentes similar ao Uber. Combina locais favoritos do usuário com resultados da Google Places API.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de locais encontrados com sucesso',
    type: SearchLocationsResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parâmetros de busca inválidos'
  })
  @ApiQuery({ name: 'query', description: 'Termo de busca', example: 'academia paulista' })
  @ApiQuery({ name: 'userLat', required: false, description: 'Latitude do usuário', example: -23.5505 })
  @ApiQuery({ name: 'userLng', required: false, description: 'Longitude do usuário', example: -46.6333 })
  @ApiQuery({ name: 'radius', required: false, description: 'Raio de busca em metros', example: 5000 })
  @ApiQuery({ name: 'type', required: false, description: 'Tipo de local', example: 'gym' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limite de resultados', example: 10 })
  @UseGuards(JwtAuthGuard)
  async searchLocations(
    @Query() searchDto: SearchLocationsDto,
    @Request() req: any
  ): Promise<SearchLocationsResponseDto> {
    return this.locationsService.searchLocations(searchDto, req.user.sub);
  }

  @Get('test-search')
  @ApiOperation({ 
    summary: 'Testar busca de locais (público)',
    description: 'Endpoint público para testar a integração com Google Places API'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de locais encontrados com sucesso',
    type: SearchLocationsResponseDto
  })
  @ApiQuery({ name: 'query', description: 'Termo de busca', example: 'academia paulista' })
  @ApiQuery({ name: 'userLat', required: false, description: 'Latitude do usuário', example: -23.5505 })
  @ApiQuery({ name: 'userLng', required: false, description: 'Longitude do usuário', example: -46.6333 })
  @ApiQuery({ name: 'radius', required: false, description: 'Raio de busca em metros', example: 5000 })
  @ApiQuery({ name: 'type', required: false, description: 'Tipo de local', example: 'gym' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limite de resultados', example: 10 })
  async testSearchLocations(
    @Query() searchDto: SearchLocationsDto
  ): Promise<SearchLocationsResponseDto> {
    try {
      return await this.locationsService.searchLocations(searchDto, null);
    } catch (error) {
      this.logger.error('Erro no teste de busca:', error);
      return {
        locations: [],
        total: 0,
        query: searchDto.query
      };
    }
  }

  @Post('favorites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Adicionar local aos favoritos',
    description: 'Adiciona um local aos favoritos do usuário ou incrementa o contador de uso'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Local adicionado aos favoritos com sucesso'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos'
  })
  async addToFavorites(
    @Body() body: { locationId: string; customName?: string },
    @Request() req: any
  ): Promise<{ message: string }> {
    await this.locationsService.addToFavorites(
      req.user.sub, 
      body.locationId, 
      body.customName
    );
    return { message: 'Local adicionado aos favoritos com sucesso' };
  }

  @Get('favorites')
  @ApiOperation({ 
    summary: 'Listar locais favoritos',
    description: 'Lista os locais favoritos do usuário ordenados por frequência de uso'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de locais favoritos retornada com sucesso',
    type: [UserFavoriteLocationDto]
  })
  async getUserFavorites(@Request() req: any): Promise<UserFavoriteLocationDto[]> {
    return this.locationsService.getUserFavorites(req.user.sub);
  }

  @Get('favorites/:locationId')
  @ApiOperation({ 
    summary: 'Verificar se local é favorito',
    description: 'Verifica se um local específico está nos favoritos do usuário'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Status do favorito retornado com sucesso'
  })
  async isFavorite(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Request() req: any
  ): Promise<{ isFavorite: boolean; usageCount?: number }> {
    const favorites = await this.locationsService.getUserFavorites(req.user.sub);
    const favorite = favorites.find(fav => fav.locationId === locationId);
    
    return {
      isFavorite: !!favorite,
      usageCount: favorite?.usageCount
    };
  }
}
