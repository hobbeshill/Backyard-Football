import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';

const directory = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
  maxHttpBufferSize: 1024 * 1024
});
const lobbies = new Map();
const codeCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => codeCharacters[randomInt(codeCharacters.length)]).join('');
  } while (lobbies.has(code));
  return code;
}

function publicLobby(lobby) {
  return {
    code: lobby.code,
    host: lobby.host,
    guest: lobby.guest,
    started: lobby.started
  };
}

function publishLobby(lobby) {
  io.to(lobby.code).emit('lobby:update', publicLobby(lobby));
}

function leaveLobby(socket) {
  const code = socket.data.lobbyCode;
  const role = socket.data.lobbyRole;
  const lobby = code && lobbies.get(code);
  if (!lobby || !role) return;

  if (role === 'host') {
    lobbies.delete(code);
    io.to(code).emit('lobby:closed');
  } else {
    lobby.guest = null;
    lobby.started = false;
    publishLobby(lobby);
  }

  socket.leave(code);
  delete socket.data.lobbyCode;
  delete socket.data.lobbyRole;
}

app.get('/health', (_request, response) => response.json({ ok: true, lobbies: lobbies.size }));

if (process.env.NODE_ENV === 'production' && existsSync(path.join(directory, 'dist'))) {
  app.use(express.static(path.join(directory, 'dist')));
  app.get('*', (_request, response) => response.sendFile(path.join(directory, 'dist', 'index.html')));
}

io.on('connection', socket => {
  socket.on('lobby:create', (payload, acknowledge = () => {}) => {
    leaveLobby(socket);
    const lobby = {
      code: createCode(),
      host: {
        name: String(payload?.name || 'Host').trim().slice(0, 20) || 'Host',
        teamId: String(payload?.teamId || ''),
        ready: true
      },
      guest: null,
      started: false,
      hostSocketId: socket.id,
      guestSocketId: null
    };
    lobbies.set(lobby.code, lobby);
    socket.join(lobby.code);
    socket.data.lobbyCode = lobby.code;
    socket.data.lobbyRole = 'host';
    acknowledge({ ok: true, lobby: publicLobby(lobby), role: 'host' });
  });

  socket.on('lobby:join', (payload, acknowledge = () => {}) => {
    leaveLobby(socket);
    const code = String(payload?.code || '').trim().toUpperCase();
    const lobby = lobbies.get(code);
    if (!lobby) return acknowledge({ ok: false, error: 'Lobby code not found.' });
    if (lobby.guest) return acknowledge({ ok: false, error: 'That lobby is full.' });

    lobby.guest = {
      name: String(payload?.name || 'Guest').trim().slice(0, 20) || 'Guest',
      teamId: String(payload?.teamId || ''),
      ready: false
    };
    lobby.guestSocketId = socket.id;
    socket.join(code);
    socket.data.lobbyCode = code;
    socket.data.lobbyRole = 'guest';
    acknowledge({ ok: true, lobby: publicLobby(lobby), role: 'guest' });
    publishLobby(lobby);
  });

  socket.on('lobby:ready', ready => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.started) return;
    if (socket.data.lobbyRole === 'guest' && lobby.guest) lobby.guest.ready = Boolean(ready);
    publishLobby(lobby);
  });

  socket.on('lobby:team', teamId => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || socket.data.lobbyRole !== 'guest' || lobby.started || !lobby.guest) return;
    lobby.guest.teamId = String(teamId || '').slice(0, 40);
    lobby.guest.ready = false;
    publishLobby(lobby);
  });

  socket.on('lobby:start', acknowledge => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || socket.data.lobbyRole !== 'host') return acknowledge?.({ ok: false, error: 'Only the host can start.' });
    if (!lobby.guest || !lobby.guest.ready) return acknowledge?.({ ok: false, error: 'Waiting for the guest to be ready.' });
    lobby.started = true;
    publishLobby(lobby);
    io.to(lobby.guestSocketId).emit('match:started');
    acknowledge?.({ ok: true });
  });

  socket.on('match:input', input => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby?.started || socket.data.lobbyRole !== 'guest') return;
    io.to(lobby.hostSocketId).emit('match:input', input);
  });

  socket.on('match:state', state => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby?.started || socket.data.lobbyRole !== 'host') return;
    io.to(lobby.guestSocketId).emit('match:state', state);
  });

  socket.on('lobby:leave', () => leaveLobby(socket));
  socket.on('disconnect', () => leaveLobby(socket));
});

const port = Number(process.env.SOCKET_PORT || process.env.PORT || 3001);
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Multiplayer relay listening on :${port}`);
});