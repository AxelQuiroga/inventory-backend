import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Los repositorios apuntan a la TEST DB (mismo patrón que los otros tests de integración)
vi.mock('../../infrastructure/database', async () => {
  const { testDb } = await import('../../infrastructure/database/test-db');
  return { db: testDb };
});

// Secret del JWT para construir tokens de prueba y validarlos en authenticate.
// Debe cumplir el contrato de env (>= 32 chars): el schema de loadEnv() lo exige.
const JWT_SECRET = 'http-test-secret-0123456789abcdef';
process.env.JWT_SECRET = JWT_SECRET;
// El módulo de base de datos está mockeado (arriba), la URL nunca se conecta:
// solo satisface la validación de env para pasar por buildApp().
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';

import { buildApp } from '../../app';
import { verifyTestDbIsReady, resetTestDb, createUser, createProduct } from '../../infrastructure/database/test-utils';
import { closeTestDb, testPool, testDb } from '../../infrastructure/database/test-db';
import { JwtService } from '../../infrastructure/auth/jwt-service';
import { UserRole, users } from '../../infrastructure/database/schema/users';
import { BCRYPT_ROUNDS } from '../../domain/auth';
import type { FastifyInstance } from 'fastify';

const jwtService = new JwtService(JWT_SECRET);

function tokenFor(userId: string, role: string): string {
  return jwtService.sign({ userId, email: `user-${userId}@test.local`, role });
}

// createUser() de test-utils guarda la password EN CLARO (fixture para tests de
// repo, no para login). El cambio de password necesita un usuario con hash
// bcrypt REAL: sin hashear, bcrypt.compare falla aunque el string matchee.
async function createUserWithHashedPassword(role: UserRole = UserRole.OPERATOR) {
  const password = bcrypt.hashSync('not-used-in-tests', BCRYPT_ROUNDS);
  const [user] = await testDb
    .insert(users)
    .values({
      email: `user-${randomUUID()}@test.local`,
      password,
      name: 'Test User',
      role,
    })
    .returning();

  if (!user) throw new Error('Failed to create test user');
  return user;
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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
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

  it('200: VIEWER puede LISTAR inactivos con includeInactive=true (solo lectura)', async () => {
    const admin = await createUser(UserRole.ADMIN);
    const viewer = await createUser(UserRole.VIEWER);
    const product = await createProduct();

    // El admin lo desactiva; el viewer SOLO puede verlo, no gestionarlo.
    // app.inject directo (sin content-type): el helper local manda siempre
    // application/json y Fastify rechaza un POST sin body con 400.
    const off = await app.inject({
      method: 'POST',
      url: `/products/${product.id}/deactivate`,
      headers: { authorization: `Bearer ${tokenFor(admin.id, 'ADMIN')}` },
    });
    expect(off.statusCode).toBe(200);

    const res = await inject('GET', '/products?includeInactive=true', {
      token: tokenFor(viewer.id, 'VIEWER'),
    });
    expect(res.statusCode).toBe(200);
    const ids = JSON.parse(res.body).data.map((p: { id: string }) => p.id);
    expect(ids).toContain(product.id);

    // Sin el filtro, el listado por defecto lo sigue ocultando.
    const plain = await inject('GET', '/products', { token: tokenFor(viewer.id, 'VIEWER') });
    const plainIds = JSON.parse(plain.body).data.map((p: { id: string }) => p.id);
    expect(plainIds).not.toContain(product.id);
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

describe('PATCH /auth/me/password (cambio de password del usuario autenticado)', () => {
  it('401: sin JWT no se puede cambiar la password', async () => {
    const res = await inject('PATCH', '/auth/me/password', {
      payload: { currentPassword: 'cualquiera', newPassword: 'NuevaSegura2026' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('400: newPassword con menos de 8 caracteres', async () => {
    const user = await createUserWithHashedPassword();
    const res = await inject('PATCH', '/auth/me/password', {
      token: tokenFor(user.id, 'OPERATOR'),
      payload: { currentPassword: 'not-used-in-tests', newPassword: 'corta' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400: body incompleto (falta currentPassword)', async () => {
    const user = await createUserWithHashedPassword();
    const res = await inject('PATCH', '/auth/me/password', {
      token: tokenFor(user.id, 'OPERATOR'),
      payload: { newPassword: 'NuevaSegura2026' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('401: currentPassword incorrecta → CurrentPasswordMismatchError', async () => {
    const user = await createUserWithHashedPassword();
    const res = await inject('PATCH', '/auth/me/password', {
      token: tokenFor(user.id, 'OPERATOR'),
      payload: { currentPassword: 'password-incorrecta', newPassword: 'NuevaSegura2026' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe('Current password is incorrect');
  });

  it('200: cambia la password y el login con la NUEVA funciona (y con la vieja falla)', async () => {
    const user = await createUserWithHashedPassword(); // password: 'not-used-in-tests' (bcrypt real)

    const res = await inject('PATCH', '/auth/me/password', {
      token: tokenFor(user.id, 'OPERATOR'),
      payload: { currentPassword: 'not-used-in-tests', newPassword: 'NuevaSegura2026' },
    });
    expect(res.statusCode).toBe(200);

    // El hash en la DB ya no matchea la vieja password
    const { rows } = await testPool.query('SELECT password FROM users WHERE id = $1', [user.id]);
    expect(await bcrypt.compare('not-used-in-tests', rows[0].password)).toBe(false);
    expect(await bcrypt.compare('NuevaSegura2026', rows[0].password)).toBe(true);

    // Login REAL con la nueva password contra la app completa
    const loginNew = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'NuevaSegura2026' },
    });
    expect(loginNew.statusCode).toBe(200);

    // Login con la vieja password → 401
    const loginOld = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'not-used-in-tests' },
    });
    expect(loginOld.statusCode).toBe(401);
  });

  it('el cambio de password NO afecta a otros usuarios', async () => {
    const alice = await createUserWithHashedPassword();
    const bob = await createUserWithHashedPassword();

    await inject('PATCH', '/auth/me/password', {
      token: tokenFor(alice.id, 'OPERATOR'),
      payload: { currentPassword: 'not-used-in-tests', newPassword: 'AliceNueva2026' },
    });

    // Bob sigue con su password original
    const loginBob = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: bob.email, password: 'not-used-in-tests' },
    });
    expect(loginBob.statusCode).toBe(200);
  });
});