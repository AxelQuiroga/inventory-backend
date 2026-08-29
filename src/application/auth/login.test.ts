import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { Login } from './login';
import { JwtService } from '../../infrastructure/auth/jwt-service';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import { UserRole, type User } from '../../domain/entities/user';

const user: User = {
  id: 'user-1',
  email: 'admin@example.com',
  password: bcrypt.hashSync('password123', 10),
  name: 'Admin',
  role: UserRole.ADMIN,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const userRepository: UserRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findAll: vi.fn(),
};

const jwtService = new JwtService('test-secret');
const useCase = new Login(userRepository, jwtService);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Login', () => {
  it('devuelve un token JWT válido con credenciales correctas', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(user);

    const token = await useCase.execute('admin@example.com', 'password123');

    expect(token).toBeTypeOf('string');
    const payload = jwtService.verify(token);
    expect(payload.userId).toBe('user-1');
    expect(payload.email).toBe('admin@example.com');
    expect(payload.role).toBe('ADMIN');
  });

  it('lanza error con password incorrecta', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(user);

    await expect(useCase.execute('admin@example.com', 'wrong-password')).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('lanza error cuando el email no existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

    await expect(useCase.execute('nobody@example.com', 'password123')).rejects.toThrow(
      'Invalid credentials',
    );
  });
});