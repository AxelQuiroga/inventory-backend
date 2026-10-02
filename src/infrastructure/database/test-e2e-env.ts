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

// La app real exige JWT_SECRET (>= 32 chars) al boot. Este módulo NO depende de
// que exista un .env: el fallback de abajo se encarga SIEMPRE de dejar un
// secreto válido para los e2e.
//
// Semántica REAL del fallback (no "sin pisar el de .env"): se aplica cuando
// JWT_SECRET falta, está vacío o mide menos de 32 chars. Un valor presente pero
// inválido —venga de .env o del entorno del job— se REEMPLAZA a propósito: el
// objetivo es un secreto de e2e determinista, no respetar el del dev. La
// alternativa (respetar el valor existente) haría que los e2e fallen por un
// .env local mal configurado en la máquina de quien los corre.
// OJO (ver review adversarial 2026-09-30): .env.example trae JWT_SECRET=
// (vacío) y dotenv.config() copia ese '' al proceso aunque la cláve no esté;
// por eso el chequeo es de existencia Y longitud mínima, no un ??= (que solo
// cubre undefined).
//
// Orden de los guards (importante): dotenv.config() corre ANTES de este chequeo
// (línea 2), así que el valor de .env ya está cargado cuando se decide el
// fallback. Y antes todavía está getTestDatabaseUrl() (línea 10), que tira si
// no hay DATABASE_URL: este módulo REQUIERE DATABASE_URL —en CI la inyecta el
// job, en local el .env— y eso es intencional, no un accidente.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'e2e-test-secret-0123456789abcdef0123456789abcdef';
}
