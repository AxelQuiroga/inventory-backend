import bcrypt from 'bcryptjs';
import type { UserRepository } from '../../domain/interfaces/user-repository';
import type { JwtService } from '../../infrastructure/auth/jwt-service';

export class Login {
  constructor(
    private userRepository: UserRepository,
    private jwtService: JwtService,
  ) {}

  async execute(email: string, password: string): Promise<string> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    // Cuenta desactivada (soft-disable): no puede iniciar sesión, pero su
    // historial queda intacto. El mensaje se emite solo con credenciales
    // válidas para no filtrar el estado de la cuenta a terceros.
    if (!user.active) {
      throw new Error('User is deactivated');
    }

    const token = this.jwtService.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return token;
  }
}