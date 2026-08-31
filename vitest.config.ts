import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Los tests de integración corren aparte (requieren una DB de test):
    // npm run test:integration
    exclude: ['src/**/*.integration.test.ts'],
  },
});