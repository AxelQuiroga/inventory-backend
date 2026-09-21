import { randomUUID } from 'node:crypto';
import { testDb, testPool } from './test-db';
import { TEST_DB_NAME } from './test-db-url';
import { users, UserRole } from './schema/users';
import { products } from './schema/products';

// --- Setup / teardown ---

export async function verifyTestDbIsReady() {
  // Comprueba que la test DB exista y tenga el esquema esperado (columna active).
  const res = await testPool.query(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'active'`,
  );
  if (res.rowCount === 0) {
    throw new Error(
      `Database "${TEST_DB_NAME}" is not ready. Run "npm run db:push:test" first (and make sure the database exists).`,
    );
  }
}

export async function resetTestDb() {
  await testPool.query('TRUNCATE TABLE movements, products, users RESTART IDENTITY CASCADE');
}

// --- Fixtures ---

export async function createUser(role: UserRole = UserRole.OPERATOR) {
  const [user] = await testDb
    .insert(users)
    .values({
      email: `user-${randomUUID()}@test.local`,
      password: 'not-used-in-tests',
      name: 'Test User',
      role,
    })
    .returning();

  if (!user) throw new Error('Failed to create test user');
  return user;
}

export async function createProduct(overrides: Partial<typeof products.$inferInsert> = {}) {
  const [product] = await testDb
    .insert(products)
    .values({
      name: 'Test Product',
      sku: `SKU-${randomUUID()}`,
      category: 'Test',
      price: '10.00',
      ...overrides,
    })
    .returning();

  if (!product) throw new Error('Failed to create test product');
  return product;
}