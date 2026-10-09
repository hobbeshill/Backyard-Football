import { io, type Socket } from 'socket.io-client';

export interface LobbyPlayer {
  name: string;
  teamId: string;
  ready: boolean;
}

export interface OnlineLobby {
  code: string;
  host: LobbyPlayer;
  guest: LobbyPlayer | null;
  started: boolean;
}

export type LobbyRole = 'host' | 'guest';
export type MultiplayerSocket = Socket;

export interface LobbyActionResult {
  ok: boolean;
  lobby?: OnlineLobby;
  role?: LobbyRole;
  error?: string;
}

export function connectToLobbyServer(): MultiplayerSocket {
  return io(location.origin, {
    path: '/socket.io',
    transports: ['websocket']
  });
}

export function createLobby(
  socket: MultiplayerSocket,
  name: string,
  teamId: string
): Promise<LobbyActionResult> {
  return new Promise((resolve, reject) => socket.timeout(8000).emit('lobby:create', { name, teamId }, (error: Error | null, result: LobbyActionResult) => error ? reject(error) : resolve(result)));
}

export function joinLobby(
  socket: MultiplayerSocket,
  code: string,
  name: string,
  teamId: string
): Promise<LobbyActionResult> {
  return new Promise((resolve, reject) => socket.timeout(8000).emit('lobby:join', { code, name, teamId }, (error: Error | null, result: LobbyActionResult) => error ? reject(error) : resolve(result)));
}