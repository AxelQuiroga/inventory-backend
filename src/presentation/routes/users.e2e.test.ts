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
// Cubre el ciclo de vida de la gestión de usuarios (USERS_POLICY.MD).

let app: FastifyInstance;
let creds: E2eCredentials;

beforeAll(async () => {
  app = await buildE2eApp();
});

afterAll(async () => closeE2eApp(app));

beforeEach(async () => {
  creds = await resetE2eDb();
});

describe('USERS E2E', () => {
  it('el ADMIN lista solo los roles gestionables, sin password y sin el ADMIN', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.admin.email, password: creds.admin.password },
    });
    const { token } = JSON.parse(login.body);

    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    const users = JSON.parse(res.body);
    expect(users).toHaveLength(2);
    const emails = users.map((u: { email: string }) => u.email).sort();
    expect(emails).toEqual(['operator@inventory.com', 'viewer@inventory.com']);
    for (const user of users) {
      expect(user).not.toHaveProperty('password');
      expect(user).toHaveProperty('active');
    }
  });

  it('OPERATOR y VIEWER no pueden listar usuarios (403)', async () => {
    const operatorLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.operator.email, password: creds.operator.password },
    });
    const viewerLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.viewer.email, password: creds.viewer.password },
    });

    for (const token of [JSON.parse(operatorLogin.body).token, JSON.parse(viewerLogin.body).token]) {
      const res = await app.inject({
        method: 'GET',
        url: '/users',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('ciclo completo: desactivar OPERATOR bloquea su login; reactivar lo restaura', async () => {
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.admin.email, password: creds.admin.password },
    });
    const adminToken = JSON.parse(adminLogin.body).token as string;

    // 1. Desactivar
    const deactivate = await app.inject({
      method: 'POST',
      url: `/users/${creds.operator.id}/deactivate`,
      headers: authHeader(adminToken),
    });
    expect(deactivate.statusCode).toBe(200);
    expect(JSON.parse(deactivate.body).active).toBe(false);

    // 2. El OPERATOR desactivado no puede iniciar sesión
    const blockedLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.operator.email, password: creds.operator.password },
    });
    expect(blockedLogin.statusCode).toBe(401);
    expect(JSON.parse(blockedLogin.body).message).toBe('User is deactivated');

    // 3. Reactivar
    const reactivate = await app.inject({
      method: 'POST',
      url: `/users/${creds.operator.id}/reactivate`,
      headers: authHeader(adminToken),
    });
    expect(reactivate.statusCode).toBe(200);
    expect(JSON.parse(reactivate.body).active).toBe(true);

    // 4. Login restaurado
    const restoredLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.operator.email, password: creds.operator.password },
    });
    expect(restoredLogin.statusCode).toBe(200);
  });

  it('el ADMIN no puede desactivar al ADMIN único (400, guard en el servidor)', async () => {
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.admin.email, password: creds.admin.password },
    });
    const adminToken = JSON.parse(adminLogin.body).token as string;

    const res = await app.inject({
      method: 'POST',
      url: `/users/${creds.admin.id}/deactivate`,
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('Cannot manage ADMIN user');
  });

  it('desactivar un usuario inexistente devuelve 404', async () => {
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: creds.admin.email, password: creds.admin.password },
    });
    const adminToken = JSON.parse(adminLogin.body).token as string;

    const res = await app.inject({
      method: 'POST',
      url: '/users/00000000-0000-4000-8000-000000000000/deactivate',
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toBe('User not found');
  });
});