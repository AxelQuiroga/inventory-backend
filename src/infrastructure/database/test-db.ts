import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { getTestDatabaseUrl } from './test-db-url';

// Conexión dedicada a la base de TEST (sin riesgo de tocar la DB de desarrollo).
// El pool se cierra con closeTestDb() en afterAll de los tests de integración.
const pool = new pg.Pool({
  connectionString: getTestDatabaseUrl(),
  max: 10, // Necesario para los tests de concurrencia real
});

export const testDb = drizzle(pool, { schema });

// Para los tests de concurrencia: ejecutar en paralelo en conexiones propias
export const testPool = pool;

let closed = false;

export async function closeTestDb() {
  if (closed) return;
  closed = true;
  await pool.end();
}