import { eq } from 'drizzle-orm';
import { db } from '../database';
import { users } from '../database/schema/users';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import type { User } from '../../domain/entities/user';

export class DrizzleUserRepository implements UserRepository {

  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const [created] = await db
      .insert(users)
      .values({
        email: data.email,
        password: data.password,
        name: data.name,
        role: data.role,
      })
      .returning();

    return this.toDomain(created);
  }

  async findById(id: string): Promise<User | null> {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));

    return found ? this.toDomain(found) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    return found ? this.toDomain(found) : null;
  }

  async findAll(): Promise<User[]> {
    const results = await db.select().from(users);
    return results.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as User['role'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}