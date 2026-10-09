import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';

function emitWithAck<T>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(3000).emit(event, ...args, (error: Error | null, result: T) => error ? reject(error) : resolve(result));
  });
}

function connect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

test('online lobby supports invite codes, readiness, match start, and authoritative relays', { timeout: 15000 }, async () => {
  const portProbe = createHttpServer();
  await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const address = portProbe.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));

  const server = spawn(process.execPath, [fileURLToPath(new URL('../../server.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Multiplayer server did not start in time.')), 5000);
    server.stdout?.on('data', (chunk: Buffer) => {
      if (!chunk.toString().includes('Multiplayer relay listening')) return;
      clearTimeout(timeoutId);
      resolve();
    });
    server.stderr?.on('data', chunk => {
      clearTimeout(timeoutId);
      reject(new Error(chunk.toString()));
    });
    server.once('error', error => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
  const host = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
  const guest = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });

  try {
    await Promise.all([connect(host), connect(guest)]);
    const hostLobby = await emitWithAck<{ ok: boolean; lobby: { code: string }; role: string }>(host, 'lobby:create', { name: 'Host', teamId: 'ALABAMA' });
    assert.equal(hostLobby.ok, true);
    assert.match(hostLobby.lobby.code, /^[A-HJ-NP-Z2-9]{6}$/);

    const guestLobby = await emitWithAck<{ ok: boolean; lobby: { guest: { teamId: string } }; role: string }>(guest, 'lobby:join', {
      code: hostLobby.lobby.code,
      name: 'Guest',
      teamId: 'GEORGIA'
    });
    assert.equal(guestLobby.ok, true);
    assert.equal(guestLobby.lobby.guest.teamId, 'GEORGIA');

    const updatedLobby = new Promise<{ guest: { ready: boolean } }>(resolve => {
      const waitForReady = (lobby: { guest: { ready: boolean } | null }) => {
        if (lobby.guest?.ready) resolve(lobby as { guest: { ready: boolean } });
        else host.once('lobby:update', waitForReady);
      };
      host.once('lobby:update', waitForReady);
    });
    guest.emit('lobby:ready', true);
    assert.equal((await updatedLobby).guest.ready, true);

    const started = new Promise<void>(resolve => guest.once('match:started', resolve));
    const startResult = await emitWithAck<{ ok: boolean }>(host, 'lobby:start');
    assert.equal(startResult.ok, true);
    await started;

    const guestInput = new Promise<{ kind: string; input: { x: number } }>(resolve => host.once('match:input', resolve));
    guest.emit('match:input', { kind: 'move', input: { x: 1, y: 0, active: true } });
    assert.deepEqual(await guestInput, { kind: 'move', input: { x: 1, y: 0, active: true } });

    const hostState = new Promise<{ phase: string }>(resolve => guest.once('match:state', resolve));
    host.emit('match:state', { phase: 'RUNNING' });
    assert.deepEqual(await hostState, { phase: 'RUNNING' });
  } finally {
    host.disconnect();
    guest.disconnect();
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
});
