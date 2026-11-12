import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../game.js';

function run(race, frames, start = 10000) { for (let i = 0; i < frames; i++) race.tick(start + i * 1000 / 60); }
test('sólo el anfitrión inicia y el límite de sala es cuatro', () => {
  const r = new Race('123456'); for (let i = 0; i < 4; i++) r.add('p' + i, 'Piloto');
  assert.throws(() => r.add('fifth', 'Quinto')); assert.equal(r.start('p1'), false); assert.equal(r.start('p0', 0), true);
  r.remove('p0'); assert.equal(r.host, 'p1');
});
test('el movimiento espera la cuenta regresiva y valida entradas', () => {
  const r = new Race('123456'); const p = r.add('a', '<Piloto>'); r.start('a', 10000);
  r.setInput('a', { x: NaN, z: -10000, yaw: Infinity }); assert.equal(p.input.x, 0); assert.equal(p.input.z, -1);
  run(r, 120, 10000); assert.ok(Math.abs(p.body.position.z - 7) < .05);
  run(r, 60, 14000); assert.ok(p.body.position.z < 1); assert.equal(p.name, 'Piloto');
});
test('gravedad, contacto con suelo y salto físico', () => {
  const r = new Race('123456'); const p = r.add('a', 'Piloto'); r.start('a', 0);
  run(r, 100); assert.ok(Math.abs(p.body.position.y - .55) < .05); assert.ok(p.grounded);
  r.setInput('a', { x: 0, z: 0, jump: true }); r.tick(12000); assert.ok(p.body.velocity.y > 8);
  run(r, 90, 12017); assert.ok(Math.abs(p.body.position.y - .55) < .05);
});
test('los checkpoints son secuenciales y el portal teletransporta', () => {
  const events = [], r = new Race('123456', (e, d) => events.push([e, d])); const p = r.add('a', 'Piloto'); r.start('a', 0);
  p.body.position.set(0, 1, -104); r.tick(10000); assert.equal(p.finish, null);
  p.body.position.set(0, 1, -45); r.tick(10020); assert.equal(p.checkpoint, 1);
  p.body.position.set(0, 1, -51); r.tick(10040); assert.equal(p.checkpoint, 2); assert.ok(p.body.position.z > -62 && p.body.position.z < -60);
  assert.ok(events.some(([e]) => e === 'teleport'));
  p.body.position.set(0, 1, -83); r.tick(10060); assert.equal(p.checkpoint, 3);
  p.body.position.set(0, 1, -104); r.tick(10080); assert.equal(p.finish, 6080); assert.equal(r.phase, 'boarding');
});
test('una caída conserva checkpoint y una nueva ronda reinicia el resultado', () => {
  const r = new Race('123456'); const p = r.add('a', 'Piloto'); r.start('a', 0); p.checkpoint = 2;
  p.body.position.set(0, -9, -70); r.tick(10000); assert.equal(p.checkpoint, 2); assert.equal(p.falls, 1); assert.equal(p.body.position.z, -61);
  r.phase = 'finished'; p.finish = 30000; r.start('a', 10000); assert.equal(p.checkpoint, 0); assert.equal(p.finish, null); assert.equal(p.falls, 0);
});
test('las pelotas tienen masa, caen y rebotan sobre el circuito', () => {
  const r = new Race('123456'); let descending = false, bounced = false;
  for (let i = 0; i < 240; i++) { r.tick(10000 + i * 16.67); const b = r.balls[0]; if (b.velocity.y < -1) descending = true; if (descending && b.position.y < 3 && b.velocity.y > 1) bounced = true; }
  assert.ok(r.balls[0].mass > 0); assert.ok(bounced);
});
test('al acabar el tiempo se cierra la carrera', () => {
  const r = new Race('123456'); r.add('a', 'Piloto'); r.start('a', 0); r.tick(184001); assert.equal(r.phase, 'boarding');
});
