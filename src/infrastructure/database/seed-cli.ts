// Entrypoint del seed (CLI). Separado del módulo runSeed() a propósito:
// esbuild en formato CJS (Dockerfile) deja import.meta.url vacío, así que un
// guard "isMain" dentro de seed.ts rompería la ejecución del seed en
// producción. Este archivo es el wrapper explícito: corre runSeed() y hace el
// process.exit con el código que corresponda.
//
// Uso: npm run db:seed (tsx) o node out/seed.cjs (Dockerfile, bundleado).
import { runSeed } from './seed';

runSeed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });