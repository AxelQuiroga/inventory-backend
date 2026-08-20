import type { ProductRepository, ProductFilters } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

export class ListProducts {
  constructor(private repository: ProductRepository) {}

  async execute(filters?: ProductFilters): Promise<Product[]> {
    return this.repository.findAll(filters);
  }
}