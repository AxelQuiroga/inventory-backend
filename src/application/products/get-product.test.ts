import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GetProduct } from './get-product';
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
  createWithInitialStock: vi.fn(),
  findById: vi.fn(),
  findBySku: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
};

const useCase = new GetProduct(repository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GetProduct', () => {
  it('devuelve el producto cuando existe', async () => {
    vi.mocked(repository.findById).mockResolvedValue(product);

    const result = await useCase.execute('prod-1');

    expect(repository.findById).toHaveBeenCalledWith('prod-1');
    expect(result).toEqual(product);
  });

  it('devuelve null cuando no existe', async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    const result = await useCase.execute('no-existe');

    expect(result).toBeNull();
  });
});