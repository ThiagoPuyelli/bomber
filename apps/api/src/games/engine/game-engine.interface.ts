import { GameArenaState, GameState } from '../domain/game.types';

export interface GameEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface MoveResult {
  moved: boolean;
  events: GameEvent[];
}

export interface ActionResult {
  accepted: boolean;
  events: GameEvent[];
}

export interface ExplodeResult {
  events: GameEvent[];
}

export interface IGameEngine {
  readonly gameType: string;

  initArena(game: GameState): GameArenaState;
  resetArena(arena: GameArenaState): void;
  handleMove(
    arena: GameArenaState,
    playerId: string,
    direction: string,
  ): MoveResult;
  handleAction(
    arena: GameArenaState,
    playerId: string,
    action: string,
  ): ActionResult;
  handleRematch(arena: GameArenaState): GameEvent[];
}
