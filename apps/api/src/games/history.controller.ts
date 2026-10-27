import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { GamesService } from './games.service';

@Controller('history')
@UseGuards(AuthGuard)
export class HistoryController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  getHistory(@CurrentUser() user: AuthUser) {
    return this.gamesService.getHistory(user.id);
  }

  @Get(':code')
  getHistoryByCode(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    return this.gamesService.getHistoryByCode(code, user.id);
  }
}
