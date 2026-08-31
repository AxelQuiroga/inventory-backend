import { defineConfig } from 'drizzle-kit';
import { getTestDatabaseUrl } from './src/infrastructure/database/test-db-url';

export default defineConfig({
  schema: './src/infrastructure/database/schema/*',
  out: './src/infrastructure/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: getTestDatabaseUrl(),
  },
});