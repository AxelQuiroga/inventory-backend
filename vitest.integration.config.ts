import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // Los archivos corren en serie: comparten la misma test DB y se truncan
    // entre pruebas. El paralelismo aquí pisaría datos entre suites.
    fileParallelism: false,
  },
});