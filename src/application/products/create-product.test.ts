import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CreateProduct } from './create-product';
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
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const repository: ProductRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findBySku: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const useCase = new CreateProduct(repository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateProduct', () => {
  it('crea el producto cuando el SKU no existe', async () => {
    vi.mocked(repository.findBySku).mockResolvedValue(null);
    vi.mocked(repository.create).mockResolvedValue(product);

    const result = await useCase.execute({
      name: 'Laptop',
      description: 'Laptop 14"',
      sku: 'LAP-001',
      category: 'Electrónica',
      unit: 'unit',
      price: 899.99,
      stock: 10,
      minStock: 5,
    });

    expect(repository.findBySku).toHaveBeenCalledWith('LAP-001');
    expect(repository.create).toHaveBeenCalledWith({
      name: 'Laptop',
      description: 'Laptop 14"',
      sku: 'LAP-001',
      category: 'Electrónica',
      unit: 'unit',
      price: 899.99,
      stock: 10,
      minStock: 5,
    });
    expect(result).toEqual(product);
  });

  it('lanza error cuando el SKU ya existe', async () => {
    vi.mocked(repository.findBySku).mockResolvedValue(product);

    await expect(
      useCase.execute({
        name: 'Laptop',
        description: 'Laptop 14"',
        sku: 'LAP-001',
        category: 'Electrónica',
        unit: 'unit',
        price: 899.99,
        stock: 10,
        minStock: 5,
      }),
    ).rejects.toThrow('SKU already exists');

    expect(repository.create).not.toHaveBeenCalled();
  });
});