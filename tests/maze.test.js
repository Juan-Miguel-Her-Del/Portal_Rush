import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../game.js';
import { MAZE, mazeCenter, mazeIndex, mazeNeighbors } from '../shared/maze.js';
function game() { const r = new Race('123456'); r.add('a', 'Piloto'); r.start('a', 0, { practice: true, level: 5 }); return r; }
test('todas las salas son accesibles y existe una ruta continua hasta la salida', () => {
  assert.equal(MAZE.cells.length, 81); assert.ok(MAZE.distances.every(Number.isFinite)); assert.ok(MAZE.solution.length > 15);
  assert.equal(MAZE.solution[0], MAZE.start); assert.equal(MAZE.solution.at(-1), MAZE.goal);
  for (let i = 1; i < MAZE.solution.length; i++) assert.ok(mazeNeighbors(MAZE.solution[i - 1]).includes(MAZE.solution[i]));
  assert.ok(!(MAZE.cells[MAZE.goal] & 1));
});
test('las paredes bloquean el paso y no se puede saltar en el laberinto', () => {
  const r = game(), p = r.players.get('a'), center = mazeCenter(MAZE.start);
  for (let i = 0; i < 90; i++) r.tick(4000 + i * 1000 / 60);
  p.body.position.set(center.x, .55, center.z);
  const d = [{ bit: 1, x: 0, z: -1 }, { bit: 2, x: 1, z: 0 }, { bit: 4, x: 0, z: 1 }, { bit: 8, x: -1, z: 0 }].find(d => MAZE.cells[MAZE.start] & d.bit);
  for (let i = 0; i < 150; i++) { r.setInput('a', { x: d.x, z: d.z, jump: true }); r.tick(6000 + i * 1000 / 60); }
  assert.ok(Math.hypot(p.body.position.x - center.x, p.body.position.z - center.z) < MAZE.cell / 2 - .5); assert.ok(p.body.position.y < .65);
});
test('se puede completar el laberinto entero moviéndose sin modificar posiciones', () => {
  const r = game(), p = r.players.get('a'), path = MAZE.solution.map(mazeCenter); path.push({ x: MAZE.exit.x, z: MAZE.exit.z }); let waypoint = 0, now = 4000;
  for (let frame = 0; frame < 9000 && p.finish === null; frame++) {
    const target = path[waypoint], dx = target.x - p.body.position.x, dz = target.z - p.body.position.z, length = Math.hypot(dx, dz);
    if (length < .25 && waypoint < path.length - 1) waypoint++;
    r.setInput('a', { x: length > .01 ? dx / length : 0, z: length > .01 ? dz / length : 0 }); r.tick(now); now += 1000 / 60;
  }
  assert.ok(p.finish !== null); assert.ok(p.finish < 180000); assert.equal(p.checkpoint, 1); assert.equal(r.phase, 'finished'); assert.equal(r.roundResults[0].id, 'a');
});
test('el checkpoint se conserva al volver y la linterna y su dirección se comparten', () => {
  const r = game(), p = r.players.get('a'), mid = mazeCenter(MAZE.checkpoint); p.body.position.set(mid.x, .55, mid.z); r.tick(6000); assert.equal(p.checkpoint, 1);
  r.respawn('a', 8000); assert.equal(mazeIndex(p.body.position.x, p.body.position.z), MAZE.checkpoint);
  r.setInput('a', { flashlight: false, aim: { x: 3, y: 0, z: 4 } }); const snapshot = r.snapshot(8100).players[0]; assert.equal(snapshot.flashlight, false); assert.equal(snapshot.aim.x, .6); assert.equal(snapshot.aim.z, .8);
});
test('Venus da paso a Saturno y el torneo finaliza después del laberinto', () => {
  const r = new Race('123456'); r.add('a', 'Piloto'); r.start('a', 0); r.loadLevel(4, 1000); r.endRound(8000); assert.equal(r.phase, 'boarding'); r.tick(r.nextAt + 1); assert.equal(r.level, 5); r.endRound(30000); assert.equal(r.phase, 'finished');
});
