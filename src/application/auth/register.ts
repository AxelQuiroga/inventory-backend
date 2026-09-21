import bcrypt from 'bcryptjs';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import { UserRole, type User } from '../../domain/entities/user';

export class Register {
  constructor(private userRepository: UserRepository) {}

  async execute(data: {
    email: string;
    password: string;
    name: string;
    role?: User['role'];
  }): Promise<Omit<User, 'password'>> {
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.userRepository.create({
      email: data.email,
      password: hashedPassword,
      name: data.name,
      role: data.role ?? UserRole.VIEWER,
      active: true,
    });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}