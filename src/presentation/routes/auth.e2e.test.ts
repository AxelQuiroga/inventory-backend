import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  buildE2eApp,
  closeE2eApp,
  resetE2eDb,
  authHeader,
  type E2eCredentials,
} from '../../infrastructure/database/test-e2e-utils';

// E2E real: Fastify real + PostgreSQL de test real. Sin vi.mock.
// Recorre HTTP → Routes → Controllers → Use Cases → Repositories → PG.

let app: FastifyInstance;
let creds: E2eCredentials;

beforeAll(async () => {
  app = await buildE2eApp();
});

afterAll(async () => closeE2eApp(app));

beforeEach(async () => {
  creds = await resetE2eDb();
});

describe('AUTH E2E', () => {
  it('login exitoso devuelve un token JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: creds.admin,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(3); // formato JWT
  });

  it('login con password inválida devuelve 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.admin.email, password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe('Invalid credentials');
  });

  it('login con email inexistente devuelve 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'no-existe@test.local', password: 'admin123' },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe('Invalid credentials');
  });

  it('login con body inválido devuelve 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'no-es-un-email', password: '123' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('acceso sin JWT a endpoint protegido devuelve 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/products' });
    expect(res.statusCode).toBe(401);
  });

  it('acceso con JWT malformado devuelve 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/products',
      headers: authHeader('no-es-un-jwt'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('acceso con JWT válido (obtenido por login) devuelve 200', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: creds.viewer,
    });
    const { token } = JSON.parse(login.body);

    const res = await app.inject({
      method: 'GET',
      url: '/products',
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });
});
