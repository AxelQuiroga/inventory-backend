import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Repositorios → TEST DB (mismo patrón que auth-routes.integration.test.ts)
vi.mock('../../infrastructure/database', async () => {
  const { testDb } = await import('../../infrastructure/database/test-db');
  return { db: testDb };
});

// Env del rate limit ACTIVADO con un techo chico para el test (3 intentos):
// probar el 429 sin disparar 10 requests reales.
const JWT_SECRET = 'rate-limit-test-secret-0123456789abcdef';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_MAX = '3';

import { buildApp } from '../../app';
import { verifyTestDbIsReady, resetTestDb } from '../../infrastructure/database/test-utils';
import { closeTestDb } from '../../infrastructure/database/test-db';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  await verifyTestDbIsReady();
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

describe('Rate limit en POST /auth/login', () => {
  it('permite hasta RATE_LIMIT_MAX intentos y responde 429 a partir del siguiente (misma IP)', async () => {
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nobody@rate-limit.test', password: 'wrong' },
      });

    for (let i = 0; i < 3; i++) {
      const res = await attempt();
      // Cuenta TODOS los requests entrantes, no solo los fallidos: los 3
      // primeros pasan (401 por credenciales inventadas)…
      expect(res.statusCode).not.toBe(429);
    }

    // …y el 4to en la misma ventana de 15 min es cortado por IP.
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
  });
});