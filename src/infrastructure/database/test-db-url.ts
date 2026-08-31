import dotenv from 'dotenv';
dotenv.config();

// La base de TEST usa las mismas credenciales que la de desarrollo,
// solo cambia el nombre de la base (inventory_system → inventory_system_test).
// Así NO se duplica ningún secreto y el .env queda intacto.
export const TEST_DB_NAME = 'inventory_system_test';

export function getTestDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    throw new Error('DATABASE_URL is required to derive the test database URL');
  }
  const url = new URL(devUrl);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}