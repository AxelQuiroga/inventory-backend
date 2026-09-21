import type { ProductRepository, ProductCreateData, ProductWithInitialStock } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

// Creación de productos: opcionalmente con stock inicial atómico.
// El stock entra SIEMPRE como movimiento IN ("Stock inicial"): nunca se
// escribe stock directo. Con initialStock > 0, producto + movimiento se
// crean en una única transacción del repositorio (o nada).
export interface CreateProductOptions {
  initialStock?: number;
  userId: string;
}

export class CreateProduct {
  constructor(private repository: ProductRepository) {}

  async execute(data: ProductCreateData, options?: Partial<CreateProductOptions>): Promise<Product> {
    const existing = await this.repository.findBySku(data.sku);
    if (existing) {
      throw new Error('SKU already exists');
    }

    if (options?.initialStock && options.initialStock > 0) {
      if (!options.userId) {
        throw new Error('Missing user for initial stock movement');
      }
      const payload: ProductWithInitialStock = {
        product: data,
        initialStock: options.initialStock,
        userId: options.userId,
      };
      return this.repository.createWithInitialStock(payload);
    }

    return this.repository.create(data);
  }
}