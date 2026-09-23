import type { MovementRepository, MovementFilters } from '../../domain/interfaces/movement-repository';
import type { GlobalMovement } from '../../domain/entities/movement';
import type { Paginated } from '../../domain/interfaces/pagination';

export interface GetMovementsQuery extends MovementFilters {
  role: string;
}

// Política de visibilidad de la vista global de movimientos:
//  - ADMIN: ve la autoría (userName) y puede filtrar por usuario.
//  - OPERATOR/VIEWER: el movimiento es "información general"; nunca reciben
//    el autor NI pueden filtrar por uno (el filtro se descarta aunque venga
//    en la query). La redacción vive acá, testeable como unidad pura.
export class GetMovements {
  constructor(private movementRepository: MovementRepository) {}

  async execute(query: GetMovementsQuery): Promise<Paginated<GlobalMovement>> {
    if (query.role === 'ADMIN') {
      const { role, ...filters } = query;
      return this.movementRepository.findGlobal(filters, { includeUser: true });
    }

    // No-ADMIN: el filtro se arma SIN userId — un rol que no puede ver
    // autores tampoco puede filtrar por uno.
    const filters: MovementFilters = {
      productId: query.productId,
      type: query.type,
      page: query.page,
      limit: query.limit,
    };
    return this.movementRepository.findGlobal(filters, { includeUser: false });
  }
}