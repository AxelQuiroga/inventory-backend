import { z } from 'zod';

// Entorno validado al boot (fail-fast). La app NO arranca con config inválida:
// si falta JWT_SECRET o es débil, DATABASE_URL es inválida, etc., el proceso
// muere con un mensaje claro en vez de explotar en el primer request.
//
// OJO con el timing del parse: loadEnv() se evalúa dentro de buildApp(), NO al
// importar este módulo. Los tests setean process.env a mano ANTES de llamar
// buildApp() (patrón de auth-routes.integration.test.ts); un parse en module
// scope rompería ese orden y con él toda la suite de integración.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // El servidor escucha en este puerto (index.ts lo usa para listen).
  PORT: z.coerce.number().int().positive().default(3000),

  // Mínimo 32 chars: un secreto corto derrota la firma HMAC por fuerza bruta
  // y convierte cualquier token filtrado en una sesión falsificable.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET is required and must be at least 32 characters'),

  // Requerida en TODOS los entornos: el pool de repositorios no arranca sin
  // ella. Los tests de integración que mockean el módulo de base de datos
  // setean una URL fake para satisfacer el contrato (no se usa).
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Allowlist de orígenes permitidos, separados por coma (sin espacios).
  // El default cubre el dev del frontend (vite: 5173) y el e2e de Playwright
  // (vite forzado a 127.0.0.1:4310), tanto por localhost como por IPv4.
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4310,http://127.0.0.1:4310',
    )
    .transform((origins) => origins.split(',').map((o) => o.trim()).filter(Boolean)),

  // Rate limiting del login. Se desactiva en los setups de e2e (muchos logins
  // legítimos desde la "misma IP" de Vitest); el comportamiento real se
  // cubre con un test de integración dedicado con límite bajo.
  RATE_LIMIT_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),

  // Intentos de login permitidos por IP dentro de la ventana (15 minutos).
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}