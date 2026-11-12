import * as CANNON from 'cannon-es';
import { Race as ClassicRace, newCode } from './classic-race.js';
import { COLORS } from './shared/course.js';
import { MAZE, mazeCenter, mazeIndex } from './shared/maze.js';
import { PLANETS, LASERS, laserActive, COVER, ICE_STEPS, WEAPONS, PAINT_COLS, TILE_SIZE, PAINT_SIZE, sanitizeAppearance, spawnPoint, rocketPosition } from './shared/planets.js';
export { newCode };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function segmentSphere(a, b, p, radius) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, length = dx * dx + dy * dy + dz * dz;
  const t = length ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / length, 0, 1) : 0;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y, a.z + t * dz - p.z) < radius ? t : Infinity;
}
function segmentBox(a, b, box) {
  let near = 0, far = 1;
  for (const [origin, direction, min, max] of [[a.x, b.x - a.x, box.x - box.w / 2, box.x + box.w / 2], [a.y, b.y - a.y, 0, box.h], [a.z, b.z - a.z, box.z - box.d / 2, box.z + box.d / 2]]) {
    if (Math.abs(direction) < .00001) { if (origin < min || origin > max) return Infinity; }
    else { let x = (min - origin) / direction, y = (max - origin) / direction; if (x > y) [x, y] = [y, x]; near = Math.max(near, x); far = Math.min(far, y); if (near > far) return Infinity; }
  } return near;
}
export class Race extends ClassicRace {
  constructor(code, emit) {
    super(code, emit); Object.assign(this, { level: 0, practice: false, roundRecorded: false, travelAt: 0, nextAt: 0, firstFinishAt: 0, nextShotId: 1, nextMeteorId: 1, tileVersion: 0 });
    this.history = []; this.roundResults = []; this.projectiles = []; this.meteors = []; this.crystals = []; this.drones = []; this.tileOwners = new Array(PAINT_COLS ** 2).fill(-1);
  }
  add(id, name, appearance) {
    const p = super.add(id, name), profile = sanitizeAppearance(appearance);
    if (COLORS.includes(profile.preferredColor) && ![...this.players.values()].some(q => q !== p && q.color === profile.preferredColor)) p.color = profile.preferredColor;
    Object.assign(p, { slot: COLORS.indexOf(p.color), appearance: profile, points: 0, kills: 0, deaths: 0, health: 100, crystals: 0, territory: 0, out: false, aim: { x: 0, y: 0, z: -1 }, pushAt: 0 }); return p;
  }
  customize(id, appearance) {
    const p = this.players.get(id); if (!p || this.phase !== 'lobby') return false;
    const profile = sanitizeAppearance(appearance);
    if (COLORS.includes(profile.preferredColor) && ![...this.players.values()].some(q => q !== p && q.color === profile.preferredColor)) { p.color = profile.preferredColor; p.slot = COLORS.indexOf(p.color); }
    p.appearance = profile; return true;
  }
  start(id, now = Date.now(), options = {}) {
    if (id !== this.host || !['lobby', 'finished'].includes(this.phase)) return false;
    this.practice = options.practice === true; this.history = []; for (const p of this.players.values()) p.points = 0;
    this.loadLevel(this.practice && Number.isInteger(options.level) ? clamp(options.level, 0, PLANETS.length - 1) : 0, now); return true;
  }
  loadLevel(level, now) {
    this.level = level; this.roundRecorded = false; this.roundResults = []; this.firstFinishAt = 0; this.projectiles = []; this.meteors = []; this.crystals = []; this.drones = []; this.tileOwners.fill(-1); this.tileVersion++;
    this.phase = 'countdown'; this.startAt = now + 4000; this.endsAt = this.startAt + PLANETS[level].seconds * 1000; this.finishedAt = 0;
    if (level === 0) {
      const base = new ClassicRace(this.code); for (const key of ['world', 'playerMaterial', 'sweepers', 'balls']) this[key] = base[key];
    } else {
      this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -PLANETS[level].gravity, 0) }); this.world.broadphase = new CANNON.SAPBroadphase(this.world);
      this.playerMaterial = new CANNON.Material('player'); this.world.defaultContactMaterial.friction = .12;
      this.world.addContactMaterial(new CANNON.ContactMaterial(this.playerMaterial, this.world.defaultMaterial, { friction: 0, restitution: 0 }));
      this.world.addContactMaterial(new CANNON.ContactMaterial(this.playerMaterial, this.playerMaterial, { friction: 0, restitution: .05 })); this.sweepers = []; this.balls = [];
      if (level === 4) {
        this.tileBodies = []; for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) this.tileBodies.push(this.box((col - 4.5) * 3, -.5, (row - 4.5) * 3, 2.92, 1, 2.92));
        this.brokenTiles = new Array(100).fill(false); this.nextMeteorAt = this.startAt + 2400;
      } else if (level === 5) {
        this.box(0, -.5, 0, MAZE.size + .4, 1, MAZE.size + .4);
        this.box(MAZE.exit.x, -.5, -24, 10, 1, 12);
        this.box(0, MAZE.height + .2, 0, MAZE.size + .4, .4, MAZE.size + .4);
        for (const wall of MAZE.walls) this.box(wall.x, wall.h / 2, wall.z, wall.w, wall.h, wall.d);
      } else {
        this.box(0, -.5, 0, level === 2 ? PAINT_SIZE : 40, 1, level === 2 ? PAINT_SIZE : 40);
        if (level === 1) for (const b of COVER) this.box(b.x, b.h / 2, b.z, b.w, b.h, b.d);
        if (level === 3) {
          for (const b of ICE_STEPS) this.box(b.x, b.h / 2, b.z, b.w, b.h, b.d);
          for (let i = 0; i < 18; i++) {
            const a = i / 18 * Math.PI * 2, r = i % 2 ? 15 : 9, x = Math.cos(a) * r, z = Math.sin(a) * r, step = ICE_STEPS.find(b => Math.abs(b.x - x) < b.w / 2 && Math.abs(b.z - z) < b.d / 2);
            this.crystals.push({ id: i, x, y: (step?.h || 0) + .9, z, availableAt: 0 });
          }
          for (let i = 0; i < ICE_STEPS.length; i++) { const b = ICE_STEPS[i]; this.crystals.push({ id: 18 + i, x: b.x, y: b.h + .9, z: b.z, availableAt: 0 }); }
        }
      }
    }
    for (const p of this.players.values()) {
      p.body.material = this.playerMaterial; p.body.collisionFilterMask = [2, 3, 4].includes(level) ? 3 : 1; this.world.addBody(p.body);
      Object.assign(p, { checkpoint: 0, falls: 0, finish: null, kills: 0, deaths: 0, health: 100, crystals: 0, territory: 0, out: false, survived: null, portalUntil: 0, shotAt: -Infinity, pushAt: 0, knockX: 0, knockZ: 0, deadUntil: 0, spawnUntil: now + 1000, resetAt: -Infinity, flashlight: true, mazeBest: 0 });
      p.input = { x: 0, z: 0 }; p.jump = false; p.fire = false; p.push = false; this.placeAtSpawn(p);
    }
    if (level === 1 && this.players.size === 1) {
      const body = new CANNON.Body({ mass: 1, material: this.playerMaterial, shape: new CANNON.Sphere(.55), fixedRotation: true, position: new CANNON.Vec3(-12, 1, 0) }); this.world.addBody(body);
      this.drones.push({ id: 'training', name: 'Dron de práctica', color: '#c5cbd6', body, health: 100, deadUntil: 0, spawnUntil: 0, shotAt: 0, aim: { x: 0, y: 0, z: 1 } });
    } this.emit('planet', { level });
  }
  box(x, y, z, w, h, d) { const b = new CANNON.Body({ mass: 0, material: this.world.defaultMaterial, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), position: new CANNON.Vec3(x, y, z) }); this.world.addBody(b); return b; }
  placeAtSpawn(p) { const c = spawnPoint(p.slot || 0, this.level); p.body.position.set(c.x, c.y, c.z); p.body.velocity.setZero(); p.body.aabbNeedsUpdate = true; p.body.wakeUp(); p.jump = false; }
  resetPlayer(p, spawnX) { if (!this.level) return super.resetPlayer(p, spawnX); if (this.level === 5 && p.checkpoint) { const c = mazeCenter(MAZE.checkpoint); p.body.position.set(c.x, 1.2, c.z); p.body.velocity.setZero(); p.body.aabbNeedsUpdate = true; p.body.wakeUp(); return; } this.placeAtSpawn(p); }
  respawn(id, now = Date.now()) {
    const p = this.players.get(id); if (!p || p.out || p.health <= 0 || p.finish !== null) return;
    if (this.level === 1 && this.phase === 'racing') return;
    if (this.level === 4 && this.phase === 'racing') { this.eliminate(p, now); return; }
    if (!this.level) return super.respawn(id, now);
    if (now - p.resetAt < 1000) return; p.resetAt = now; p.falls++; p.knockX = 0; p.knockZ = 0; this.resetPlayer(p); this.emit('respawn', { id });
  }
  setInput(id, data) {
    super.setInput(id, data); const p = this.players.get(id); if (!p || !data || typeof data !== 'object') return;
    p.fire = data.fire === true; if (data.push === true) p.push = true;
    if (typeof data.flashlight === 'boolean') p.flashlight = data.flashlight;
    if (data.aim && [data.aim.x, data.aim.y, data.aim.z].every(Number.isFinite)) { const len = Math.hypot(data.aim.x, data.aim.y, data.aim.z); if (len > .01 && Number.isFinite(len)) { p.aim.x = data.aim.x / len; p.aim.y = data.aim.y / len; p.aim.z = data.aim.z / len; } }
  }
  metric(p, now) { return this.level === 0 || this.level === 5 ? (p.finish !== null ? 1000000 - p.finish : this.level === 5 ? p.mazeBest : p.checkpoint * 1000 - p.body.position.z) : this.level === 1 ? p.kills : this.level === 2 ? p.territory : this.level === 3 ? p.crystals : (p.out ? p.survived : 1000000 + now - this.startAt); }
  endRound(now) {
    if (this.roundRecorded) return; this.roundRecorded = true; this.finishedAt = now;
    const list = [...this.players.values()].sort((a, b) => this.metric(b, now) - this.metric(a, now));
    this.roundResults = list.map(p => {
      const rank = list.findIndex(q => this.metric(q, now) === this.metric(p, now)), points = [10, 7, 5, 3][rank] || 3; p.points += points;
      return { id: p.id, name: p.name, color: p.color, rank: rank + 1, points, total: p.points, finish: p.finish, kills: p.kills, territory: p.territory, crystals: p.crystals, out: p.out, mazeBest: p.mazeBest, survived: p.out ? p.survived : now - this.startAt };
    });
    this.history.push({ level: this.level, results: this.roundResults });
    const r = rocketPosition(this.level); let i = 0;
    for (const p of this.players.values()) { p.body.position.set(r.x + (i++ - 1.5) * 1.5, 1.2, r.z + 4); p.body.velocity.setZero(); p.health = 100; p.input.x = 0; p.input.z = 0; p.fire = false; }
    this.phase = this.level === PLANETS.length - 1 || this.practice ? 'finished' : 'boarding'; this.travelAt = now + 9000; this.nextAt = this.travelAt + 5000;
    this.emit('round-end', { level: this.level, winner: list[0]?.id, final: this.phase === 'finished' });
  }
  pushPlayers(p, now) {
    if (!p.push || now < p.pushAt) { p.push = false; return; } p.push = false; p.pushAt = now + 1400; this.emit('push', { id: p.id });
    for (const q of this.players.values()) if (q !== p && !q.out && q.health > 0 && distance(p.body.position, q.body.position) < 3.2) {
      let dx = q.body.position.x - p.body.position.x, dz = q.body.position.z - p.body.position.z, len = Math.hypot(dx, dz); if (len < .1) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); len = 1; }
      q.knockX = dx / len * 14; q.knockZ = dz / len * 14; q.body.applyImpulse(new CANNON.Vec3(dx / len * 5, 4, dz / len * 5)); this.emit('pushed', { id: q.id, by: p.id });
    }
  }
  shoot(p, now, drone = false) {
    const index = drone ? 0 : Math.min(p.kills, 9), w = WEAPONS[index]; if (now < p.shotAt || p.health <= 0 || now < p.spawnUntil || this.projectiles.length > 180) return;
    p.shotAt = now + (drone ? 1300 : w.interval);
    for (let i = 0; i < w.pellets; i++) {
      let x = p.aim.x + (Math.random() - .5) * w.spread, y = p.aim.y + (Math.random() - .5) * w.spread, z = p.aim.z + (Math.random() - .5) * w.spread; const len = Math.hypot(x, y, z) || 1; x /= len; y /= len; z /= len;
      this.projectiles.push({ id: this.nextShotId++, owner: p.id, weapon: index, x: p.body.position.x + x * .7, y: p.body.position.y + .6 + y * .7, z: p.body.position.z + z * .7, vx: x * w.speed, vy: y * w.speed, vz: z * w.speed, until: now + 2500 });
    } this.emit('shot', { id: p.id, weapon: index });
  }
  damage(target, amount, owner, now) {
    if (target.health <= 0 || now < target.spawnUntil || !Number.isFinite(amount) || amount <= 0) return;
    const before = target.health; target.health = Math.max(0, target.health - amount); this.emit('damage', { id: target.id, health: target.health, by: owner });
    if (owner !== target.id && this.players.has(owner)) this.emit('hit-confirmed', { id: owner, target: target.id, damage: before - target.health, health: target.health, fatal: target.health === 0 });
    if (target.health === 0) {
      target.deadUntil = now + 1800; target.body.position.y = -40; target.body.velocity.setZero(); target.body.sleep(); if (target.deaths !== undefined) target.deaths++;
      const killer = this.players.get(owner); if (killer && killer !== target) { killer.kills++; this.emit('elimination', { id: killer.id, victim: target.id, weapon: Math.min(killer.kills, 9), kills: killer.kills }); if (killer.kills >= 10) this.endRound(now); }
    }
  }
  tickShots(now, dt) {
    const targets = [...this.players.values(), ...this.drones];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const s = this.projectiles[i], b = { x: s.x + s.vx * dt, y: s.y + s.vy * dt, z: s.z + s.vz * dt }; let nearest = Infinity, victim = null;
      for (const box of COVER) nearest = Math.min(nearest, segmentBox(s, b, box));
      for (const p of targets) if (p.id !== s.owner && p.health > 0 && now >= p.spawnUntil) { const t = segmentSphere(s, b, { x: p.body.position.x, y: p.body.position.y + .25, z: p.body.position.z }, .78); if (t < nearest) { nearest = t; victim = p; } }
      if (nearest !== Infinity || b.y < .05 || now > s.until || Math.abs(b.x) > 24 || Math.abs(b.z) > 24) {
        const w = WEAPONS[s.weapon], t = nearest === Infinity ? 1 : nearest, hit = { x: s.x + (b.x - s.x) * t, y: s.y + (b.y - s.y) * t, z: s.z + (b.z - s.z) * t };
        if (w.splash && nearest !== Infinity) { for (const p of targets) if (p.id !== s.owner && distance(p.body.position, hit) < w.splash) this.damage(p, w.damage * (1 - .45 * distance(p.body.position, hit) / w.splash), s.owner, now); }
        else if (victim) this.damage(victim, w.damage, s.owner, now);
        if (nearest !== Infinity) this.emit('impact', { ...hit, weapon: s.weapon }); this.projectiles.splice(i, 1);
      } else Object.assign(s, b);
      if (this.roundRecorded) break;
    }
  }
  eliminate(p, now) { if (p.out) return; p.out = true; p.survived = Math.max(0, now - this.startAt); p.body.position.y = -40; p.body.velocity.setZero(); p.body.sleep(); this.emit('eliminated', { id: p.id }); }
  tickMeteors(now) {
    if (now >= this.nextMeteorAt) {
      const remaining = this.brokenTiles.map((broken, i) => broken ? -1 : i).filter(i => i >= 0);
      if (remaining.length) {
        let tile = remaining[Math.floor(Math.random() * remaining.length)]; const alive = [...this.players.values()].filter(p => !p.out);
        if (alive.length && this.nextMeteorId % 3 === 0) { const p = alive[this.nextMeteorId % alive.length].body.position, col = clamp(Math.floor((p.x + 15) / 3), 0, 9), row = clamp(Math.floor((p.z + 15) / 3), 0, 9); if (!this.brokenTiles[row * 10 + col]) tile = row * 10 + col; }
        this.meteors.push({ id: this.nextMeteorId++, tile, x: (tile % 10 - 4.5) * 3, z: (Math.floor(tile / 10) - 4.5) * 3, impactAt: now + 2200 });
      } this.nextMeteorAt = now + Math.max(350, 1300 - (now - this.startAt) / 1000 * 11);
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]; if (now < m.impactAt) continue; if (!this.brokenTiles[m.tile]) { this.brokenTiles[m.tile] = true; this.world.removeBody(this.tileBodies[m.tile]); }
      for (const p of this.players.values()) if (!p.out && Math.hypot(p.body.position.x - m.x, p.body.position.z - m.z) < 2.2 && p.body.position.y < 2) this.eliminate(p, now);
      this.emit('meteor-impact', { x: m.x, y: 0, z: m.z }); this.meteors.splice(i, 1);
    }
    const alive = [...this.players.values()].filter(p => !p.out); if ((this.players.size > 1 && alive.length <= 1) || alive.length === 0) this.endRound(now);
  }
  tick(now = Date.now(), dt = 1 / 60) {
    if (this.phase === 'boarding' || this.phase === 'travel') { if (now >= this.nextAt) this.loadLevel(this.level + 1, now); else if (now >= this.travelAt) this.phase = 'travel'; return; }
    if (this.phase === 'finished') return;
    if (this.level === 0) {
      super.tick(now, dt);
      if (this.phase === 'racing') for (const p of this.players.values()) {
        const v = p.body.position; if (p.finish === null) for (const l of LASERS) if (laserActive(l, (now - this.startAt) / 1000) && Math.abs(v.z - l.z) < .55 && Math.abs(v.x) < l.width / 2 && Math.abs(v.y - l.y) < .68) { this.respawn(p.id, now); this.emit('laser-hit', { id: p.id }); break; }
        if (p.finish !== null && !this.firstFinishAt) { this.firstFinishAt = now; this.endsAt = Math.min(this.endsAt, now + 20000); }
      }
      if (this.phase === 'finished') this.endRound(now); return;
    }
    if (this.phase === 'countdown' && now >= this.startAt) this.phase = 'racing'; const active = this.phase === 'racing';
    for (const p of this.players.values()) {
      if (p.health <= 0 && now >= p.deadUntil && this.level === 1) { p.health = 100; p.spawnUntil = now + 1500; this.placeAtSpawn(p); }
      if (p.out || p.health <= 0) continue;
      p.grounded = this.world.contacts.some(c => c.bi === p.body && c.ni.y < -.4 || c.bj === p.body && c.ni.y > .4); const f = Math.min(1, dt * (p.grounded ? 22 : 9));
      const canMove = active && p.finish === null, speed = this.level === 5 ? 6 : 8.5;
      p.knockX *= Math.exp(-4 * dt); p.knockZ *= Math.exp(-4 * dt);
      p.body.velocity.x += ((canMove ? p.input.x * speed + p.knockX : 0) - p.body.velocity.x) * f; p.body.velocity.z += ((canMove ? p.input.z * speed + p.knockZ : 0) - p.body.velocity.z) * f;
      if (active && this.level !== 5 && p.jump && p.grounded) { p.body.velocity.y = this.level === 3 ? 8.6 : 8.5; this.emit('jump', { id: p.id }); } p.jump = false;
      if (active && [2, 3, 4].includes(this.level)) this.pushPlayers(p, now); if (active && this.level === 1 && p.fire) this.shoot(p, now);
    }
    for (const d of this.drones) {
      if (d.health <= 0) { if (now >= d.deadUntil) { d.health = 100; d.body.position.set(-12, 1, 0); d.body.velocity.setZero(); d.body.wakeUp(); } continue; }
      if (active) { const p = this.players.values().next().value; d.body.velocity.z = Math.sin((now - this.startAt) / 1000 * .7) * 2; d.body.velocity.x = 0;
        if (p?.health > 0) { const v = p.body.position, b = d.body.position, len = distance(v, b) || 1; d.aim = { x: (v.x - b.x) / len, y: (v.y - b.y) / len, z: (v.z - b.z) / len }; this.shoot(d, now, true); }
      }
    }
    this.world.step(dt); if (!active) return;
    for (const p of this.players.values()) {
      if (p.out || p.health <= 0) continue; const v = p.body.position; if (v.y < -7) { if (this.level === 1) this.damage(p, 100, p.id, now); else this.respawn(p.id, now); continue; }
      if (this.level === 2 && v.y < 1.4) { const col = Math.floor((v.x + PAINT_SIZE / 2) / TILE_SIZE), row = Math.floor((v.z + PAINT_SIZE / 2) / TILE_SIZE); if (col >= 0 && col < PAINT_COLS && row >= 0 && row < PAINT_COLS) { const i = row * PAINT_COLS + col; if (this.tileOwners[i] !== p.slot) { this.tileOwners[i] = p.slot; this.tileVersion++; } } }
      if (this.level === 3) for (const c of this.crystals) if (now >= c.availableAt && distance(v, c) < 1.3) { c.availableAt = now + 9000; p.crystals++; this.emit('crystal', { id: p.id, count: p.crystals }); if (p.crystals >= 15) { this.endRound(now); return; } }
      if (this.level === 5 && p.finish === null) {
        const index = mazeIndex(v.x, v.z), mid = mazeCenter(MAZE.checkpoint);
        if (index >= 0) p.mazeBest = Math.max(p.mazeBest, MAZE.distances[MAZE.start] - MAZE.distances[index]);
        if (!p.checkpoint && Math.hypot(v.x - mid.x, v.z - mid.z) < 1.4 && v.y < 2) { p.checkpoint = 1; this.emit('checkpoint', { id: p.id, checkpoint: 1 }); }
        if (p.checkpoint && Math.abs(v.x - MAZE.exit.x) < MAZE.exit.w / 2 && Math.abs(v.z - MAZE.exit.z) < MAZE.exit.d / 2 && v.y > 0 && v.y < 3) {
          p.finish = now - this.startAt; p.body.velocity.setZero(); this.emit('finish', { id: p.id, time: p.finish, remaining: 30 });
          if (!this.firstFinishAt) { this.firstFinishAt = now; this.endsAt = Math.min(this.endsAt, now + 30000); }
        }
      }
    }
    if (this.level === 2) for (const p of this.players.values()) p.territory = this.tileOwners.reduce((n, owner) => n + (owner === p.slot ? 1 : 0), 0);
    if (this.level === 1) this.tickShots(now, dt); if (this.level === 4) this.tickMeteors(now); if (now >= this.endsAt) this.endRound(now);
    if (this.level === 5 && [...this.players.values()].every(p => p.finish !== null)) this.endRound(now);
  }
  snapshot(now = Date.now()) {
    const base = super.snapshot(now);
    return { ...base, level: this.level, practice: this.practice, travelAt: this.travelAt, nextAt: this.nextAt, roundResults: this.roundResults, history: this.history,
      players: base.players.map(p => { const v = this.players.get(p.id); return { ...p, appearance: v.appearance, points: v.points, health: v.health, kills: v.kills, deaths: v.deaths, territory: v.territory, crystals: v.crystals, out: v.out, survived: v.survived, pushAt: v.pushAt, spawnUntil: v.spawnUntil, flashlight: v.flashlight, aim: v.aim, mazeBest: v.mazeBest }; }),
      drones: this.drones.map(p => ({ id: p.id, name: p.name, color: p.color, health: p.health, x: p.body.position.x, y: p.body.position.y, z: p.body.position.z, yaw: Math.atan2(-p.aim.x, -p.aim.z), vx: 0, vz: p.body.velocity.z, appearance: { roughness: .7, metalness: .5, finish: 'brushed', accessory: 'antenna' } })),
      projectiles: this.projectiles.map(s => ({ id: s.id, x: s.x, y: s.y, z: s.z, weapon: s.weapon })), tiles: this.level === 2 ? this.tileOwners : [], tileVersion: this.tileVersion, crystals: this.crystals, meteors: this.meteors, brokenTiles: this.level === 4 ? this.brokenTiles : [] };
  }
}
