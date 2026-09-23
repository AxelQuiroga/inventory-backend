// Levanta el backend real (Fastify + TEST DB) como proceso del browser e2e.
// Se ejecuta con `tsx` (script standalone): el frontend NO importa código del
// backend (eso degradaría el typecheck cruzado con erasableSyntaxOnly), así
// que esta orquestación va por proceso hijo + healthcheck HTTP.
import '../src/infrastructure/database/test-e2e-env';

// El side effect de arriba YA reescribió DATABASE_URL → la TEST DB antes de
// que cualquier módulo cree su pool (mismo truco que test-e2e-env.ts).
import { buildE2eApp, closeE2eApp, resetE2eDb } from '../src/infrastructure/database/test-e2e-utils';

const host = process.env.E2E_HOST ?? '127.0.0.1';
const port = Number(process.env.E2E_PORT ?? 3210);

const app = await buildE2eApp();
await resetE2eDb(); // usuarios admin/operator/viewer con bcrypt real
await app.listen({ host, port });
console.log(`[e2e-server] listening on http://${host}:${port}`);

async function shutdown() {
  await closeE2eApp(app);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);