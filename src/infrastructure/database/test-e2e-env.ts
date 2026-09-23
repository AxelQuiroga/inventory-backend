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
