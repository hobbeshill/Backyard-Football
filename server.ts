import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

interface PlayerInfo {
  id: string;
  name: string;
  teamId: string;
  ready: boolean;
}

interface LobbyRoom {
  code: string;
  host: PlayerInfo;
  guest: PlayerInfo | null;
  started: boolean;
  createdAt: number;
}

const lobbies = new Map<string, LobbyRoom>();
const socketToRoom = new Map<string, string>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket: Socket) => {
  // Create a new lobby with a 6-character invite code
  socket.on('lobby:create', (payload: { name: string; teamId: string }, callback?: (res: any) => void) => {
    let code = generateRoomCode();
    while (lobbies.has(code)) {
      code = generateRoomCode();
    }

    const hostPlayer: PlayerInfo = {
      id: socket.id,
      name: (payload?.name || 'Player 1').slice(0, 20),
      teamId: payload?.teamId || 'ALABAMA',
      ready: true
    };

    const newLobby: LobbyRoom = {
      code,
      host: hostPlayer,
      guest: null,
      started: false,
      createdAt: Date.now()
    };

    lobbies.set(code, newLobby);
    socketToRoom.set(socket.id, code);
    socket.join(code);

    if (callback) {
      callback({ success: true, lobby: newLobby });
    }
  });

  // Join existing lobby with code
  socket.on('lobby:join', (payload: { code: string; name: string; teamId: string }, callback?: (res: any) => void) => {
    const rawCode = (payload?.code || '').trim().toUpperCase();
    const lobby = lobbies.get(rawCode);

    if (!lobby) {
      if (callback) callback({ success: false, error: 'Lobby code not found. Please check and try again.' });
      return;
    }

    if (lobby.started) {
      if (callback) callback({ success: false, error: 'Game has already started in this lobby.' });
      return;
    }

    if (lobby.guest && lobby.guest.id !== socket.id) {
      if (callback) callback({ success: false, error: 'This lobby is already full (2 players max).' });
      return;
    }

    const guestPlayer: PlayerInfo = {
      id: socket.id,
      name: (payload?.name || 'Player 2').slice(0, 20),
      teamId: payload?.teamId || 'GEORGIA',
      ready: false
    };

    lobby.guest = guestPlayer;
    socketToRoom.set(socket.id, rawCode);
    socket.join(rawCode);

    io.to(rawCode).emit('lobby:updated', lobby);

    if (callback) {
      callback({ success: true, lobby });
    }
  });

  // Player changes their selected team in lobby
  socket.on('lobby:team', (teamId: string) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const lobby = lobbies.get(code);
    if (!lobby || lobby.started) return;

    if (lobby.host.id === socket.id) {
      lobby.host.teamId = teamId;
    } else if (lobby.guest && lobby.guest.id === socket.id) {
      lobby.guest.teamId = teamId;
    }

    io.to(code).emit('lobby:updated', lobby);
  });

  // Guest toggles ready status
  socket.on('lobby:ready', (ready: boolean) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const lobby = lobbies.get(code);
    if (!lobby || lobby.started || !lobby.guest) return;

    if (lobby.guest.id === socket.id) {
      lobby.guest.ready = Boolean(ready);
      io.to(code).emit('lobby:updated', lobby);
    }
  });

  // Host starts the match
  socket.on('lobby:start', () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const lobby = lobbies.get(code);
    if (!lobby || lobby.host.id !== socket.id || !lobby.guest || !lobby.guest.ready) return;

    lobby.started = true;
    io.to(code).emit('match:start', {
      code,
      hostTeamId: lobby.host.teamId,
      guestTeamId: lobby.guest.teamId,
      hostName: lobby.host.name,
      guestName: lobby.guest.name
    });
  });

  // Game actions (play selection, snaps, passes, kicks) relayed to the other player
  socket.on('game:action', (action: any) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socket.to(code).emit('game:action', action);
  });

  // Live joystick / movement inputs relayed to host
  socket.on('game:input', (input: any) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socket.to(code).emit('game:input', input);
  });

  // Host sends authoritative game state snapshot to guest
  socket.on('game:sync', (gameState: any) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socket.to(code).emit('game:sync', gameState);
  });

  // Clean exit or disconnect
  const handleExit = () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socketToRoom.delete(socket.id);
    socket.leave(code);

    const lobby = lobbies.get(code);
    if (!lobby) return;

    if (lobby.host.id === socket.id) {
      // Host left, room is disbanded
      socket.to(code).emit('peer:disconnected', { message: 'Host has left the game.' });
      lobbies.delete(code);
    } else if (lobby.guest && lobby.guest.id === socket.id) {
      // Guest left
      lobby.guest = null;
      lobby.started = false;
      socket.to(code).emit('peer:disconnected', { message: 'Guest has left the game.' });
      io.to(code).emit('lobby:updated', lobby);
    }
  };

  socket.on('lobby:leave', handleExit);
  socket.on('disconnect', handleExit);
});

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Football game server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
