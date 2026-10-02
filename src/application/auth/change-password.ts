import bcrypt from 'bcryptjs';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import { BCRYPT_ROUNDS } from '../../domain/auth';
import { InvalidCredentialsError, CurrentPasswordMismatchError } from '../../domain/auth-errors';

// Cambio de password del usuario AUTENTICADO. Política:
//  - currentPassword se verifica con bcrypt contra el hash almacenado (nunca
//    en claro, nunca por comparación string).
//  - El usuario ya viene identificado por el JWT (preHandler authenticate), así
//    que NO corre timing-attack: no hay enumeración posible acá (el email y la
//    identidad ya son conocidos por el propio dueño del token).
//  - Si la currentPassword no matchea se lanza CurrentPasswordMismatchError
//    (401 con mensaje claro), NO InvalidCredentialsError: quien recibe este
//    error es el legítimo dueño de la cuenta, no un atacante.
export class ChangePassword {
  constructor(private userRepository: UserRepository) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      // Token con userId inexistente (secret rotado o user borrado a mano):
      // mismo error genérico que login para no dar información.
      throw new InvalidCredentialsError();
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      throw new CurrentPasswordMismatchError();
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userRepository.updatePassword(userId, hashedPassword);
  }
}