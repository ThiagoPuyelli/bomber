import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, AuthUser } from './auth.service';

export interface AuthenticatedRequest {
  headers: { cookie?: string; authorization?: string };
  user: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.authService.getRequestToken(request);
    if (!token) throw new UnauthorizedException('Iniciá sesión para continuar');
    request.user = this.authService.verifyToken(token);
    return true;
  }
}
