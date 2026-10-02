// Errores de dominio TIPADOS: el controller los mapea a respuestas HTTP por
// instancia (instanceof), NO por comparar `error.message === '...'`. Cambiar
// el texto de un error ya no puede romper el contrato de la API en silencio,
// y el switch por tipo arroja error de compilación si falta una rama.
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// Credenciales inválidas (email inexistente o password incorrecta): la MISMA
// respuesta y el MISMO mensaje para ambos casos, para no filtrar qué emails
// existen. La distinción de tiempo de cómputo la elimina el dummy hash del
// caso de uso (login.ts).
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid credentials');
  }
}

// Cuenta desactivada por un admin: mensaje DISTINTO a propósito (decisión de
// producto) — solo se emite cuando la password ya fue válida, así que solo
// puede verlo alguien que ya conoce las credenciales. UX real para el usuario
// legítimo > ocultación marginal.
export class AccountDeactivatedError extends DomainError {
  constructor() {
    super('ACCOUNT_DEACTIVATED', 'User is deactivated');
  }
}

export class EmailAlreadyRegisteredError extends DomainError {
  constructor() {
    super('EMAIL_ALREADY_REGISTERED', 'Email already registered');
  }
}

// Cambio de password con currentPassword que no coincide con el hash real:
// 401 en el endpoint, igual que un login fallido. Tipo PROPIO a propósito —
// no reutilizar InvalidCredentialsError acá, porque ese contrato está atado a
// /auth/login y su mensaje genérico "Invalid credentials" confundiría a un
// usuario legítimo que escribió mal su password actual (quiere saber cuál de
// los dos campos está mal).
export class CurrentPasswordMismatchError extends DomainError {
  constructor() {
    super('CURRENT_PASSWORD_MISMATCH', 'Current password is incorrect');
  }
}