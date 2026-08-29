import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UpdateProduct } from './update-product';
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

const useCase = new UpdateProduct(repository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UpdateProduct', () => {
  it('actualiza el producto cuando no cambia el SKU', async () => {
    vi.mocked(repository.update).mockResolvedValue({ ...product, price: 999.99 });

    const result = await useCase.execute('prod-1', { price: 999.99 });

    expect(repository.findBySku).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith('prod-1', { price: 999.99 });
    expect(result?.price).toBe(999.99);
  });

  it('permite mantener el mismo SKU (mismo producto)', async () => {
    vi.mocked(repository.findBySku).mockResolvedValue(product);
    vi.mocked(repository.update).mockResolvedValue(product);

    const result = await useCase.execute('prod-1', { sku: 'LAP-001' });

    expect(repository.findBySku).toHaveBeenCalledWith('LAP-001');
    expect(repository.update).toHaveBeenCalledWith('prod-1', { sku: 'LAP-001' });
    expect(result).toEqual(product);
  });

  it('lanza error cuando el SKU pertenece a otro producto', async () => {
    const otherProduct = { ...product, id: 'prod-2' };
    vi.mocked(repository.findBySku).mockResolvedValue(otherProduct);

    await expect(useCase.execute('prod-1', { sku: 'LAP-001' })).rejects.toThrow('SKU already exists');

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('devuelve null cuando el producto no existe', async () => {
    vi.mocked(repository.update).mockResolvedValue(null);

    const result = await useCase.execute('no-existe', { name: 'Nada' });

    expect(result).toBeNull();
  });
});