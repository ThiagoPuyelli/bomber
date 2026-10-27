import type { AuthUser, GameHistory, GameState, PlayerJoinResult } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(errorBody?.message)
      ? errorBody.message.join(', ')
      : errorBody?.message;

    throw new Error(message ?? `Error HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function register(username: string, email: string, password: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export function login(login: string, password: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  });
}

export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me');
}

export function logout(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
}

export function createGame(): Promise<PlayerJoinResult> {
  return request<PlayerJoinResult>('/games', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getPendingGames(): Promise<GameState[]> {
  return request<GameState[]>('/games/pending');
}

export function getGame(code: string): Promise<GameState> {
  return request<GameState>(`/games/${code}`);
}

export function joinGame(code: string): Promise<PlayerJoinResult> {
  return request<PlayerJoinResult>(`/games/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function startGame(code: string): Promise<GameState> {
  return request<GameState>(`/games/${code}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getHistory(): Promise<GameHistory[]> {
  return request<GameHistory[]>('/history');
}
