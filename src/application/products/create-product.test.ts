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
  price: 899.99,
  stock: 0,
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
  getSummary: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
};

const useCase = new CreateProduct(repository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateProduct', () => {
  it('crea el producto sin stock inicial cuando el SKU no existe', async () => {
    vi.mocked(repository.findBySku).mockResolvedValue(null);
    vi.mocked(repository.create).mockResolvedValue(product);

    const result = await useCase.execute({
      name: 'Laptop',
      description: 'Laptop 14"',
      sku: 'LAP-001',
      category: 'Electrónica',
      price: 899.99,
      minStock: 5,
    });

    expect(repository.findBySku).toHaveBeenCalledWith('LAP-001');
    // El stock NO forma parte de la creación: la DB lo inicializa en 0
    expect(repository.create).toHaveBeenCalledWith({
      name: 'Laptop',
      description: 'Laptop 14"',
      sku: 'LAP-001',
      category: 'Electrónica',
      price: 899.99,
      minStock: 5,
    });
    expect(result).toEqual(product);
  });

  it('con stock inicial > 0: delega en createWithInitialStock en un solo paso atómico', async () => {
    vi.mocked(repository.findBySku).mockResolvedValue(null);
    vi.mocked(repository.createWithInitialStock).mockResolvedValue({ ...product, stock: 10 });

    const result = await useCase.execute(
      {
        name: 'Laptop',
        description: 'Laptop 14"',
        sku: 'LAP-001',
        category: 'Electrónica',
        price: 899.99,
        minStock: 5,
      },
      { initialStock: 10, userId: 'user-1' },
    );

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.createWithInitialStock).toHaveBeenCalledTimes(1);
    expect(repository.createWithInitialStock).toHaveBeenCalledWith({
      product: {
        name: 'Laptop',
        description: 'Laptop 14"',
        sku: 'LAP-001',
        category: 'Electrónica',
        price: 899.99,
        minStock: 5,
      },
      initialStock: 10,
      userId: 'user-1',
    });
    expect(result.stock).toBe(10);
  });

  it('con stock inicial 0 (o ausente): usa create y NO delega en el método atómico', async () => {
    vi.mocked(repository.findBySku).mockResolvedValue(null);
    vi.mocked(repository.create).mockResolvedValue(product);

    await useCase.execute(
      {
        name: 'Laptop',
        description: '',
        sku: 'LAP-001',
        category: 'Electrónica',
        price: 899.99,
        minStock: 5,
      },
      { initialStock: 0, userId: 'user-1' },
    );

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.createWithInitialStock).not.toHaveBeenCalled();
  });

  it('lanza error cuando el SKU ya existe', async () => {
    vi.mocked(repository.findBySku).mockResolvedValue(product);

    await expect(
      useCase.execute({
        name: 'Laptop',
        description: 'Laptop 14"',
        sku: 'LAP-001',
        category: 'Electrónica',
        price: 899.99,
        minStock: 5,
      }),
    ).rejects.toThrow('SKU already exists');

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.createWithInitialStock).not.toHaveBeenCalled();
  });
});
