import jwt from 'jsonwebtoken';
import type { TokenGateway } from '../../domain/interfaces/token-gateway';
import type { TokenPayload } from '../../domain/interfaces/token-gateway';

// Re-export para no romper a los consumidores previos del tipo (fastify.d.ts,
// tests): el contrato vive ahora en domain/interfaces/token-gateway.ts.
export type { TokenPayload } from '../../domain/interfaces/token-gateway';

// Implementación concreta del port TokenGateway usando jsonwebtoken. La única
// clase del sistema que conoce la lib de JWT.
export class JwtService implements TokenGateway {
  constructor(private secret: string) {}

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: '24h' });
  }

  verify(token: string): TokenPayload {
    return jwt.verify(token, this.secret) as TokenPayload;
  }
}