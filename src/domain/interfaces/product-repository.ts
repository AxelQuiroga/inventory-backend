import type { Product } from "../entities/product.js";

export interface ProductFilters {
  search?: string;        // Busca en nombre, descripción, SKU
  category?: string;      // Filtra por categoría exacta
  minPrice?: number;      // Precio mínimo
  maxPrice?: number;      // Precio máximo
  lowStock?: boolean;     // Stock <= minStock
  includeInactive?: boolean; // Solo ADMIN: incluye productos desactivados
  sortBy?: 'name' | 'price' | 'stock' | 'createdAt';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export type ProductCreateData = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'stock' | 'active'>;

// Payload del método atómico: crea el producto y su stock inicial en una
// única transacción (producto + movimiento IN "Stock inicial").
export interface ProductWithInitialStock {
  product: ProductCreateData;
  initialStock: number;
  userId: string;
}

export interface ProductRepository {
    create(data: ProductCreateData): Promise<Product>;
    createWithInitialStock(data: ProductWithInitialStock): Promise<Product>;
    findById(id: string): Promise<Product | null>;
    findBySku(sku: string): Promise<Product | null>;
    findAll(filters?: ProductFilters): Promise<Product[]>;
    update(id: string, data: Partial<ProductCreateData>): Promise<Product | null>;
    setActive(id: string, active: boolean): Promise<Product | null>;
}
