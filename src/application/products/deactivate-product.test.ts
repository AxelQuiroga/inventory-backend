import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DeactivateProduct } from './deactivate-product';
import type { ProductRepository } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

const product: Product = {
  id: 'prod-1',
  name: 'Laptop',
  description: 'Laptop 14"',
  sku: 'LAP-001',
  category: 'Electrónica',
  unit: 'unit',
  price: 899.99,
  stock: 10,
  minStock: 5,
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const repository: ProductRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findBySku: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
};

const useCase = new DeactivateProduct(repository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeactivateProduct', () => {
  it('desactiva el producto (soft delete) y lo devuelve', async () => {
    vi.mocked(repository.setActive).mockResolvedValue({ ...product, active: false });

    const result = await useCase.execute('prod-1');

    expect(repository.setActive).toHaveBeenCalledWith('prod-1', false);
    expect(result?.active).toBe(false);
  });

  it('devuelve null cuando el producto no existe', async () => {
    vi.mocked(repository.setActive).mockResolvedValue(null);

    const result = await useCase.execute('no-existe');

    expect(result).toBeNull();
  });
});