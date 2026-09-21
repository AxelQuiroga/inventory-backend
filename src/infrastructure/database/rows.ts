// Drizzle devuelve arrays en select/insert/update ... returning, y el
// tsconfig tiene noUncheckedIndexedAccess: true: desestructurar siempre da
// `T | undefined`, aunque Postgres garantice otra cardinalidad. Estas
// envolturas recuperan el contrato real para que el dominio vea `T` en vez
// de `T | undefined`, sin repartir non-null assertions por el código.
export function expectOne<T>(rows: T[], what: string): T {
  const [row] = rows;
  if (!row) {
    throw new Error(`Expected one ${what} but got none`);
  }
  return row;
}