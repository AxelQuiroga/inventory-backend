import type { ProductRepository } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

export class GetProduct {
  constructor(private repository: ProductRepository) {}

  async execute(id: string): Promise<Product | null> {
    return this.repository.findById(id);
  }
}