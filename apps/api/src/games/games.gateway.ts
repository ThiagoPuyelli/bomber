import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GamesService } from './games.service';
import {
  GameArenaState,
  GameState,
  PlayerBombSocketPayload,
  PlayerMoveSocketPayload,
} from './domain/game.types';
import { IGameEngine, GameEvent, createGameEngine } from './engine';
import { AuthService, AuthUser } from '../auth/auth.service';

interface JoinGameSocketPayload {
  gameCode?: string;
  playerId?: string;
}

interface ChatSocketPayload {
  gameCode?: string;
  playerId?: string;
  content?: string;
}

function getRoomName(gameCode: string): string {
  return `game:${gameCode}`;
}

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
})
export class GamesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly arenaMemory = new Map<string, GameArenaState>();
  private readonly engines = new Map<string, IGameEngine>();
  private readonly explosionTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly gamesService: GamesService,
    private readonly authService: AuthService,
  ) {}

  handleConnection(client: Socket): void {
    const token = this.authService.getRequestToken({
      headers: { cookie: client.handshake.headers.cookie },
    });
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const user = this.authService.verifyToken(token);
      client.data.user = user;
    } catch {
      client.disconnect(true);
      return;
    }
    client.data.connectedAt = new Date().toISOString();
  }

  handleDisconnect(client: Socket): void {
    const gameCode = client.data.gameCode;
    const playerId = client.data.playerId;

    if (gameCode && playerId) {
      this.server.to(getRoomName(gameCode)).emit('game:player_disconnected', {
        playerId,
      });
    }
  }

  @SubscribeMessage('game:join')
  async joinGameRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinGameSocketPayload,
  ): Promise<void> {
    const gameCode = payload.gameCode?.trim().toUpperCase();
    const user = client.data.user as AuthUser | undefined;
    const playerId = user?.id;

    if (!gameCode || !playerId) {
      throw new WsException('Iniciá sesión y seleccioná una partida');
    }

    const game = await this.getGameForSocket(gameCode);

    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new WsException('El jugador no pertenece a esta partida');
    }

    client.data.gameCode = game.code;
    client.data.playerId = player.id;
    await client.join(getRoomName(game.code));

    const arena = this.getOrInitArena(game);

    client.emit('game:joined', { game, player, arena });
    this.server.to(getRoomName(game.code)).emit('game:positions', arena);
    this.server.to(getRoomName(game.code)).emit('game:player_joined', {
      game,
      player,
    });
  }

  @SubscribeMessage('player:move')
  async handlePlayerMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PlayerMoveSocketPayload,
  ): Promise<void> {
    const gameCode = client.data.gameCode as string | undefined;
    const playerId = client.data.playerId;

    if (!gameCode || !playerId) {
      throw new WsException('Primero tenes que unirte a una partida');
    }

    let arena = this.arenaMemory.get(gameCode);
    if (!arena) {
      const game = await this.getGameForSocket(gameCode);
      arena = this.getOrInitArena(game);
    }

    if (arena.gameOver) return;

    const engine = this.getEngine(gameCode);
    const direction = payload.direction || payload.key || '';
    const result = engine.handleMove(arena, playerId, direction);

    if (result.moved) {
      this.emitEvents(gameCode, result.events);
      this.server.to(getRoomName(gameCode)).emit('game:positions', arena);
    }
  }

  @SubscribeMessage('game:input')
  async handleGameInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PlayerMoveSocketPayload,
  ): Promise<void> {
    return this.handlePlayerMove(client, payload);
  }

  @SubscribeMessage('player:bomb')
  async handlePlayerBomb(
    @ConnectedSocket() client: Socket,
    @MessageBody() _payload?: PlayerBombSocketPayload,
  ): Promise<void> {
    const gameCode = client.data.gameCode as string | undefined;
    const playerId = client.data.playerId;

    if (!gameCode || !playerId) {
      throw new WsException('Primero tenes que unirte a una partida');
    }

    let arena = this.arenaMemory.get(gameCode);
    if (!arena) {
      const game = await this.getGameForSocket(gameCode);
      arena = this.getOrInitArena(game);
    }

    if (arena.gameOver) return;

    const engine = this.getEngine(gameCode);
    const result = engine.handleAction(arena, playerId, 'bomb');

    if (result.accepted) {
      this.emitEvents(gameCode, result.events);
      this.server.to(getRoomName(gameCode)).emit('game:positions', arena);

      const bombEvent = result.events.find((e) => e.type === 'bomb:placed');
      if (bombEvent) {
        const bomb = bombEvent.payload.bomb as { id: string };
        this.scheduleExplosion(gameCode, bomb.id, engine);
      }
    }
  }

  @SubscribeMessage('bomb:place')
  async handleBombPlace(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: PlayerBombSocketPayload,
  ): Promise<void> {
    return this.handlePlayerBomb(client, payload);
  }

  @SubscribeMessage('game:rematch')
  async handleRematch(
    @ConnectedSocket() client: Socket,
    @MessageBody() _payload?: { gameCode?: string },
  ): Promise<void> {
    const gameCode = client.data.gameCode as string | undefined;
    if (!gameCode) return;

    const arena = this.arenaMemory.get(gameCode);
    if (!arena) return;

    const engine = this.getEngine(gameCode);
    engine.resetArena(arena);

    this.server.to(getRoomName(gameCode)).emit('game:rematch_started', arena);
    this.server.to(getRoomName(gameCode)).emit('game:positions', arena);
  }

  @SubscribeMessage('game:get_positions')
  async handleGetPositions(
    @ConnectedSocket() client: Socket,
    @MessageBody() _payload?: { gameCode?: string },
  ): Promise<void> {
    const gameCode = client.data.gameCode as string | undefined;

    if (!gameCode) return;

    let arena = this.arenaMemory.get(gameCode);
    if (!arena) {
      const game = await this.getGameForSocket(gameCode);
      arena = this.getOrInitArena(game);
    }

    client.emit('game:positions', arena);
  }

  @SubscribeMessage('chat:send')
  async sendChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatSocketPayload,
  ): Promise<void> {
    const gameCode = client.data.gameCode as string | undefined;
    const playerId = client.data.playerId;
    const content = payload.content ?? '';

    if (!gameCode || !playerId) {
      throw new WsException('Primero tenes que unirte a una partida');
    }

    const message = await this.appendMessageForSocket(gameCode, playerId, content);

    this.server.to(getRoomName(message.gameCode)).emit('chat:message', message);
  }

  notifyGameStarted(game: GameState): void {
    const arena = this.getOrInitArena(game);
    this.server.to(getRoomName(game.code)).emit('game:started', game);
    this.server.to(getRoomName(game.code)).emit('game:positions', arena);
  }

  async persistPositionsToRedis(gameCode: string): Promise<void> {
    const arena = this.arenaMemory.get(gameCode);
    if (!arena) return;

    try {
      await this.gamesService.saveArenaPositions(gameCode, arena);
    } catch {
      // Non-blocking in-memory fallback
    }
  }

  private emitEvents(gameCode: string, events: GameEvent[]): void {
    const room = getRoomName(gameCode);
    for (const event of events) {
      this.server.to(room).emit(event.type, event.payload);
    }
  }

  private scheduleExplosion(
    gameCode: string,
    bombId: string,
    engine: IGameEngine,
  ): void {
    const key = `${gameCode}:${bombId}`;

    const timer = setTimeout(() => {
      this.explosionTimers.delete(key);
      const arena = this.arenaMemory.get(gameCode);
      if (!arena || arena.gameOver) return;

      const bomberEngine = engine as import('./engine/bomber-game.engine').BomberGameEngine;
      const result = bomberEngine.explodeBomb(gameCode, arena, bombId);

      this.emitEvents(gameCode, result.events);
      this.server.to(getRoomName(gameCode)).emit('game:positions', arena);

      const explosionEvent = result.events.find((e) => e.type === 'bomb:exploded');
      if (explosionEvent) {
        const cells = explosionEvent.payload.explosions as Array<{ col: number; row: number }>;
        this.scheduleExplosionClear(gameCode, cells);
      }
    }, 2400);

    this.explosionTimers.set(key, timer);
  }

  private scheduleExplosionClear(
    gameCode: string,
    cells: Array<{ col: number; row: number }>,
  ): void {
    const engine = this.getEngine(gameCode);
    const bomberEngine = engine as import('./engine/bomber-game.engine').BomberGameEngine;
    const duration = bomberEngine.getExplosionDuration();

    setTimeout(() => {
      const currentArena = this.arenaMemory.get(gameCode);
      if (currentArena) {
        bomberEngine.clearExplosions(currentArena, cells);
        this.server
          .to(getRoomName(gameCode))
          .emit('game:positions', currentArena);
      }
    }, duration);
  }

  private getEngine(gameCode: string): IGameEngine {
    let engine = this.engines.get(gameCode);
    if (!engine) {
      engine = createGameEngine('BOMBER');
      this.engines.set(gameCode, engine);
    }
    return engine;
  }

  private getOrInitArena(game: GameState): GameArenaState {
    let arena = this.arenaMemory.get(game.code);

    if (!arena) {
      const engine = this.getEngine(game.code);
      arena = engine.initArena(game);
      this.arenaMemory.set(game.code, arena);
    }

    game.players.forEach((p) => {
      if (!arena.players[p.id]) {
        const isHost = p.isHost;
        const config = isHost
          ? { col: 1, row: 1 }
          : { col: 13, row: 9 };

        arena.players[p.id] = {
          playerId: p.id,
          playerName: p.name,
          isHost: p.isHost,
          col: config.col,
          row: config.row,
          alive: true,
          maxBombs: 1,
          bombRange: 1,
          lastUpdated: new Date().toISOString(),
        };
      }
    });

    return arena;
  }

  private async getGameForSocket(gameCode: string) {
    try {
      return await this.gamesService.getGameOrThrow(gameCode);
    } catch (error) {
      throw new WsException(this.getErrorMessage(error));
    }
  }

  private async appendMessageForSocket(
    gameCode: string,
    playerId: string,
    content: string,
  ) {
    try {
      return await this.gamesService.appendMessage({
        gameCode,
        playerId,
        content,
      });
    } catch (error) {
      throw new WsException(this.getErrorMessage(error));
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Error en websocket';
  }
}
