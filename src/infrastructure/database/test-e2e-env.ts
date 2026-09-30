import dotenv from 'dotenv';
dotenv.config();

import { getTestDatabaseUrl } from './test-db-url';

// dotenv.config() no pisa variables ya definidas en el proceso, por lo que
// setear DATABASE_URL aquí garantiza que TODOS los módulos (repositorios,
// helpers) usen la test DB durante los E2E. Sin vi.mock: pools reales
// apuntando a inventory_system_test.
process.env.DATABASE_URL = getTestDatabaseUrl();

// Los e2e hacen MUCHOS logins legítimos desde la misma IP de Vitest: el rate
// limit encriptado a 10/15min los rompería. El comportamiento del limitador
// se cubre con un integration test dedicado (límite bajo explícito).
process.env.RATE_LIMIT_ENABLED = 'false';

// La app real exige JWT_SECRET (>= 32 chars) al boot. Un .env local cubre el
// dev, pero el CI y cualquier entorno sin .env fallarían con ZodError si esto
// dependiera del archivo: ??= fuerza un secreto de TEST determinista sin pisar
// el definido por .env o por el entorno del job (mismo patrón que arriba).
process.env.JWT_SECRET ??= 'e2e-test-secret-0123456789abcdef0123456789abcdef';
