import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Los tests de integración y E2E corren aparte (requieren una DB de test):
    // npm run test:integration / npm run test:e2e
    exclude: ['src/**/*.integration.test.ts', 'src/**/*.e2e.test.ts'],
  },
});