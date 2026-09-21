import { z } from 'zod';

// Params de rutas de gestión de usuarios: id UUID (igual que productParams).
export const userParamsSchema = z.object({
  id: z.string().uuid(),
});