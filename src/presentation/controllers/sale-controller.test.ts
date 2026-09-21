import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SaleController } from './sale-controller';
import { CreateSale } from '../../application/sales/create-sale';
import { GetSale } from '../../application/sales/get-sale';
import { ListSales } from '../../application/sales/list-sales';

// Los use cases reales ya están cubiertos (integration/e2e): acá se mockea
// execute para aislar SOLO el contrato de errores del controller.
const execute = vi.fn();
const useCase = { execute } as any;

const controller = new SaleController(useCase, useCase, useCase);

const USER_ID = 'a1b2c3d4-5e6f-7890-abcd-ef1234567890';
const PRODUCT_ID = '6d7e5f2a-1b3c-4d5e-8f90-abc123456789';
const SALE_ID = '9f8e7d6c-5b4a-3210-8fdc-ba9876543210';

// Body válido para createSaleSchema (si no, el test ni llega al use case)
const validBody = {
  items: [{ productId: PRODUCT_ID, quantity: 2 }],
};

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

describe('SaleController.create', () => {
  it('crea la venta con las líneas y el userId del operador, devuelve 201', async () => {
    const sale = { id: SALE_ID, items: [{ productId: PRODUCT_ID, quantity: 2, total: 200 }], total: 200 };
    execute.mockResolvedValue(sale);

    const reply = makeReply();
    await controller.create(makeRequest(), reply);

    expect(execute).toHaveBeenCalledWith({
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
      userId: USER_ID,
    });
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith(sale);
  });

  it('mapea "Insufficient stock" a 400', async () => {
    execute.mockRejectedValue(new Error('Insufficient stock'));

    const reply = makeReply();
    await controller.create(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Insufficient stock' });
  });

  it('mapea "Product not found" a 404', async () => {
    execute.mockRejectedValue(new Error('Product not found'));

    const reply = makeReply();
    await controller.create(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Product not found' });
  });

  it('mapea "Product is inactive" a 400', async () => {
    execute.mockRejectedValue(new Error('Product is inactive'));

    const reply = makeReply();
    await controller.create(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Product is inactive' });
  });

  it('items vacío no llega al use case: 400 con los errores del schema', async () => {
    const reply = makeReply();
    await controller.create(makeRequest({ body: { items: [] } }), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('errores no mapeados devuelven 500 pero quedan visibles en el log', async () => {
    execute.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const request = makeRequest();
    const reply = makeReply();
    await controller.create(request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Internal server error' });
    expect(request.log.error).toHaveBeenCalledWith(expect.anything(), 'Unexpected error in sale controller');
  });
});

describe('SaleController.getById', () => {
  it('devuelve 404 si la venta no existe', async () => {
    execute.mockResolvedValue(null);

    const reply = makeReply();
    await controller.getById(makeRequest({ params: { id: SALE_ID } }), reply);

    expect(execute).toHaveBeenCalledWith(SALE_ID);
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Sale not found' });
  });

  it('params con UUID inválido da 400 sin tocar el use case', async () => {
    const reply = makeReply();
    await controller.getById(makeRequest({ params: { id: 'no-soy-uuid' } }), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('SaleController.getAll', () => {
  it('devuelve el listado de ventas', async () => {
    const list = [{ id: SALE_ID, itemCount: 2, total: 200 }];
    execute.mockResolvedValue(list);

    const reply = makeReply();
    await controller.getAll(makeRequest(), reply);

    expect(reply.send).toHaveBeenCalledWith(list);
  });
});