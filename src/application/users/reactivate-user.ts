import type { UserRepository } from '../../domain/interfaces/user-repository';
import { UserRole, type User } from '../../domain/entities/user';

export class ReactivateUser {
  constructor(private repository: UserRepository) {}

  async execute(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    // El ADMIN nunca se desactiva, por lo tanto tampoco se reactiva.
    if (user.role === UserRole.ADMIN) {
      throw new Error('Cannot manage ADMIN user');
    }

    const updated = await this.repository.updateActive(id, true);
    if (!updated) {
      throw new Error('User not found');
    }

    const { password: _, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }
}