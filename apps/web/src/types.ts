export type GameStatus = 'pending' | 'started';

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
}

export interface GamePlayer {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}

export interface GameChatMessage {
  id: string;
  gameCode: string;
  playerId: string;
  playerName: string;
  content: string;
  createdAt: string;
}

export interface GameState {
  code: string;
  status: GameStatus;
  hostPlayerId: string;
  players: GamePlayer[];
  messages: GameChatMessage[];
  createdAt: string;
  startedAt?: string;
}

export interface PlayerJoinResult {
  game: GameState;
  player: GamePlayer;
}

export interface GameHistory {
  id: string;
  code: string;
  status: string;
  hostPlayerId: string;
  hostName: string;
  players: GamePlayer[];
  startedAt: string;
  endedAt?: string;
  messages: GameChatMessage[];
}

export interface BombState {
  id: string;
  gameCode: string;
  playerId: string;
  col: number;
  row: number;
  placedAt: number;
  detonatesAt: number;
  range: number;
}

export interface ExplosionCell {
  col: number;
  row: number;
}

export type PowerUpType = 'BOMB_UP' | 'FIRE_UP';

export interface PowerUp {
  id: string;
  col: number;
  row: number;
  type: PowerUpType;
}

export interface PowerUpCollectedPayload {
  playerId: string;
  type: PowerUpType;
  maxBombs: number;
  bombRange: number;
  powerUpId: string;
}

export interface PlayerPosition {
  playerId: string;
  playerName: string;
  isHost: boolean;
  col?: number;
  row?: number;
  x?: number;
  y?: number;
  color?: string;
  alive?: boolean;
  maxBombs?: number;
  bombRange?: number;
  lastUpdated?: string;
}

export interface GameArenaState {
  gameCode: string;
  cols: number;
  rows: number;
  tileSize: number;
  width: number;
  height: number;
  matrix: number[][]; // 0=empty, 1=wall, 2=box
  bombs: Record<string, BombState>;
  explosions: ExplosionCell[];
  powerUps?: Record<string, PowerUp>;
  players: Record<string, PlayerPosition>;
  gameOver: boolean;
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
}

export type MoveDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

