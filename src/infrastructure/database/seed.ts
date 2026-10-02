import bcrypt from 'bcryptjs';
import { db } from './index';
import { users, UserRole } from './schema/users';
import { BCRYPT_ROUNDS } from '../../domain/auth';

// Seed idempotente + rotación REAL de credenciales.
//
// Regla de oro (post-incidente de seguridad): el admin NUNCA se crea con una
// password hardcodeada o por defecto. La password del admin la gobierna
// SIEMPRE la variable SEED_ADMIN_PASSWORD del entorno:
//   - Si el admin NO existe → se crea con esa password.
//   - Si el admin YA existe (producción) → SU PASSWORD SE ROTA a la nueva,
//     aunque el email ya esté en la base (onConflictDoUpdate). Rotar la
//     password del admin en producción = setear SEED_ADMIN_PASSWORD nueva y
//     redeployar con SEED=true (después volver a SEED=false).
//
// La cuenta demo (demo@inventory.com / rol VIEWER) es la VITRINA pública del
// portfolio: password DOCUMENTADA a propósito (demo1234, no es secreto) y rol
// de SOLO LECTURA (no puede crear productos, registrar movimientos ni tocar
// usuarios). El seed la crea con onConflictDoNothing para no pisarla si ya
// existe ni rotarla en cada deploy: es una cuenta estable y pública.

const ADMIN_EMAIL = 'admin@inventory.com';
const DEMO_EMAIL = 'demo@inventory.com';
const DEMO_PASSWORD = 'demo1234'; // pública y documentada: es la cuenta de vitrina

export async function runSeed() {
  console.log('🌱 Seeding database...');

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD es OBLIGATORIA: el seed nunca crea el admin con una ' +
        'password por defecto (riesgo de credenciales publicadas). Definila en el ' +
        'entorno antes de correr el seed.',
    );
  }
  if (adminPassword.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres.');
  }

  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? DEMO_PASSWORD;

  const hashedAdminPassword = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
  const hashedDemoPassword = await bcrypt.hash(demoPassword, BCRYPT_ROUNDS);

  // Admin con rotación: si ya existe, se actualiza la password (y el
  // updatedAt). El target es el email (único en el schema) — acá vive la
  // corrección del bug original: onConflictDoNothing() hacía que cambiar el
  // seed NO rotara al admin ya creado en producción.
  const [admin] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      password: hashedAdminPassword,
      name: 'Administrator',
      role: UserRole.ADMIN,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        password: hashedAdminPassword,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (admin) {
    console.log('✅ Admin user ready:', admin.email);
  }

  // Demo público, solo creado si no existe (vitrina estable, no se rota).
  const [demo] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      password: hashedDemoPassword,
      name: 'Demo Viewer',
      role: UserRole.VIEWER,
    })
    .onConflictDoNothing()
    .returning();

  if (demo) {
    console.log('✅ Demo viewer created:', demo.email, `/ password pública: ${demoPassword}`);
  } else {
    console.log('ℹ️  Demo viewer already exists');
  }

  console.log('🌱 Seeding complete');
}

// NOTA: este módulo NO tiene entrypoint propio a propósito. El CLI vive en
// seed-cli.ts (process.exit incluido): esbuild NO soporta import.meta.url en
// formato CJS (lo deja vacío), así que un guard "isMain" acá rompería el seed
// en el Dockerfile. Módulo puro = testable.
//
// CLI: npm run db:seed (tsx seed-cli.ts) o node out/seed.cjs en el Dockerfile.