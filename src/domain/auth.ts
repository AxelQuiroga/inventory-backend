// Política de seguridad del dominio: costo del hashing de contraseñas.
// 12 rounds es el estándar moderno de bcrypt (OWASP). Vive en dominio para
// que application (register/login) e infrastructure (seed/e2e) compartan el
// MISMO costo: si el dummy hash del timing attack tuviera un costo distinto
// al de los hashes reales, la protección se cae por un side channel.
export const BCRYPT_ROUNDS = 12;