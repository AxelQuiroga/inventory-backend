import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MovementController } from './movement-controller';
import { RegisterStockEntry } from '../../application/movements/register-entry';
import { RegisterStockExit } from '../../application/movements/register-exit';
import { GetMovementHistory } from '../../application/movements/get-history';
import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import { MovementType, type Movement } from '../../domain/entities/movement';

// Mocks de periferia (repositorio) para construir use cases reales
const movementRepository: MovementRepository = {
  createEntry: vi.fn(),
  createExit: vi.fn(),
  findByProductId: vi.fn(),
  findAll: vi.fn(),
};

const registerEntry = new RegisterStockEntry(movementRepository);
const registerExit = new RegisterStockExit(movementRepository);
const getHistory = new GetMovementHistory(movementRepository);

const controller = new MovementController(registerEntry, registerExit, getHistory);

const PRODUCT_ID = '6d7e5f2a-1b3c-4d5e-8f90-abc123456789';
const USER_ID = 'a1b2c3d4-5e6f-7890-abcd-ef1234567890';

const entryMovement: Movement = {
  id: 'mov-1',
  productId: PRODUCT_ID,
  userId: USER_ID,
  type: MovementType.OUT,
  quantity: 3,
  reason: 'Venta',
  createdAt: new Date('2026-01-03'),
};

// Helper: request/reply mínimos de Fastify
function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    body: {
      productId: PRODUCT_ID,
      quantity: 3,
      reason: 'Venta',
    },
    user: { userId: USER_ID, role: 'OPERATOR' },
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

describe('MovementController.createExit', () => {
  it('usa el use case de SALIDA (registerExit), no el de entrada', async () => {
    vi.mocked(movementRepository.createExit).mockResolvedValue(entryMovement);

    const reply = makeReply();
    await controller.createExit(makeRequest(), reply);

    expect(movementRepository.createExit).toHaveBeenCalledTimes(1);
    expect(movementRepository.createEntry).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith(entryMovement);
  });

  it('mapea "Product is inactive" a 400', async () => {
    vi.mocked(movementRepository.createExit).mockRejectedValue(new Error('Product is inactive'));

    const reply = makeReply();
    await controller.createExit(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Product is inactive' });
  });

  it('mapea "Insufficient stock" a 400', async () => {
    vi.mocked(movementRepository.createExit).mockRejectedValue(new Error('Insufficient stock'));

    const reply = makeReply();
    await controller.createExit(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Insufficient stock' });
  });

  it('mapea "Product not found" a 404', async () => {
    vi.mocked(movementRepository.createExit).mockRejectedValue(new Error('Product not found'));

    const reply = makeReply();
    await controller.createExit(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Product not found' });
  });
});

describe('MovementController.createEntry', () => {
  it('mapea "Product is inactive" a 400', async () => {
    vi.mocked(movementRepository.createEntry).mockRejectedValue(new Error('Product is inactive'));

    const reply = makeReply();
    await controller.createEntry(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Product is inactive' });
  });
});

describe('MovementController.getHistory', () => {
  it('parsea la query de paginación y la pasa al use case', async () => {
    vi.mocked(movementRepository.findByProductId).mockResolvedValue([entryMovement]);

    const reply = makeReply();
    await controller.getHistory(
      makeRequest({
        params: { productId: PRODUCT_ID },
        query: { page: '2', limit: '10' },
      }),
      reply,
    );

    expect(movementRepository.findByProductId).toHaveBeenCalledWith(PRODUCT_ID, { page: 2, limit: 10 });
    expect(reply.send).toHaveBeenCalledWith([entryMovement]);
  });

  it('query inválida devuelve 400 sin tocar el repositorio', async () => {
    const reply = makeReply();
    await controller.getHistory(
      makeRequest({
        params: { productId: PRODUCT_ID },
        query: { limit: '0' },
      }),
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(movementRepository.findByProductId).not.toHaveBeenCalled();
  });
});