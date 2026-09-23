import type { TokenGateway, TokenPayload } from '../domain/interfaces/token-gateway';

// Augmentation de Fastify sin @fastify/jwt: el TokenGateway (jsonwebtoken via
// JwtService) se decora en la instancia (buildApp) y el middleware authenticate
// lo usa para verificar. request.user queda tipado con el payload firmado, sin
// casts. El tipo es el PORT del dominio, no la implementación concreta.
declare module 'fastify' {
  interface FastifyInstance {
    jwtService: TokenGateway;
  }
  interface FastifyRequest {
    user: TokenPayload;
  }
}