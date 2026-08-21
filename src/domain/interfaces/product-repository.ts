import type { Product } from "../entities/product.js";

export interface ProductFilters {
  search?: string;        // Busca en nombre, descripción, SKU
  category?: string;      // Filtra por categoría exacta
  minPrice?: number;      // Precio mínimo
  maxPrice?: number;      // Precio máximo
  lowStock?: boolean;     // Stock <= minStock
  sortBy?: 'name' | 'price' | 'stock' | 'createdAt';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ProductRepository {
    create(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product>;
    findById(id: string): Promise<Product | null>;
    findBySku(sku: string): Promise<Product | null>;
    findAll(filters?: ProductFilters): Promise<Product[]>;
    update(id: string, data: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'stock'>>): Promise<Product | null>;
    delete(id: string): Promise<boolean>;
}
