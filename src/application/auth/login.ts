import bcrypt from 'bcryptjs';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import type { TokenGateway } from '../../domain/interfaces/token-gateway';
import { InvalidCredentialsError, AccountDeactivatedError } from '../../domain/auth-errors';

// Hash bcrypt PRECOMPUTADO de un password fantasma (cost 12, el MISMO de
// producción — ver domain/auth.ts): se usa solo cuando el email no existe.
// bcrypt.compare contra él gasta el mismo tiempo que contra un hash real, así
// el atacante NO puede distinguir "email inexistente" de "password incorrecta"
// midiendo latencias (timing side channel → enumeración de cuentas).
// Precomputado a mano (generado en runtime una vez): cero costo al boot.
const DUMMY_PASSWORD_HASH =
  '$2b$12$sG6sxRiYUabh4occ5NibMeCQMxHMKpbL0d2mjY1VRucXXicETRUx2';

export class Login {
  constructor(
    private userRepository: UserRepository,
    private tokenGateway: TokenGateway,
  ) {}

  async execute(email: string, password: string): Promise<string> {
    const user = await this.userRepository.findByEmail(email);

    // SIEMPRE pasamos por bcrypt.compare: sin usuario → hash dummy. Las dos
    // ramas (email inexistente vs password incorrecta) gastan el mismo costo
    // de cómputo y solo se diferencian después del compare.
    const valid = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      throw new InvalidCredentialsError();
    }

    // Cuenta desactivada (soft-disable): no puede iniciar sesión, pero su
    // historial queda intacto. Solo se evalúa con credenciales válidas para
    // no filtrar el estado de la cuenta a terceros.
    if (!user.active) {
      throw new AccountDeactivatedError();
    }

    const token = this.tokenGateway.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return token;
  }
}