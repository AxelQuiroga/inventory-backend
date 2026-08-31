import type { ProductRepository } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

export class ReactivateProduct {
  constructor(private repository: ProductRepository) {}

  async execute(id: string): Promise<Product | null> {
    // Devuelve el producto al listado activo manteniendo stock e historial.
    return this.repository.setActive(id, true);
  }
}