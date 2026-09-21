import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UserController } from './user-controller';

// Los use cases reales ya están cubiertos (integration/e2e): acá se mockea
// execute para aislar SOLO el contrato de errores del controller.
const execute = vi.fn();
const useCase = { execute } as any;

const controller = new UserController(useCase, useCase, useCase);

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OPERATOR_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: { userId: ADMIN_ID, role: 'ADMIN' },
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

describe('UserController.list', () => {
  it('devuelve el listado de usuarios gestionables', async () => {
    const list = [
      { id: OPERATOR_ID, email: 'op@example.com', name: 'Op', role: 'OPERATOR', active: true },
      { id: '33333333-3333-4333-8333-333333333333', email: 'viewer@example.com', name: 'V', role: 'VIEWER', active: false },
    ];
    execute.mockResolvedValue(list);

    const reply = makeReply();
    await controller.list(makeRequest(), reply);

    expect(reply.send).toHaveBeenCalledWith(list);
  });
});

describe('UserController.deactivate', () => {
  it('desactiva un usuario gestionable y devuelve 200', async () => {
    const user = { id: OPERATOR_ID, email: 'op@example.com', name: 'Op', role: 'OPERATOR', active: false };
    execute.mockResolvedValue(user);

    const reply = makeReply();
    await controller.deactivate(makeRequest({ params: { id: OPERATOR_ID } }), reply);

    expect(execute).toHaveBeenCalledWith(OPERATOR_ID);
    expect(reply.send).toHaveBeenCalledWith(user);
  });

  it('mapea "User not found" a 404', async () => {
    execute.mockRejectedValue(new Error('User not found'));

    const reply = makeReply();
    await controller.deactivate(makeRequest({ params: { id: OPERATOR_ID } }), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ message: 'User not found' });
  });

  it('mapea "Cannot manage ADMIN user" a 400 (guard anti-tocar-ADMIN)', async () => {
    execute.mockRejectedValue(new Error('Cannot manage ADMIN user'));

    const reply = makeReply();
    await controller.deactivate(makeRequest({ params: { id: ADMIN_ID } }), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Cannot manage ADMIN user' });
  });

  it('params con UUID inválido da 400 sin tocar el use case', async () => {
    const reply = makeReply();
    await controller.deactivate(makeRequest({ params: { id: 'no-soy-uuid' } }), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('errores no mapeados devuelven 500 pero quedan visibles en el log', async () => {
    execute.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const request = makeRequest({ params: { id: OPERATOR_ID } });
    const reply = makeReply();
    await controller.deactivate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ message: 'Internal server error' });
    expect(request.log.error).toHaveBeenCalledWith(expect.anything(), 'Unexpected error in user controller');
  });
});

describe('UserController.reactivate', () => {
  it('reactiva un usuario gestionable y devuelve 200', async () => {
    const user = { id: OPERATOR_ID, email: 'op@example.com', name: 'Op', role: 'OPERATOR', active: true };
    execute.mockResolvedValue(user);

    const reply = makeReply();
    await controller.reactivate(makeRequest({ params: { id: OPERATOR_ID } }), reply);

    expect(execute).toHaveBeenCalledWith(OPERATOR_ID);
    expect(reply.send).toHaveBeenCalledWith(user);
  });

  it('mapea "User not found" a 404', async () => {
    execute.mockRejectedValue(new Error('User not found'));

    const reply = makeReply();
    await controller.reactivate(makeRequest({ params: { id: OPERATOR_ID } }), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ message: 'User not found' });
  });
});