import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    // Los E2E comparten la misma test DB: los archivos corren en serie y
    // cada test se aísla con datos propios (SKUs/emails únicos).
    fileParallelism: false,
    // setupFiles corre en el MISMO proceso que cada test file, ANTES de que
    // se resuelvan sus imports: reescribe DATABASE_URL hacia la test DB, así
    // los pools reales de la app apuntan a inventory_system_test sin mocks.
    setupFiles: ['src/infrastructure/database/test-e2e-env.ts'],
  },
});
