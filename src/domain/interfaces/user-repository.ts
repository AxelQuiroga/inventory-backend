import type { User } from '../entities/user';

export interface UserRepository {
  create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  updateActive(id: string, active: boolean): Promise<User | null>;
  updatePassword(id: string, password: string): Promise<User | null>;
}