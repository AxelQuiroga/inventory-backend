import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Aplica las migraciones versionadas (src/infrastructure/database/migrations)
// de forma programática, SIN drizzle-kit (devDependency): el runtime de
// producción (imagen Docker, node + bundles de esbuild) no lleva devDeps.
//
// Este script corre en el entrypoint del contenedor ANTES de levantar el
// server. El folder de migraciones se copia a ./migrations en la imagen.
// Para el uso local con tsx seguir usando `npm run db:migrate` (drizzle-kit).
dotenv.config();

async function runMigrations() {
  console.log('📦 Applying migrations...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: './migrations' });

  console.log('✅ Migrations applied');
  await pool.end();
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});