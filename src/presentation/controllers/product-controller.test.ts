import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProductController } from './product-controller';
import { CreateProduct } from '../../application/products/create-product';
import { UpdateProduct } from '../../application/products/update-product';
import { DeactivateProduct } from '../../application/products/deactivate-product';
import { ReactivateProduct } from '../../application/products/reactivate-product';
import { GetProduct } from '../../application/products/get-product';
import { ListProducts } from '../../application/products/list-products';

// Los use cases reales ya están cubiertos por sus unit tests y e2e: acá se
// mockea execute para aislar SOLO el contrato de errores del controller.
const execute = vi.fn();
const useCase = { execute } as any;

const controller = new ProductController(
  useCase, // CreateProduct
  useCase, // UpdateProduct
  useCase, // DeactivateProduct
  useCase, // ReactivateProduct
  useCase, // GetProduct
  useCase, // ListProducts
);

const USER_ID = 'a1b2c3d4-5e6f-7890-abcd-ef1234567890';

// Body válido para createProductSchema (si no, el test ni llega al use case)
const validBody = {
  name: 'Producto de prueba',
  sku: 'SKU-TEST',
  category: 'Test',
  price: 100,
  minStock: 5,
  initialStock: 0,
};

// Helper: request/reply mínimos de Fastify
function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    body: validBody,
    user: { userId: USER_ID, role: 'ADMIN' },
    log: { error: vi.fn(), warn: vi.fn() },
    ...overrides,
  } as any;
}

function makeReply() {
  const reply: any = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductController.create', () => {
  it('crea el producto y devuelve 201', async () => {
    const product = { id: 'prod-1', sku: 'SKU-TEST' };
    execute.mockResolvedValue(product);

    const reply = makeReply();
    await controller.create(makeRequest(), reply);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'SKU-TEST', price: 100 }),
      { initialStock: 0, userId: USER_ID },
    );
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith(product);
  });

  it('mapea "SKU already exists" a 409', async () => {
    execute.mockRejectedValue(new Error('SKU already exists'));

    const reply = makeReply();
    await controller.create(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({ message: 'SKU already exists' });
  });

  it('mapea la violación de constraint único de Postgres (23505) a 409', async () => {
    const pgError = Object.assign(
      new Error('duplicate key value violates unique constraint "products_sku_unique"'),
      { code: '23505' },
    );
    execute.mockRejectedValue(pgError);

    const request = makeRequest();
    const reply = makeReply();
    await controller.create(request, reply);

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({ message: 'SKU already exists' });
    expect(request.log.warn).toHaveBeenCalled();
  });

  it('errores no mapeados devuelven 500 pero quedan visibles en el log', async () => {
    const realError = new Error('connection terminated unexpectedly');
    execute.mockRejectedValue(realError);

    const request = makeRequest();
    const reply = makeReply();
    await controller.create(request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Internal server error' });
    expect(request.log.error).toHaveBeenCalledWith(expect.anything(), 'Unexpected error in product controller');
  });
});