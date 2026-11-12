import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Race, newCode } from './game.js';

export function createGameServer() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const app = express(), http = createServer(app), io = new Server(http, { maxHttpBufferSize: 8192 });
  app.disable('x-powered-by');
  app.get('/api/health', (_, res) => res.json({ ok: true, app: 'portal-rush', build: 'combat-2026-11-11', rooms: rooms.size, stateHz: 20 }));
  app.use('/vendor/three', express.static(path.join(root, 'node_modules/three')));
  app.use('/shared', express.static(path.join(root, 'shared')));
  app.use(express.static(path.join(root, 'public')));
  const rooms = new Map();
  function leave(socket) {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    room.remove(socket.id); socket.leave(room.code); socket.data.room = null;
    if (!room.players.size) rooms.delete(room.code);
    else io.to(room.code).emit('state', room.snapshot());
  }
  io.on('connection', socket => {
    socket.on('latency', ack => { if (typeof ack === 'function') ack(); });
    socket.on('join-room', (data = {}, ack = () => {}) => {
      if (typeof ack !== 'function') ack = () => {};
      if (Date.now() - (socket.data.lastJoin || 0) < 350) return ack({ error: 'Espera un momento antes de volver a entrar.' });
      socket.data.lastJoin = Date.now();
      if (!data || typeof data !== 'object') return ack({ error: 'Solicitud inválida.' });
      const code = typeof data.code === 'string' ? data.code.trim() : '';
      if (code && !/^\d{6}$/.test(code)) return ack({ error: 'El código debe tener 6 números.' });
      let room = code ? rooms.get(code) : null;
      if (code && !room) return ack({ error: 'No encontramos esa sala. Revisa el código.' });
      if (room && room.players.size >= 4) return ack({ error: 'La sala está llena.' });
      if (room && room.phase !== 'lobby') return ack({ error: 'La carrera ya empezó. El anfitrión puede crear otra sala.' });
      leave(socket);
      if (!room) { const key = newCode(rooms); room = new Race(key, (event, payload) => io.to(event === 'hit-confirmed' ? payload.id : key).emit('game-event', { event, ...payload })); rooms.set(key, room); }
      room.add(socket.id, typeof data.name === 'string' ? data.name : 'Piloto', data.appearance); socket.data.room = room.code; socket.join(room.code);
      ack({ code: room.code, id: socket.id }); io.to(room.code).emit('state', room.snapshot());
    });
    socket.on('input', data => rooms.get(socket.data.room)?.setInput(socket.id, data));
    socket.on('start-race', data => rooms.get(socket.data.room)?.start(socket.id, Date.now(), data && typeof data === 'object' ? data : {}));
    socket.on('customize', (data, ack) => { const ok = rooms.get(socket.data.room)?.customize(socket.id, data); if (typeof ack === 'function') ack({ ok: !!ok }); });
    socket.on('respawn', () => rooms.get(socket.data.room)?.respawn(socket.id));
    socket.on('leave-room', () => leave(socket));
    socket.on('disconnect', () => leave(socket));
  });
  let previous = performance.now(), lastBroadcast = previous, accumulator = 0;
  const timer = setInterval(() => {
    const current = performance.now(); accumulator += Math.min((current - previous) / 1000, .15); previous = current;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps++ < 8) { for (const room of rooms.values()) room.tick(Date.now()); accumulator -= 1 / 60; }
    if (steps > 0 && current - lastBroadcast >= 50) {
      lastBroadcast = current - (current - lastBroadcast) % 50;
      // Si el transporte se congestiona, se descarta el estado viejo; los eventos de juego siguen siendo fiables.
      for (const room of rooms.values()) io.to(room.code).volatile.emit('state', room.snapshot());
    }
  }, 8);
  return { app, http, io, rooms, close: () => new Promise(resolve => { clearInterval(timer); io.close(() => http.close(() => resolve())); }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const game = createGameServer(), port = Number(process.env.PORT) || 3000;
  game.http.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `El puerto ${port} está ocupado. Cierra la otra instancia o cambia PORT.` : e.message); process.exitCode = 1; game.close(); });
  game.http.listen(port, '0.0.0.0', () => {
    console.log(`\nPORTAL RUSH · Juego listo\nEste computador: http://localhost:${port}`);
    for (const interfaces of Object.values(os.networkInterfaces())) for (const net of interfaces || []) if (net.family === 'IPv4' && !net.internal) console.log(`Misma red Wi-Fi: http://${net.address}:${port}`);
    console.log('Deja esta ventana abierta mientras juegas. Ctrl+C para detener.\n');
  });
  process.once('SIGTERM', () => { game.close().then(() => process.exit(0)); });
}
