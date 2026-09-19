import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

// Cierre ordenado del pool (usado por los tests E2E para que el proceso
// de Vitest termine sin handles abiertos). El bootstrap productivo no lo usa.
export async function closeDb() {
  await pool.end();
}