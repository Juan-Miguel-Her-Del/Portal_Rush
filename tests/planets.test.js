import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../game.js';
import { PLANETS, WEAPONS, LASERS, laserActive } from '../shared/planets.js';
function game(level, count = 2) { const r = new Race('123456'); for (let i = 0; i < count; i++) r.add('p' + i, 'Piloto ' + i); r.start('p0', 0, { practice: true, level }); return r; }
function settle(r, start = 4000, n = 90) { for (let i = 0; i < n; i++) r.tick(start + i * 1000 / 60); }
test('todos los planetas tienen mundos físicos y las apariencias están validadas', () => {
  for (let level = 0; level < PLANETS.length; level++) { const r = game(level); assert.equal(r.level, level); assert.equal(r.world.gravity.y, -PLANETS[level].gravity); assert.equal(r.world.bodies.filter(b => b.mass === 1).length, 2); }
  const r = new Race('x'), a = r.add('a', 'Uno', { roughness: 99, metalness: -4, finish: 'invalid', preferredColor: '#62dcff' }), b = r.add('b', 'Dos', { preferredColor: '#62dcff' });
  assert.equal(a.appearance.roughness, 1); assert.equal(a.appearance.metalness, 0); assert.equal(a.appearance.finish, 'ceramic'); assert.notEqual(a.color, b.color);
});
test('el cohete lleva a todos al siguiente planeta y suma puntos sólo una vez', () => {
  const r = new Race('x'); r.add('p0', 'Uno'); r.add('p1', 'Dos'); r.start('p0', 0);
  const p = r.players.get('p0'); p.finish = 10000; r.endRound(14000); const points = p.points; assert.equal(r.phase, 'boarding'); r.endRound(14001); assert.equal(p.points, points);
  r.tick(r.travelAt + 1); assert.equal(r.phase, 'travel'); r.tick(r.nextAt + 1); assert.equal(r.level, 1); assert.equal(r.phase, 'countdown'); assert.equal(p.points, points); assert.equal(p.kills, 0); assert.equal(r.history.length, 1);
});
test('el láser activo devuelve al checkpoint y se puede saltar', () => {
  const r = game(0), p = r.players.get('p0'); r.phase = 'racing'; const l = LASERS[0]; let now = 4000;
  while (!laserActive(l, (now - r.startAt) / 1000)) now += 100;
  p.body.position.set(0, l.y, l.z); r.tick(now); assert.equal(p.falls, 1); assert.ok(p.body.position.z > 0);
  p.body.position.set(0, 2.6, l.z); r.tick(now + 1000); assert.equal(p.falls, 1);
});
test('las diez armas avanzan con eliminaciones y la décima gana', () => {
  const r = game(1), killer = r.players.get('p0'), victim = r.players.get('p1'); r.phase = 'racing';
  for (let i = 0; i < WEAPONS.length; i++) { victim.health = 100; victim.spawnUntil = 0; r.damage(victim, 100, killer.id, 10000 + i * 2000); assert.equal(killer.kills, i + 1); }
  assert.equal(r.phase, 'finished'); assert.equal(r.roundResults[0].id, killer.id); assert.equal(r.roundResults[0].kills, 10);
});
test('los proyectiles impactan al rival y las coberturas bloquean disparos', () => {
  const r = game(1), a = r.players.get('p0'), b = r.players.get('p1'); r.phase = 'racing'; a.body.position.set(-12, .55, 10); b.body.position.set(-12, .55, 5); a.spawnUntil = b.spawnUntil = 0;
  r.setInput(a.id, { aim: { x: 0, y: 0, z: -1 }, fire: true });
  for (let i = 0; i < 90; i++) r.tick(10000 + i * 1000 / 60); assert.ok(a.kills >= 1);
  const r2 = game(1), x = r2.players.get('p0'), y = r2.players.get('p1'); r2.phase = 'racing'; x.body.position.set(0, .55, 7); y.body.position.set(0, .55, -6); x.spawnUntil = y.spawnUntil = 0; r2.setInput(x.id, { aim: { x: 0, y: 0, z: -1 }, fire: true });
  for (let i = 0; i < 100; i++) r2.tick(10000 + i * 1000 / 60); assert.equal(y.health, 100); assert.equal(x.kills, 0);
});
test('es posible completar las diez armas con proyectiles físicos reales', () => {
  const r = game(1), a = r.players.get('p0'), b = r.players.get('p1'); r.phase = 'racing'; let now = 10000;
  for (let weapon = 0; weapon < 10; weapon++) {
    a.body.position.set(-12, .55, 10); b.body.position.set(-12, .55, 7); a.body.velocity.setZero(); b.body.velocity.setZero(); a.spawnUntil = b.spawnUntil = 0; b.health = 100; b.deadUntil = 0; a.shotAt = 0;
    r.setInput(a.id, { aim: { x: 0, y: 0, z: -1 }, fire: true });
    for (let frame = 0; frame < 600 && a.kills === weapon; frame++) { r.tick(now); now += 1000 / 60; }
    assert.equal(a.kills, weapon + 1, WEAPONS[weapon].name + ' debe permitir una eliminación real');
  }
  assert.equal(r.phase, 'finished');
});
test('pintar roba casillas, empujar tiene cooldown y el nivel dura dos minutos', () => {
  const r = game(2), a = r.players.get('p0'), b = r.players.get('p1'); settle(r); a.body.position.set(0, .55, 0); b.body.position.set(10, .55, 10); r.tick(7000); const owned = r.tileOwners.indexOf(a.slot); assert.ok(owned >= 0);
  a.body.position.set(8, .55, -8); b.body.position.set(0, .55, 0); r.tick(7020); assert.equal(r.tileOwners[owned], b.slot);
  a.body.position.set(0, .55, 0); b.body.position.set(1.4, .55, 0); r.setInput(a.id, { push: true }); r.tick(8000); assert.ok(b.knockX > 0); assert.equal(a.pushAt, 9400);
  r.setInput(a.id, { push: true }); r.tick(8100); assert.equal(a.pushAt, 9400); assert.equal(r.endsAt - r.startAt, 120000);
  r.tick(r.endsAt - 1); assert.equal(r.phase, 'racing');
  r.tick(r.endsAt); assert.equal(r.phase, 'finished');
});
test('cristales se recogen una vez, reaparecen y el quince cierra la ronda', () => {
  const r = game(3), p = r.players.get('p0'), c = r.crystals[0]; r.phase = 'racing'; p.body.position.set(c.x, c.y, c.z); r.tick(8000); assert.equal(p.crystals, 1); r.tick(8017); assert.equal(p.crystals, 1);
  p.crystals = 14; c.availableAt = 0; p.body.position.set(c.x, c.y, c.z); r.tick(8100); assert.equal(p.crystals, 15); assert.equal(r.phase, 'finished'); assert.equal(r.roundResults[0].id, p.id);
});
test('meteoritos avisan, eliminan y retiran las colisiones de las casillas', () => {
  const r = game(4), p = r.players.get('p0'); settle(r); r.meteors = [{ id: 1, tile: 55, x: 1.5, z: 1.5, impactAt: 7000 }]; r.nextMeteorAt = 99999; p.body.position.set(1.5, .55, 1.5); r.players.get('p1').body.position.set(-10, .55, -10);
  const count = r.world.bodies.length; r.tick(6900); assert.equal(p.out, false); r.tick(7001); assert.equal(p.out, true); assert.equal(r.brokenTiles[55], true); assert.equal(r.world.bodies.length, count - 1); assert.equal(r.phase, 'finished'); assert.equal(r.roundResults[0].id, 'p1'); assert.equal(r.roundResults[0].rank, 1); assert.equal(r.roundResults[1].rank, 2);
});
test('el torneo termina tras todos los mundos y conserva la clasificación', () => {
  const r = new Race('x'); r.add('a', 'Uno'); r.add('b', 'Dos'); r.start('a', 0);
  for (let i = 0; i < PLANETS.length; i++) { r.endRound(10000 + i * 20000); if (i < PLANETS.length - 1) r.tick(r.nextAt + 1); }
  assert.equal(r.phase, 'finished'); assert.equal(r.level, PLANETS.length - 1); assert.equal(r.history.length, PLANETS.length); assert.ok(r.players.get('a').points > 0);
});
