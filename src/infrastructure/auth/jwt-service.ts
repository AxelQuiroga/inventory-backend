import jwt from '@fastify/jwt';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export class JwtService {
  constructor(private secret: string) {}

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: '24h' });
  }

  verify(token: string): TokenPayload {
    return jwt.verify(token, this.secret) as TokenPayload;
  }
}