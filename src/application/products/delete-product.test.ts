import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DeleteProduct } from './delete-product';
import type { ProductRepository } from '../../domain/interfaces/product-repository';

const repository: ProductRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findBySku: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const useCase = new DeleteProduct(repository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeleteProduct', () => {
  it('elimina el producto y devuelve true', async () => {
    vi.mocked(repository.delete).mockResolvedValue(true);

    const result = await useCase.execute('prod-1');

    expect(repository.delete).toHaveBeenCalledWith('prod-1');
    expect(result).toBe(true);
  });

  it('devuelve false cuando el producto no existe', async () => {
    vi.mocked(repository.delete).mockResolvedValue(false);

    const result = await useCase.execute('no-existe');

    expect(result).toBe(false);
  });
});