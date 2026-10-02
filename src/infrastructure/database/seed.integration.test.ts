import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// El seed usa el pool real: lo apuntamos a la TEST DB (mismo patrón que los
// otros tests de integración). El guard isMain de seed.ts no corre porque
// process.argv[1] es el runner de Vitest, no el archivo del seed.
vi.mock('./index', async () => {
  const { testDb } = await import('./test-db');
  return { db: testDb };
});

import { runSeed } from './seed';
import { verifyTestDbIsReady, resetTestDb } from './test-utils';
import { closeTestDb, testPool } from './test-db';

beforeAll(async () => {
  await verifyTestDbIsReady();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb(); // users vacío antes de cada prueba
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function passwordOf(email: string): Promise<string | null> {
  const { rows } = await testPool.query('SELECT password FROM users WHERE email = $1', [email]);
  return rows.length > 0 ? (rows[0].password as string) : null;
}

describe('Seed — rotación de credenciales (regresión del bug admin123)', () => {
  it('falla con mensaje claro si falta SEED_ADMIN_PASSWORD (fail-fast)', async () => {
    await expect(runSeed()).rejects.toThrow('SEED_ADMIN_PASSWORD es OBLIGATORIA');
    // Nada se escribió en la DB
    const { rows } = await testPool.query('SELECT COUNT(*)::int AS n FROM users');
    expect(rows[0].n).toBe(0);
  });

  it('falla si SEED_ADMIN_PASSWORD tiene menos de 8 caracteres', async () => {
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'corta');
    await expect(runSeed()).rejects.toThrow('al menos 8 caracteres');
  });

  it('crea admin (password de la env) y demo viewer público en base vacía', async () => {
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'Admin-Fuerte-2026!');
    await runSeed();

    const adminHash = await passwordOf('admin@inventory.com');
    expect(adminHash).not.toBeNull();
    expect(await bcrypt.compare('Admin-Fuerte-2026!', adminHash!)).toBe(true);
    expect(await bcrypt.compare('admin123', adminHash!)).toBe(false);

    // Admin con rol ADMIN y activo
    const { rows: adminRows } = await testPool.query(
      'SELECT role, active FROM users WHERE email = $1',
      ['admin@inventory.com'],
    );
    expect(adminRows[0].role).toBe('ADMIN');
    expect(adminRows[0].active).toBe(true);

    // Demo público: rol VIEWER (solo lectura) y password documentada
    const demoHash = await passwordOf('demo@inventory.com');
    expect(demoHash).not.toBeNull();
    expect(await bcrypt.compare('demo1234', demoHash!)).toBe(true);
    const { rows: demoRows } = await testPool.query(
      'SELECT role FROM users WHERE email = $1',
      ['demo@inventory.com'],
    );
    expect(demoRows[0].role).toBe('VIEWER');
  });

  it('ROTA la password del admin existente al correr con otra SEED_ADMIN_PASSWORD (el bug original)', async () => {
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'Primera-Pass-2026!');
    await runSeed();

    vi.stubEnv('SEED_ADMIN_PASSWORD', 'Segunda-Pass-2026!');
    await runSeed(); // idempotente sobre el MISMO email

    const adminHash = await passwordOf('admin@inventory.com');
    expect(adminHash).not.toBeNull();
    expect(await bcrypt.compare('Segunda-Pass-2026!', adminHash!)).toBe(true);
    expect(await bcrypt.compare('Primera-Pass-2026!', adminHash!)).toBe(false);

    // Un solo admin, sin duplicados (onConflictDoUpdate, no insert)
    const { rows } = await testPool.query(
      'SELECT COUNT(*)::int AS n FROM users WHERE email = $1',
      ['admin@inventory.com'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('demo viewer es onConflictDoNothing: si ya existe, no pisa su estado', async () => {
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'Admin-Fuerte-2026!');
    await runSeed();

    // El demo ya existe y tiene password documentada; un segundo seed no lo pisa
    const hashBefore = await passwordOf('demo@inventory.com');
    await runSeed();
    const hashAfter = await passwordOf('demo@inventory.com');
    expect(hashAfter).toBe(hashBefore);
  });
});