import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../server.js';
const wait = ms => new Promise(r => setTimeout(r, ms));
function once(socket, name) { return new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Timeout: ' + name)), 7000); socket.once(name, value => { clearTimeout(timeout); resolve(value); }); }); }
function join(socket, data) { return new Promise(resolve => socket.emit('join-room', data, resolve)); }

test('dos clientes comparten sala, movimiento, anfitrión y limpieza de conexiones', async () => {
  const game = createGameServer(), clients = [];
  await new Promise(resolve => game.http.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + game.http.address().port;
  try {
    async function connect() { const s = io(url, { transports: ['websocket'], forceNew: true }); clients.push(s); await once(s, 'connect'); return s; }
    const a = await connect(), b = await connect();
    const first = await join(a, { name: 'Juan' }); assert.match(first.code, /^\d{6}$/);
    const second = await join(b, { name: 'Amiga', code: first.code }); assert.equal(second.code, first.code);
    const room = game.rooms.get(first.code); assert.equal(room.players.size, 2);
    b.emit('start-race'); await wait(60); assert.equal(room.phase, 'lobby');
    a.emit('start-race'); await wait(60); assert.equal(room.phase, 'countdown');
    room.startAt = Date.now() - 100; room.endsAt = Date.now() + 10000;
    a.emit('input', { x: 0, z: -1 }); await wait(600);
    const snapshot = await once(b, 'state'), player = snapshot.players.find(p => p.id === a.id);
    assert.ok(player.z < 4, 'El segundo cliente debe ver moverse al primero');
    a.disconnect(); await wait(80); assert.equal(room.host, b.id);
    b.disconnect(); await wait(80); assert.equal(game.rooms.size, 0);
    const health = await fetch(url + '/api/health'); assert.equal(health.status, 200);
    const model = await fetch(url + '/models/circuito.glb'); assert.equal(model.status, 200); const bytes = new Uint8Array(await model.arrayBuffer()); assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'glTF');
  } finally { for (const c of clients) c.disconnect(); await game.close(); }
});
test('cuatro conexiones mantienen colores únicos, apariencia sincronizada y pintura por jugador', async () => {
  const game = createGameServer(), clients = []; await new Promise(resolve => game.http.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + game.http.address().port; let code;
  try {
    for (let i = 0; i < 5; i++) {
      const s = io(url, { transports: ['websocket'], forceNew: true }); clients.push(s); await once(s, 'connect');
      const joined = await join(s, { name: 'Piloto ' + i, code: code || '', appearance: { preferredColor: '#a9ff5b', roughness: .2 + i * .1 } });
      if (i === 0) code = joined.code; if (i < 4) assert.equal(joined.code, code); else assert.ok(joined.error);
    }
    const room = game.rooms.get(code); assert.equal(room.players.size, 4); assert.equal(new Set([...room.players.values()].map(p => p.color)).size, 4);
    await new Promise(resolve => clients[0].emit('customize', { roughness: .95, metalness: .8, finish: 'carbon', accessory: 'halo' }, resolve));
    const updated = await once(clients[3], 'state'); assert.equal(updated.players.find(p => p.id === clients[0].id).appearance.roughness, .95);
    clients[0].emit('start-race', { practice: true, level: 2 }); await wait(60); room.startAt = Date.now() - 1000; room.endsAt = Date.now() + 120000; await wait(650);
    const painted = await once(clients[2], 'state'); assert.equal(painted.level, 2); assert.equal(painted.players.length, 4); assert.equal(new Set(painted.tiles.filter(owner => owner >= 0)).size, 4);
    for (const p of painted.players) assert.ok(p.territory > 0);
  } finally { for (const c of clients) c.disconnect(); await game.close(); }
});
test('la confirmación del tiro se entrega sólo al tirador', async () => {
  const game = createGameServer(), clients = []; await new Promise(resolve => game.http.listen(0, '127.0.0.1', resolve)); const url = 'http://127.0.0.1:' + game.http.address().port; let code;
  try {
    for (let i = 0; i < 3; i++) { const s = io(url, { transports: ['websocket'], forceNew: true }); clients.push(s); await once(s, 'connect'); const result = await join(s, { name: 'Jugador ' + i, code: code || '' }); code = result.code; }
    const confirmations = [[], [], []]; clients.forEach((s, i) => s.on('game-event', data => { if (data.event === 'hit-confirmed') confirmations[i].push(data); }));
    const room = game.rooms.get(code); room.start(clients[0].id, Date.now(), { practice: true, level: 1 }); const victim = room.players.get(clients[1].id); victim.spawnUntil = 0;
    room.damage(victim, 34, clients[0].id, Date.now()); await wait(100); assert.equal(confirmations[0].length, 1); assert.equal(confirmations[0][0].damage, 34); assert.equal(confirmations[1].length, 0); assert.equal(confirmations[2].length, 0);
  } finally { for (const c of clients) c.disconnect(); await game.close(); }
});
