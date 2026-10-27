import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { CurrentUser } from './current-user.decorator';

interface CookieResponse {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options: object): void;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const user = await this.authService.register(dto);
    response.cookie(
      this.authService.cookieName(),
      this.authService.issueToken(user),
      this.authService.cookieOptions(),
    );
    return user;
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const user = await this.authService.validateLogin(dto);
    response.cookie(
      this.authService.cookieName(),
      this.authService.issueToken(user),
      this.authService.cookieOptions(),
    );
    return user;
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getCurrentUser(@CurrentUser() user: { id: string; username: string }) {
    return user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: CookieResponse) {
    response.clearCookie(this.authService.cookieName(), {
      httpOnly: true,
      secure: this.authService.cookieOptions().secure,
      sameSite: 'strict',
      path: '/',
    });
    return { success: true };
  }
}
