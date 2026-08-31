import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// Los repositorios apuntan a la TEST DB (mismo patrón que los otros tests de integración)
vi.mock('../../infrastructure/database', async () => {
  const { testDb } = await import('../../infrastructure/database/test-db');
  return { db: testDb };
});

// Secret del JWT para construir tokens de prueba y validarlos en authenticate
const JWT_SECRET = 'http-test-secret';
process.env.JWT_SECRET = JWT_SECRET;

import { buildApp } from '../../app';
import { verifyTestDbIsReady, resetTestDb, createUser, createProduct } from '../../infrastructure/database/test-utils';
import { closeTestDb, testPool } from '../../infrastructure/database/test-db';
import { JwtService } from '../../infrastructure/auth/jwt-service';
import { UserRole } from '../../infrastructure/database/schema/users';
import type { FastifyInstance } from 'fastify';

const jwtService = new JwtService(JWT_SECRET);

function tokenFor(userId: string, role: string): string {
  return jwtService.sign({ userId, email: `user-${userId}@test.local`, role });
}

let app: FastifyInstance;

beforeAll(async () => {
  await verifyTestDbIsReady();
  app = buildApp();
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

async function inject(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  opts: { token?: string; payload?: unknown } = {},
) {
  return app.inject({
    method,
    url,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      'content-type': 'application/json',
    },
    payload: opts.payload === undefined ? undefined : JSON.stringify(opts.payload),
  });
}

describe('Autorización HTTP (end-to-end por Fastify, sin mocks de authorize)', () => {
  it('401: sin JWT no se accede a un endpoint protegido', async () => {
    const res = await inject('GET', '/products');
    expect(res.statusCode).toBe(401);
  });

  it('403: VIEWER no puede crear un producto', async () => {
    const user = await createUser(UserRole.VIEWER);
    const res = await inject('POST', '/products', {
      token: tokenFor(user.id, 'VIEWER'),
      payload: {
        name: 'Laptop',
        sku: 'LAP-001',
        category: 'Electrónica',
        unit: 'unit',
        price: 500,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403: OPERATOR no puede modificar un producto', async () => {
    const user = await createUser();
    const res = await inject('PUT', `/products/${randomUUID()}`, {
      token: tokenFor(user.id, 'OPERATOR'),
      payload: { name: 'Hackeado' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403: VIEWER no puede usar includeInactive=true', async () => {
    const user = await createUser(UserRole.VIEWER);
    const res = await inject('GET', '/products?includeInactive=true', {
      token: tokenFor(user.id, 'VIEWER'),
    });
    expect(res.statusCode).toBe(403);
  });

  it('201: OPERATOR registra una salida válida y el stock baja', async () => {
    const user = await createUser(); // OPERATOR por defecto
    const product = await createProduct({ stock: 10 });

    const res = await inject('POST', '/movements/exit', {
      token: tokenFor(user.id, 'OPERATOR'),
      payload: { productId: product.id, quantity: 3, reason: 'Venta' },
    });

    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body);
    expect(body.type).toBe('OUT');
    expect(body.userId).toBe(user.id);

    const { rows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(rows[0].stock)).toBe(7);
  });

  it('201: ADMIN crea un producto (operación administrativa válida)', async () => {
    const user = await createUser(UserRole.ADMIN);

    const res = await inject('POST', '/products', {
      token: tokenFor(user.id, 'ADMIN'),
      payload: {
        name: 'Mesa',
        sku: `MESA-${randomUUID().slice(0, 8)}`,
        category: 'Muebles',
        unit: 'unit',
        price: 100,
      },
    });

    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body);
    expect(body.stock).toBe(0);
    expect(body.active).toBe(true);
  });

  it('200: ADMIN puede editar la metadata de un producto inactivo (decisión de dominio)', async () => {
    const user = await createUser(UserRole.ADMIN);
    const product = await createProduct({ stock: 5, active: true });
    await testPool.query('UPDATE products SET active = false WHERE id = $1', [product.id]);

    const res = await inject('PUT', `/products/${product.id}`, {
      token: tokenFor(user.id, 'ADMIN'),
      payload: { name: 'Mesa renovada' },
    });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.name).toBe('Mesa renovada');
    expect(body.active).toBe(false);

    const { rows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(rows[0].stock)).toBe(5);
  });
});

describe('Validación de params (UUID malformado → 400, no 500)', () => {
  it('400: GET /products/:id con UUID inválido', async () => {
    const user = await createUser(UserRole.VIEWER);
    const res = await inject('GET', '/products/not-a-uuid', {
      token: tokenFor(user.id, 'VIEWER'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('400: GET /movements/history/:productId con UUID inválido', async () => {
    const user = await createUser(UserRole.VIEWER);
    const res = await inject('GET', '/movements/history/not-a-uuid', {
      token: tokenFor(user.id, 'VIEWER'),
    });
    expect(res.statusCode).toBe(400);
  });
});