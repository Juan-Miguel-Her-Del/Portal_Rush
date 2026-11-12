import * as CANNON from 'cannon-es';
import { randomInt } from 'node:crypto';
import { PLATFORMS, SWEEPERS, CHECKPOINTS, COLORS, MAX_PLAYERS, RACE_SECONDS } from './shared/course.js';

export class Race {
  constructor(code, emit = () => {}) {
    this.code = code; this.emit = emit; this.players = new Map(); this.host = null;
    this.phase = 'lobby'; this.startAt = 0; this.endsAt = 0; this.finishedAt = 0;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.08;
    this.world.defaultContactMaterial.restitution = 0.15;
    this.playerMaterial = new CANNON.Material('player');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.playerMaterial, this.world.defaultMaterial, { friction: 0, restitution: 0 }));
    for (const p of PLATFORMS) {
      this.world.addBody(new CANNON.Body({ mass: 0, material: this.world.defaultMaterial, shape: new CANNON.Box(new CANNON.Vec3(p.w / 2, .5, p.d / 2)), position: new CANNON.Vec3(p.x, -.5, p.z) }));
    }
    this.sweepers = SWEEPERS.map((s) => {
      const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: this.world.defaultMaterial, shape: new CANNON.Box(new CANNON.Vec3(s.width / 2, .25, .3)), position: new CANNON.Vec3(0, .8, s.z) });
      this.world.addBody(body); return body;
    });
    const ballMaterial = new CANNON.Material('bouncy');
    this.world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, this.world.defaultMaterial, { friction: .1, restitution: .78 }));
    this.balls = [-66, -76, -81].map((z, i) => {
      const body = new CANNON.Body({ mass: 2, material: ballMaterial, shape: new CANNON.Sphere(.85), position: new CANNON.Vec3((i - 1) * 3, 4 + i, z) });
      this.world.addBody(body); return body;
    });
  }
  add(id, name) {
    if (this.players.size >= MAX_PLAYERS) throw new Error('La sala está llena (máximo 4 jugadores).');
    if (this.phase !== 'lobby') throw new Error('Esta carrera ya empezó. Espera a la siguiente ronda.');
    const slot = COLORS.findIndex(color => ![...this.players.values()].some(p => p.color === color));
    const body = new CANNON.Body({ mass: 1, material: this.playerMaterial, shape: new CANNON.Sphere(.55), fixedRotation: true, linearDamping: .1, position: new CANNON.Vec3((slot - 1.5) * 1.8, 1.2, 7) });
    body.collisionFilterGroup = 2; body.collisionFilterMask = 1;
    this.world.addBody(body);
    const player = { id, name: String(name || 'Piloto').replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 18) || 'Piloto', color: COLORS[slot], body, checkpoint: 0, falls: 0, finish: null, input: { x: 0, z: 0 }, jump: false, yaw: 0, portalUntil: 0, grounded: false };
    this.players.set(id, player); if (!this.host) this.host = id;
    return player;
  }
  remove(id) { const p = this.players.get(id); if (p) this.world.removeBody(p.body); this.players.delete(id); if (this.host === id) this.host = this.players.keys().next().value || null; }
  start(id, now = Date.now()) {
    if (id !== this.host || this.phase === 'countdown' || this.phase === 'racing') return false;
    this.phase = 'countdown'; this.startAt = now + 4000; this.endsAt = this.startAt + RACE_SECONDS * 1000; this.finishedAt = 0;
    let i = 0;
    for (const p of this.players.values()) {
      p.checkpoint = 0; p.falls = 0; p.finish = null; p.portalUntil = 0; p.input = { x: 0, z: 0 }; p.jump = false;
      this.resetPlayer(p, (i++ - 1.5) * 1.8);
    }
    this.emit('race-start', {}); return true;
  }
  setInput(id, data) {
    const p = this.players.get(id); if (!p || !data || typeof data !== 'object') return;
    const x = Number.isFinite(data.x) ? data.x : 0, z = Number.isFinite(data.z) ? data.z : 0;
    const length = Math.max(1, Math.hypot(x, z));
    p.input.x = x / length; p.input.z = z / length;
    if (Number.isFinite(data.yaw)) p.yaw = data.yaw % (2 * Math.PI);
    if (data.jump === true) p.jump = true;
  }
  resetPlayer(p, spawnX) {
    const c = CHECKPOINTS[p.checkpoint];
    p.body.position.set(spawnX ?? c.x, 1.2, c.z);
    p.body.velocity.setZero(); p.body.angularVelocity.setZero(); p.body.aabbNeedsUpdate = true;
    p.body.wakeUp(); p.jump = false;
  }
  respawn(id, now = Date.now()) {
    const p = this.players.get(id); if (!p || p.finish !== null || now - (p.resetAt || 0) < 800) return;
    p.resetAt = now; p.falls++; this.resetPlayer(p); this.emit('respawn', { id, checkpoint: p.checkpoint });
  }
  tick(now = Date.now(), dt = 1 / 60) {
    if (this.phase === 'countdown' && now >= this.startAt) this.phase = 'racing';
    if (this.phase === 'racing' && now >= this.endsAt) { this.phase = 'finished'; this.finishedAt = now; }
    const t = now / 1000;
    for (let i = 0; i < this.sweepers.length; i++) {
      const b = this.sweepers[i], s = SWEEPERS[i], target = Math.sin(t * 1.5 + i) * s.amplitude;
      b.velocity.x = (target - b.position.x) / dt;
    }
    for (const p of this.players.values()) {
      p.grounded = false;
      for (const c of this.world.contacts) {
        if (c.bi === p.body && c.ni.y < -.4 || c.bj === p.body && c.ni.y > .4) { p.grounded = true; break; }
      }
      const active = this.phase === 'racing' && p.finish === null;
      const factor = Math.min(1, dt * (p.grounded ? 22 : 9));
      p.body.velocity.x += ((active ? p.input.x * 9 : 0) - p.body.velocity.x) * factor;
      p.body.velocity.z += ((active ? p.input.z * 9 : 0) - p.body.velocity.z) * factor;
      if (active && p.jump && p.grounded) { p.body.velocity.y = 9; this.emit('jump', { id: p.id }); }
      p.jump = false;
    }
    this.world.step(dt);
    this.balls.forEach((b, i) => {
      if (b.position.y < -5 || b.position.y > 20 || Math.abs(b.position.x) > 6.4) { b.position.set((i - 1) * 3, 5 + i, -66 - i * 7); b.velocity.set(0, -1, 0); }
    });
    for (const p of this.players.values()) {
      const v = p.body.position;
      if (v.y < -8) { this.respawn(p.id, now); continue; }
      if (this.phase !== 'racing' || p.finish !== null) continue;
      // Trigger radial: equivalente a Vector3.distanceTo() en el cliente.
      if (p.checkpoint === 0 && Math.hypot(v.x, v.z + 45) < 5 && Math.abs(v.y) < 4) {
        p.checkpoint = 1; this.emit('checkpoint', { id: p.id, checkpoint: 1 });
      }
      // Trigger AABB: la misma caja Box3 que se muestra en el cliente.
      if (p.checkpoint === 1 && Math.abs(v.x) < 1.8 && v.y > -.2 && v.y < 4 && v.z < -49.8 && v.z > -52.3 && now > p.portalUntil) {
        p.checkpoint = 2; p.portalUntil = now + 2500; this.resetPlayer(p); this.emit('teleport', { id: p.id });
      }
      if (p.checkpoint === 2 && Math.hypot(v.x, v.z + 83) < 4 && Math.abs(v.y) < 4) {
        p.checkpoint = 3; this.emit('checkpoint', { id: p.id, checkpoint: 3 });
      }
      if (p.checkpoint === 3 && Math.abs(v.x) < 5.8 && v.z < -102 && v.z > -107 && v.y > -.2 && v.y < 4) {
        p.finish = Math.max(0, now - this.startAt); this.emit('finish', { id: p.id, time: p.finish });
      }
    }
    if (this.phase === 'racing' && this.players.size && [...this.players.values()].every(p => p.finish !== null)) { this.phase = 'finished'; this.finishedAt = now; }
  }
  snapshot(now = Date.now()) {
    return { code: this.code, host: this.host, phase: this.phase, startAt: this.startAt, endsAt: this.endsAt, now,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, x: p.body.position.x, y: p.body.position.y, z: p.body.position.z, vx: p.body.velocity.x, vz: p.body.velocity.z, yaw: p.yaw, checkpoint: p.checkpoint, falls: p.falls, finish: p.finish })),
      balls: this.balls.map(b => ({ x: b.position.x, y: b.position.y, z: b.position.z, q: b.quaternion.toArray() })), sweepers: this.sweepers.map(b => b.position.x) };
  }
}
export function newCode(existing) { let code; do { code = String(randomInt(100000, 1000000)); } while (existing.has(code)); return code; }
