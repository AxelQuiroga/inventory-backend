import type { JwtService, TokenPayload } from '../infrastructure/auth/jwt-service';

// Augmentation de Fastify sin @fastify/jwt: el JwtService (jsonwebtoken) se
// decora en la instancia (buildApp) y el middleware authenticate lo usa para
// verificar. request.user queda tipado con el payload firmado, sin casts.
declare module 'fastify' {
  interface FastifyInstance {
    jwtService: JwtService;
  }
  interface FastifyRequest {
    user: TokenPayload;
  }
}