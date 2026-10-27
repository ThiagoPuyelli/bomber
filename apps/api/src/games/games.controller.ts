import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateGameDto } from './dto/create-game.dto';
import { GamesGateway } from './games.gateway';
import { GamesService } from './games.service';

@Controller('games')
@UseGuards(AuthGuard)
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly gamesGateway: GamesGateway,
  ) {}

  @Post()
  createGame(@Body() dto: CreateGameDto, @CurrentUser() user: AuthUser) {
    return this.gamesService.createGame(dto, user);
  }

  @Get('pending')
  getPendingGames() {
    return this.gamesService.getPendingGames();
  }

  @Get(':code')
  getGame(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    return this.gamesService.getGameForUser(code, user.id);
  }

  @Post(':code/join')
  joinGame(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    return this.gamesService.joinGame(code, user);
  }

  @Post(':code/start')
  async startGame(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    const game = await this.gamesService.startGame(code, user.id);
    this.gamesGateway.notifyGameStarted(game);
    return game;
  }
}
