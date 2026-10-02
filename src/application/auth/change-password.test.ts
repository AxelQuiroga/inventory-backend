import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { ChangePassword } from './change-password';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import { UserRole, type User } from '../../domain/entities/user';
import { CurrentPasswordMismatchError, InvalidCredentialsError } from '../../domain/auth-errors';

const user: User = {
  id: 'user-1',
  email: 'admin@example.com',
  password: bcrypt.hashSync('password123', 10),
  name: 'Admin',
  role: UserRole.ADMIN,
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

let updatedPassword: string | undefined;

const userRepository: UserRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findAll: vi.fn(),
  updateActive: vi.fn(),
  updatePassword: vi.fn().mockImplementation(async (id: string, password: string) => {
    updatedPassword = password;
    return { ...user, password };
  }),
};

const useCase = new ChangePassword(userRepository);

beforeEach(() => {
  vi.clearAllMocks();
  updatedPassword = undefined;
});

describe('ChangePassword', () => {
  it('cambia la password con currentPassword correcta (hasheada, no expuesta)', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(user);

    await useCase.execute('user-1', 'password123', 'new-password-2026');

    expect(userRepository.updatePassword).toHaveBeenCalledWith('user-1', updatedPassword);
    expect(updatedPassword).toBeDefined();
    expect(updatedPassword).not.toBe('new-password-2026');
    expect(bcrypt.compareSync('new-password-2026', updatedPassword!)).toBe(true);
  });

  it('lanza CurrentPasswordMismatchError (no InvalidCredentialsError) con password actual incorrecta', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(user);

    await expect(useCase.execute('user-1', 'wrong-password', 'new-password-2026')).rejects.toBeInstanceOf(
      CurrentPasswordMismatchError,
    );
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('lanza InvalidCredentialsError si el userId no existe (token corrupto)', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);

    await expect(useCase.execute('ghost-user', 'password123', 'new-password-2026')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });
});