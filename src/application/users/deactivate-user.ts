import type { UserRepository } from '../../domain/interfaces/user-repository';
import { UserRole, type User } from '../../domain/entities/user';

export class DeactivateUser {
  constructor(private repository: UserRepository) {}

  async execute(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    // Regla dura: ningún flujo backend puede desactivar al ADMIN único.
    if (user.role === UserRole.ADMIN) {
      throw new Error('Cannot manage ADMIN user');
    }

    const updated = await this.repository.updateActive(id, false);
    if (!updated) {
      throw new Error('User not found');
    }

    const { password: _, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }
}