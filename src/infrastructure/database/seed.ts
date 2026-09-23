import bcrypt from 'bcryptjs';
import { db } from './index';
import { users, UserRole } from './schema/users';
import { BCRYPT_ROUNDS } from '../../domain/auth';

async function seed() {
  console.log('🌱 Seeding database...');

  const hashedPassword = await bcrypt.hash('admin123', BCRYPT_ROUNDS);

  const [admin] = await db
    .insert(users)
    .values({
      email: 'admin@inventory.com',
      password: hashedPassword,
      name: 'Administrator',
      role: UserRole.ADMIN,
    })
    .onConflictDoNothing()
    .returning();

  if (admin) {
    console.log('✅ Admin user created:', admin.email);
  } else {
    console.log('ℹ️  Admin user already exists');
  }

  console.log('🌱 Seeding complete');
  process.exit(0);
}

seed().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});