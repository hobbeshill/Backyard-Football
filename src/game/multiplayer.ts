import { io, Socket } from 'socket.io-client';

export interface PlayerInfo {
  id: string;
  name: string;
  teamId: string;
  ready: boolean;
}

export interface LobbyRoom {
  code: string;
  host: PlayerInfo;
  guest: PlayerInfo | null;
  started: boolean;
  createdAt: number;
}

export interface MatchStartPayload {
  code: string;
  hostTeamId: string;
  guestTeamId: string;
  hostName: string;
  guestName: string;
}

let socketInstance: Socket | null = null;

export function getMultiplayerSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  }
  return socketInstance;
}

export function createLobby(
  name: string,
  teamId: string
): Promise<{ success: boolean; lobby?: LobbyRoom; error?: string }> {
  const socket = getMultiplayerSocket();
  return new Promise((resolve) => {
    socket.emit('lobby:create', { name, teamId }, (res: any) => {
      resolve(res || { success: false, error: 'Failed to create lobby' });
    });
  });
}

export function joinLobby(
  code: string,
  name: string,
  teamId: string
): Promise<{ success: boolean; lobby?: LobbyRoom; error?: string }> {
  const socket = getMultiplayerSocket();
  return new Promise((resolve) => {
    socket.emit('lobby:join', { code, name, teamId }, (res: any) => {
      resolve(res || { success: false, error: 'Failed to join lobby' });
    });
  });
}

export function setLobbyTeam(teamId: string): void {
  const socket = getMultiplayerSocket();
  socket.emit('lobby:team', teamId);
}

export function setLobbyReady(ready: boolean): void {
  const socket = getMultiplayerSocket();
  socket.emit('lobby:ready', ready);
}

export function startOnlineMatch(): void {
  const socket = getMultiplayerSocket();
  socket.emit('lobby:start');
}

export function sendGameAction(action: any): void {
  const socket = getMultiplayerSocket();
  socket.emit('game:action', action);
}

export function sendGameInput(input: any): void {
  const socket = getMultiplayerSocket();
  socket.emit('game:input', input);
}

export function sendGameSync(gameState: any): void {
  const socket = getMultiplayerSocket();
  socket.emit('game:sync', gameState);
}

export function leaveLobby(): void {
  if (socketInstance) {
    socketInstance.emit('lobby:leave');
  }
}
