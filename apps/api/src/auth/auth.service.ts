import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

const COOKIE_NAME = 'bomber_session';
const TOKEN_TTL_SECONDS = 60 * 60;
const SCRYPT_OPTIONS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, SCRYPT_OPTIONS, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
}

interface AccessTokenClaims {
  sub: string;
  username: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  token_use: 'access';
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.getJwtSecret();
  }

  async register(dto: RegisterDto): Promise<AuthUser> {
    const username = dto.username.trim().toLowerCase();
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(dto.password);

    try {
      return await this.prisma.user.create({
        data: { username, email, passwordHash },
        select: { id: true, username: true, email: true },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('El usuario o correo ya está registrado');
      }
      throw error;
    }
  }

  async validateLogin(dto: LoginDto): Promise<AuthUser> {
    const login = dto.login.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: login.toLowerCase() },
          { username: { equals: login, mode: 'insensitive' } },
        ],
      },
    });

    const valid = user ? await this.verifyPassword(dto.password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    return { id: user.id, username: user.username, email: user.email };
  }

  issueToken(user: AuthUser): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      sub: user.id,
      username: user.username,
      iss: 'bomber-real-api',
      aud: 'bomber-real-web',
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      token_use: 'access',
    };
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encode(claims);
    const unsigned = `${header}.${payload}`;
    const signature = createHmac('sha256', this.getJwtSecret())
      .update(unsigned)
      .digest('base64url');
    return `${unsigned}.${signature}`;
  }

  verifyToken(token: string): AuthUser {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed token');
      const [encodedHeader, encodedPayload, signature] = parts;
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as {
        alg?: string;
        typ?: string;
      };
      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        throw new Error('Unexpected token type');
      }

      const unsigned = `${encodedHeader}.${encodedPayload}`;
      const expected = createHmac('sha256', this.getJwtSecret())
        .update(unsigned)
        .digest();
      const actual = Buffer.from(signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new Error('Invalid signature');
      }

      const claims = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString(),
      ) as Partial<AccessTokenClaims>;
      const now = Math.floor(Date.now() / 1000);
      if (
        typeof claims.sub !== 'string' ||
        typeof claims.username !== 'string' ||
        claims.iss !== 'bomber-real-api' ||
        claims.aud !== 'bomber-real-web' ||
        claims.token_use !== 'access' ||
        typeof claims.exp !== 'number' ||
        claims.exp <= now ||
        typeof claims.iat !== 'number' ||
        claims.iat > now + 30 ||
        claims.exp - claims.iat > TOKEN_TTL_SECONDS
      ) {
        throw new Error('Invalid claims');
      }
      return { id: claims.sub, username: claims.username };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }

  getRequestToken(request: { headers?: { cookie?: string; authorization?: string } }): string | null {
    const authorization = request.headers?.authorization;
    if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
    const cookie = request.headers?.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${COOKIE_NAME}=`));
    if (!cookie) return null;
    try {
      return decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
    } catch {
      return null;
    }
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') !== 'development',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: TOKEN_TTL_SECONDS * 1000,
    };
  }

  cookieName(): string {
    return COOKIE_NAME;
  }

  private getJwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new Error('JWT_SECRET debe contener al menos 32 bytes aleatorios');
    }
    return secret;
  }

  private encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await deriveKey(password, salt, 64);
    return `${salt.toString('base64url')}.${derivedKey.toString('base64url')}`;
  }

  private async verifyPassword(password: string, encodedHash: string): Promise<boolean> {
    const [saltEncoded, hashEncoded] = encodedHash.split('.');
    if (!saltEncoded || !hashEncoded) return false;
    const salt = Buffer.from(saltEncoded, 'base64url');
    const expected = Buffer.from(hashEncoded, 'base64url');
    const actual = await deriveKey(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
