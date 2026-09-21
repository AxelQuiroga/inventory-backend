import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReactivateProduct } from './reactivate-product';
import type { ProductRepository } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

const product: Product = {
  id: 'prod-1',
  name: 'Laptop',
  description: 'Laptop 14"',
  sku: 'LAP-001',
  category: 'Electrónica',
  price: 899.99,
  stock: 10,
  minStock: 5,
  active: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const repository: ProductRepository = {
  create: vi.fn(),
  createWithInitialStock: vi.fn(),
  findById: vi.fn(),
  findBySku: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
};

const useCase = new ReactivateProduct(repository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReactivateProduct', () => {
  it('reactiva el producto y lo devuelve', async () => {
    vi.mocked(repository.setActive).mockResolvedValue({ ...product, active: true });

    const result = await useCase.execute('prod-1');

    expect(repository.setActive).toHaveBeenCalledWith('prod-1', true);
    expect(result?.active).toBe(true);
  });

  it('devuelve null cuando el producto no existe', async () => {
    vi.mocked(repository.setActive).mockResolvedValue(null);

    const result = await useCase.execute('no-existe');

    expect(result).toBeNull();
  });
});