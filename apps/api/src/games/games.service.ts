import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateGameDto } from './dto/create-game.dto';
import {
  AppendGameMessageInput,
  GameChatMessage,
  GamePlayer,
  GameState,
  PlayerJoinResult,
} from './domain/game.types';

const PENDING_GAMES_KEY = 'games:pending';
const MAX_PLAYERS = 2;
const GAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class GamesService {
  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async createGame(dto: CreateGameDto, user: AuthUser): Promise<PlayerJoinResult> {
    const code = await this.generateUniqueCode();
    const now = new Date().toISOString();
    const host: GamePlayer = {
      id: user.id,
      name: user.username,
      isHost: true,
      joinedAt: now,
    };

    const game: GameState = {
      code,
      status: 'pending',
      gameType: dto.gameType ?? 'BOMBER',
      hostPlayerId: host.id,
      players: [host],
      messages: [],
      createdAt: now,
    };

    await this.saveGame(game);
    await this.redisService.getClient().sadd(PENDING_GAMES_KEY, code);

    return { game, player: host };
  }

  async getPendingGames(): Promise<GameState[]> {
    const redis = this.redisService.getClient();
    const codes = await redis.smembers(PENDING_GAMES_KEY);

    if (codes.length === 0) {
      return [];
    }

    const rawGames = await redis.mget(codes.map((code) => this.getGameKey(code)));

    return rawGames
      .map((rawGame) => (rawGame ? this.parseGame(rawGame) : null))
      .filter((game): game is GameState => game?.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getGame(code: string): Promise<GameState | null> {
    const rawGame = await this.redisService
      .getClient()
      .get(this.getGameKey(this.normalizeCode(code)));

    return rawGame ? this.parseGame(rawGame) : null;
  }

  async getGameOrThrow(code: string): Promise<GameState> {
    const game = await this.getGame(code);

    if (!game) {
      throw new NotFoundException('Partida no encontrada');
    }

    return game;
  }

  async getGameForUser(code: string, userId: string): Promise<GameState> {
    const game = await this.getGameOrThrow(code);
    if (!game.players.some((player) => player.id === userId)) {
      throw new NotFoundException('Partida no encontrada');
    }
    return game;
  }

  async joinGame(code: string, user: AuthUser): Promise<PlayerJoinResult> {
    const game = await this.getGameOrThrow(code);

    if (game.status !== 'pending') {
      throw new BadRequestException('La partida ya fue iniciada');
    }

    if (game.players.length >= MAX_PLAYERS) {
      throw new BadRequestException('La partida ya esta completa');
    }

    if (game.players.some((candidate) => candidate.id === user.id)) {
      throw new BadRequestException('Ya estas en esta partida');
    }

    const player: GamePlayer = {
      id: user.id,
      name: user.username,
      isHost: false,
      joinedAt: new Date().toISOString(),
    };

    const updatedGame: GameState = {
      ...game,
      players: [...game.players, player],
    };

    await this.saveGame(updatedGame);

    return { game: updatedGame, player };
  }

  async startGame(code: string, userId: string): Promise<GameState> {
    const game = await this.getGameOrThrow(code);

    if (game.status !== 'pending') {
      throw new BadRequestException('La partida ya fue iniciada');
    }

    if (game.hostPlayerId !== userId) {
      throw new BadRequestException('Solo el anfitrion puede iniciar la partida');
    }

    if (game.players.length < MAX_PLAYERS) {
      throw new BadRequestException('Se necesitan dos jugadores para iniciar');
    }

    const startedGame: GameState = {
      ...game,
      status: 'started',
      startedAt: new Date().toISOString(),
    };

    await this.saveGame(startedGame);
    await this.redisService.getClient().srem(PENDING_GAMES_KEY, startedGame.code);
    await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const history = await transaction.gameHistory.create({
        data: {
          code: startedGame.code,
          hostPlayerId: startedGame.hostPlayerId,
          hostName:
            startedGame.players.find((player) => player.isHost)?.name ?? 'Host',
          players: JSON.parse(JSON.stringify(startedGame.players)),
          startedAt: new Date(startedGame.startedAt ?? startedGame.createdAt),
        },
      });
      await transaction.gameParticipant.createMany({
        data: startedGame.players.map((player) => ({
          gameId: history.id,
          userId: player.id,
          username: player.name,
          isHost: player.isHost,
        })),
      });
    });

    return startedGame;
  }

  async appendMessage(
    input: AppendGameMessageInput,
  ): Promise<GameChatMessage> {
    const game = await this.getGameOrThrow(input.gameCode);

    if (game.status !== 'started') {
      throw new BadRequestException('La partida todavia no inicio');
    }

    const player = game.players.find(
      (candidate) => candidate.id === input.playerId,
    );

    if (!player) {
      throw new BadRequestException('El jugador no pertenece a esta partida');
    }

    const content = input.content.trim();

    if (!content) {
      throw new BadRequestException('El mensaje no puede estar vacio');
    }

    if (content.length > 300) {
      throw new BadRequestException('El mensaje no puede superar 300 caracteres');
    }

    const message: GameChatMessage = {
      id: randomUUID(),
      gameCode: game.code,
      playerId: player.id,
      playerName: player.name,
      content,
      createdAt: new Date().toISOString(),
    };

    await this.saveGame({
      ...game,
      messages: [...game.messages, message],
    });

    await this.prisma.gameMessage.create({
      data: {
        id: message.id,
        gameCode: message.gameCode,
        playerId: message.playerId,
        playerName: message.playerName,
        content: message.content,
        createdAt: new Date(message.createdAt),
      },
    });

    return message;
  }

  async getHistory(userId: string) {
    return this.prisma.gameHistory.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { startedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async getHistoryByCode(code: string, userId: string) {
    const history = await this.prisma.gameHistory.findUnique({
      where: {
        code: this.normalizeCode(code),
        participants: { some: { userId } },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!history) {
      throw new NotFoundException('Historial no encontrado');
    }

    return history;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Array.from({ length: 6 }, () =>
        GAME_CODE_ALPHABET.charAt(
          Math.floor(Math.random() * GAME_CODE_ALPHABET.length),
        ),
      ).join('');

      const exists = await this.redisService
        .getClient()
        .exists(this.getGameKey(code));

      if (!exists) {
        return code;
      }
    }

    throw new ServiceUnavailableException('No se pudo generar codigo de partida');
  }

  private async saveGame(game: GameState): Promise<void> {
    await this.redisService
      .getClient()
      .set(this.getGameKey(game.code), JSON.stringify(game));
  }

  private getGameKey(code: string): string {
    return `game:${this.normalizeCode(code)}`;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private parseGame(rawGame: string): GameState {
    return JSON.parse(rawGame) as GameState;
  }

  async saveArenaPositions(gameCode: string, arenaState: unknown): Promise<void> {
    await this.redisService
      .getClient()
      .set(
        `game:${this.normalizeCode(gameCode)}:positions`,
        JSON.stringify(arenaState),
        'EX',
        3600,
      );
  }

  async getArenaPositions(code: string) {
    const raw = await this.redisService
      .getClient()
      .get(`game:${this.normalizeCode(code)}:positions`);
    return raw ? JSON.parse(raw) : null;
  }
}
