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
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const userRepository: UserRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findAll: vi.fn(),
  updateActive: vi.fn(),
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

  it('ejecuta bcrypt.compare contra un hash dummy cuando el email no existe (anti timing attack)', async () => {
    // La defensa contra el side channel es COMPORTAMIENTAL: con email
    // inexistente TIENE que haber pasado por bcrypt (contra el dummy), como
    // con un usuario real. No se mide latencia (flaky): se espiá la llamada.
    // El espía: los types de @types/bcryptjs (^2.x, callbacks) difieren del
    // runtime v3 (promesas) y el spy infiere el overload con void; el false
    // documenta el resultado que producimos para esta rama.
    const compareSpy = vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

    await expect(useCase.execute('nobody@example.com', 'password123')).rejects.toThrow(
      'Invalid credentials',
    );

    expect(compareSpy).toHaveBeenCalledTimes(1);
    // El dummy debe tener EXACTAMENTE el costo de producción ($2b$12$): si no,
    // la rama inexistente volvería a diferenciarse por tiempo.
    const hashArgument = compareSpy.mock.calls[0]![1];
    expect(hashArgument).toMatch(/^\$2b\$12\$/);
    compareSpy.mockRestore();
  });

  it('lanza error cuando la cuenta está desactivada (aunque la password sea válida)', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue({ ...user, active: false });

    await expect(useCase.execute('admin@example.com', 'password123')).rejects.toThrow(
      'User is deactivated',
    );
  });
});