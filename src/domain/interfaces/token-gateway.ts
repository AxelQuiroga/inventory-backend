// Port de emisión/verificación de tokens (DIP): el caso de uso Login depende
// de ESTA abstracción, no del JwtService concreto (jsonwebtoken). El dominio
// define el contrato; la infraestructura lo implementa. Si mañana cambia la
// lib de JWT, solo cambia la implementación, nunca Login.
export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface TokenGateway {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}