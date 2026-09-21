import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { inArray } from 'drizzle-orm';
import { testDb, testPool, closeTestDb } from './test-db';
import { resetTestDb, verifyTestDbIsReady } from './test-utils';
import { users, UserRole } from './schema/users';
import { closeDb } from './index';

// La app se construye con Fastify real y pools reales apuntando a la test DB:
// el setup file (test-e2e-env.ts) reescribe DATABASE_URL antes de que los
// módulos importen su pool, así que NO hay ningún vi.mock en los E2E.
export async function buildE2eApp(): Promise<FastifyInstance> {
  await verifyTestDbIsReady();
  // Import diferido: app.ts debe evaluarse DESPUÉS de que el setup file
  // haya reescrito DATABASE_URL.
  const { buildApp } = await import('../../app');
  return buildApp();
}

export async function closeE2eApp(app: FastifyInstance) {
  await app.close();
  // Cierra también los pools de la app y de la test DB para que el proceso
  // de Vitest termine sin handles abiertos.
  await closeDb();
  await closeTestDb();
}

export interface E2eUser {
  id: string;
  email: string;
  password: string;
}

export interface E2eCredentials {
  admin: E2eUser;
  operator: E2eUser;
  viewer: E2eUser;
}

// Resetea la test DB y deja creados los tres usuarios con contraseñas
// hasheadas (bcrypt real). Un solo set compartido por archivo: cada test se
// aísla con sus propios datos (SKUs/emails únicos). Incluye los ids para que
// los tests de gestión de usuarios puedan apuntar a cuentas reales.
export async function resetE2eDb(): Promise<E2eCredentials> {
  await resetTestDb();

  const password = await bcrypt.hash('admin123', 10);
  await testDb
    .insert(users)
    .values([
      { email: 'admin@inventory.com', password, name: 'Admin', role: UserRole.ADMIN },
      { email: 'operator@inventory.com', password, name: 'Operator', role: UserRole.OPERATOR },
      { email: 'viewer@inventory.com', password, name: 'Viewer', role: UserRole.VIEWER },
    ])
    .onConflictDoNothing();

  const rows = await testDb
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      inArray(users.email, [
        'admin@inventory.com',
        'operator@inventory.com',
        'viewer@inventory.com',
      ]),
    );
  const byEmail = new Map(rows.map((r) => [r.email, r.id]));

  return {
    admin: {
      id: byEmail.get('admin@inventory.com')!,
      email: 'admin@inventory.com',
      password: 'admin123',
    },
    operator: {
      id: byEmail.get('operator@inventory.com')!,
      email: 'operator@inventory.com',
      password: 'admin123',
    },
    viewer: {
      id: byEmail.get('viewer@inventory.com')!,
      email: 'viewer@inventory.com',
      password: 'admin123',
    },
  };
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}

// --- Fixtures de dominio vía HTTP (el contrato público es lo que se testea) ---

let skuCounter = 0;
export function uniqueSku(prefix = 'E2E') {
  skuCounter += 1;
  return `${prefix}-${Date.now()}-${skuCounter}-${Math.floor(Math.random() * 1e6)}`;
}

export interface CreatedProduct {
  id: string;
  sku: string;
}

export async function createProductViaApi(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedProduct> {
  const sku = uniqueSku();
  const res = await app.inject({
    method: 'POST',
    url: '/products',
    headers: authHeader(token),
    payload: {
      name: 'E2E Product',
      sku,
      category: 'E2E',
      price: 10,
      ...overrides,
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createProductViaApi failed (${res.statusCode}): ${res.body}`);
  }
  const body = JSON.parse(res.body);
  return { id: body.id, sku };
}

export { testDb, testPool };
