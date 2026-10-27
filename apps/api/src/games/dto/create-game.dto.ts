import { IsIn, IsOptional } from 'class-validator';
import { GameType } from '../domain/game.types';

export class CreateGameDto {
  @IsOptional()
  @IsIn(['BOMBER'])
  gameType?: GameType;
}
