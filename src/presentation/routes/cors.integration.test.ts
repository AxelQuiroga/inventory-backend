import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../infrastructure/database', async () => {
  const { testDb } = await import('../../infrastructure/database/test-db');
  return { db: testDb };
});

process.env.JWT_SECRET = 'cors-test-secret-0123456789abcdef';
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
process.env.RATE_LIMIT_ENABLED = 'false';
// La allowlist de CORS se fija ACÁ (no depende del .env del desarrollador):
// vitest inyecta el .env local y CORS_ORIGINS definida ahí pisaría este test.
process.env.CORS_ORIGINS = 'http://localhost:5173';

import { buildApp } from '../../app';
import { closeTestDb } from '../../infrastructure/database/test-db';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

// El allowlist se define en buildApp() (env.CORS_ORIGINS). Estos tests
// verifican el CONTRATO observable: origin permitido → echo; foráneo → nada
// (sin header, el navegador bloquea la lectura de la respuesta).
const ALLOWED_ORIGIN = 'http://localhost:5173';

describe('CORS con allowlist', () => {
  it('responde con Access-Control-Allow-Origin cuando el origin está en la allowlist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('NO emite headers CORS para origins foráneos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight OPTIONS de un origin permitido devuelve los métodos y headers permitidos', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, authorization',
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
  });
});