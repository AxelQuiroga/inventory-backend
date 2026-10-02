import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { Register } from './register';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import { UserRole, type User } from '../../domain/entities/user';

const existingUser: User = {
  id: 'user-1',
  email: 'taken@example.com',
  password: bcrypt.hashSync('password123', 10),
  name: 'Existente',
  role: UserRole.VIEWER,
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

let savedData: Omit<User, 'id' | 'createdAt' | 'updatedAt'> | undefined;

const userRepository: UserRepository = {
  create: vi.fn().mockImplementation(async (data) => {
    savedData = data;
    const user: User = {
      id: 'user-2',
      ...data,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
    };
    return user;
  }),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findAll: vi.fn(),
  updateActive: vi.fn(),
  updatePassword: vi.fn(),
};

const useCase = new Register(userRepository);

beforeEach(() => {
  vi.clearAllMocks();
  savedData = undefined;
});

describe('Register', () => {
  it('registra el usuario con password hasheada y rol por defecto VIEWER', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      email: 'new@example.com',
      password: 'password123',
      name: 'Nuevo',
    });

    expect(userRepository.create).toHaveBeenCalledTimes(1);
    expect(savedData?.role).toBe('VIEWER');
    expect(savedData?.active).toBe(true);
    expect(savedData?.email).toBe('new@example.com');
    expect(savedData?.password).not.toBe('password123');
    expect(bcrypt.compareSync('password123', savedData!.password)).toBe(true);

    // No expone el password en la respuesta
    expect(result).not.toHaveProperty('password');
    expect(result.email).toBe('new@example.com');
  });

  it('respeta el rol explícito cuando se pasa', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

    await useCase.execute({
      email: 'new@example.com',
      password: 'password123',
      name: 'Nuevo',
      role: UserRole.OPERATOR,
    });

    expect(savedData?.role).toBe(UserRole.OPERATOR);
  });

  it('lanza error cuando el email ya está registrado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(existingUser);

    await expect(
      useCase.execute({
        email: 'taken@example.com',
        password: 'password123',
        name: 'Duplicado',
      }),
    ).rejects.toThrow('Email already registered');

    expect(userRepository.create).not.toHaveBeenCalled();
  });
});