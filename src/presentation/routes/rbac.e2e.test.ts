import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

import {
  buildE2eApp,
  closeE2eApp,
  resetE2eDb,
  authHeader,
  uniqueSku,
  type E2eCredentials,
} from '../../infrastructure/database/test-e2e-utils';

// E2E de RBAC: quién puede hacer qué, validado por HTTP contra la app real.
// Matriz esperada (según las rutas registradas en product/movement/auth-routes):
//   - /auth/register           → solo ADMIN
//   - escribir productos       → solo ADMIN
//   - movimientos (IN/OUT)     → ADMIN + OPERATOR
//   - lectura                  → cualquier rol autenticado

let app: FastifyInstance;
let creds: E2eCredentials;

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).token as string;
}

beforeAll(async () => {
  app = await buildE2eApp();
});

afterAll(async () => closeE2eApp(app));

beforeEach(async () => {
  creds = await resetE2eDb();
});

describe('RBAC E2E', () => {
  it('ADMIN puede registrar un usuario vía /auth/register', async () => {
    const token = await login(creds.admin.email, creds.admin.password);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: authHeader(token),
      payload: {
        email: `nuevo-${randomUUID()}@test.local`,
        password: 'secret123',
        name: 'Nuevo Usuario',
        role: 'OPERATOR',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.email).toContain('@test.local');
    expect(body.role).toBe('OPERATOR');
    expect(body.password).toBeUndefined(); // nunca se expone el hash
  });

  it('OPERATOR no puede registrar usuarios (403)', async () => {
    const token = await login(creds.operator.email, creds.operator.password);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: authHeader(token),
      payload: {
        email: `intruso-${randomUUID()}@test.local`,
        password: 'secret123',
        name: 'Intruso',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Forbidden');
  });

  it('VIEWER no puede registrar usuarios (403)', async () => {
    const token = await login(creds.viewer.email, creds.viewer.password);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: authHeader(token),
      payload: {
        email: `intruso2-${randomUUID()}@test.local`,
        password: 'secret123',
        name: 'Intruso 2',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('VIEWER no puede ejecutar operaciones de escritura de productos (403)', async () => {
    const token = await login(creds.viewer.email, creds.viewer.password);

    const create = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(token),
      payload: { name: 'X', sku: uniqueSku(), category: 'E2E', price: 1 },
    });
    expect(create.statusCode).toBe(403);

    const update = await app.inject({
      method: 'PUT',
      url: `/products/${randomUUID()}`,
      headers: authHeader(token),
      payload: { name: 'Y' },
    });
    expect(update.statusCode).toBe(403);

    const deactivate = await app.inject({
      method: 'POST',
      url: `/products/${randomUUID()}/deactivate`,
      headers: authHeader(token),
    });
    expect(deactivate.statusCode).toBe(403);
  });

  it('VIEWER no puede registrar movimientos de stock (403), pero sí leer', async () => {
    const viewerToken = await login(creds.viewer.email, creds.viewer.password);
    const adminToken = await login(creds.admin.email, creds.admin.password);

    // ADMIN crea el producto para que VIEWER intente moverlo
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: { name: 'Solo lectura', sku: uniqueSku(), category: 'E2E', price: 5 },
    });
    const productId = JSON.parse(created.body).id as string;

    const entry = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(viewerToken),
      payload: { productId, quantity: 1, reason: 'No permitido' },
    });
    expect(entry.statusCode).toBe(403);

    // La lectura sí está permitida para cualquier rol autenticado
    const read = await app.inject({
      method: 'GET',
      url: '/products',
      headers: authHeader(viewerToken),
    });
    expect(read.statusCode).toBe(200);
  });

  it('OPERATOR puede mover stock (IN/OUT) pero no crear productos (403)', async () => {
    const operatorToken = await login(creds.operator.email, creds.operator.password);
    const adminToken = await login(creds.admin.email, creds.admin.password);

    const created = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: { name: 'Operable', sku: uniqueSku(), category: 'E2E', price: 5 },
    });
    const productId = JSON.parse(created.body).id as string;

    const entry = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(operatorToken),
      payload: { productId, quantity: 4, reason: 'Reposición' },
    });
    expect(entry.statusCode).toBe(201);

    const exit = await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(operatorToken),
      payload: { productId, quantity: 2, reason: 'Venta' },
    });
    expect(exit.statusCode).toBe(201);

    const denied = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(operatorToken),
      payload: { name: 'No permitido', sku: uniqueSku(), category: 'E2E', price: 5 },
    });
    expect(denied.statusCode).toBe(403);
  });
});
