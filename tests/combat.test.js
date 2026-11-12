import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../game.js';
test('el impacto confirmado identifica al tirador y limita el daño a la vida restante', () => {
  const events = [], r = new Race('x', (event, data) => events.push({ event, ...data })); r.add('a', 'Uno'); const b = r.add('b', 'Dos'); r.start('a', 0, { practice: true, level: 1 }); b.spawnUntil = 0;
  r.damage(b, 34, 'a', 6000); let hit = events.filter(e => e.event === 'hit-confirmed').at(-1); assert.equal(hit.id, 'a'); assert.equal(hit.target, 'b'); assert.equal(hit.damage, 34); assert.equal(hit.fatal, false);
  r.damage(b, 100, 'a', 6020); hit = events.filter(e => e.event === 'hit-confirmed').at(-1); assert.equal(hit.damage, 66); assert.equal(hit.fatal, true); assert.equal(r.players.get('a').kills, 1);
});
test('no se confirma un impacto sobre un jugador protegido, eliminado o por daño propio', () => {
  const events = [], r = new Race('x', (event, data) => events.push({ event, ...data })); r.add('a', 'Uno'); const b = r.add('b', 'Dos'); r.start('a', 0, { practice: true, level: 1 }); b.spawnUntil = 9000;
  r.damage(b, 34, 'a', 6000); assert.equal(b.health, 100); assert.equal(events.filter(e => e.event === 'hit-confirmed').length, 0);
  b.spawnUntil = 0; r.damage(b, 100, 'b', 6100); r.damage(b, 30, 'a', 6200); assert.equal(events.filter(e => e.event === 'hit-confirmed').length, 0);
});
