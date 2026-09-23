// Contrato oficial de paginación del sistema: todo listado paginado
// (GET /products, GET /movements, GET /movements/history/:productId)
// devuelve { data, total } — los consumidores nunca adivinan si hay
// más páginas mirando el largo del array.
export interface Paginated<T> {
  data: T[];
  total: number;
}