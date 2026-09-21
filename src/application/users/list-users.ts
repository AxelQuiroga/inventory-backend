import type { UserRepository } from '../../domain/interfaces/user-repository';
import { UserRole, type User } from '../../domain/entities/user';

export class ListUsers {
  constructor(private repository: UserRepository) {}

  execute(): Promise<Omit<User, 'password'>[]> {
    return this.repository.findAll().then((users) =>
      // El ADMIN único es intocable (USERS_POLICY.MD) y NO se gestiona desde
      // la lista: solo se listan roles gestionables por el administrador.
      users
        .filter((user) => user.role !== UserRole.ADMIN)
        .map(({ password: _, ...userWithoutPassword }) => userWithoutPassword),
    );
  }
}