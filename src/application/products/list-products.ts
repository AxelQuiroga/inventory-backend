import type { ProductRepository, ProductFilters } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';
import type { Paginated } from '../../domain/interfaces/pagination';

export class ListProducts {
  constructor(private repository: ProductRepository) {}

  async execute(filters?: ProductFilters): Promise<Paginated<Product>> {
    return this.repository.findAll(filters);
  }
}