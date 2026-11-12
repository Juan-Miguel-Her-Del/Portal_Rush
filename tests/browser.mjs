import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createGameServer } from '../server.js';
import { MAZE, mazeCenter } from '../shared/maze.js';
const game = createGameServer(); await new Promise(r => game.http.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${game.http.address().port}`; await mkdir('artifacts', { recursive: true });
let browser; const errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } }), a = await context.newPage(), b = await context.newPage();
  for (const page of [a, b]) { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); }
  await a.goto(url); await a.waitForFunction(() => window.portalRush?.modelReady, { timeout: 60000 }); assert.ok(await a.evaluate(() => window.portalRush.hdriReady)); console.log('Assets y HDRI cargados');
  await a.screenshot({ path: 'artifacts/v2-inicio.png' });
  await a.click('#customize'); await a.waitForSelector('#garage-dialog[open]');
  await a.locator('#roughness').fill('0.83'); await a.locator('#metalness').fill('0.72'); await a.selectOption('#finish', 'carbon'); await a.selectOption('#accessory', 'halo'); await a.waitForTimeout(600); await a.screenshot({ path: 'artifacts/v2-vestuario.png' }); await a.click('#garage-save');
  await a.fill('#nickname', 'Juan'); await a.click('#join-button'); await a.waitForSelector('#lobby:not([hidden])');
  const code = await a.textContent('#lobby-code'); await b.setViewportSize({ width: 800, height: 650 }); await b.goto(url + '?sala=' + code); await b.waitForFunction(() => window.portalRush?.modelReady, { timeout: 60000 }); await b.fill('#nickname', 'Luna'); await b.click('#join-button');
  await a.waitForFunction(() => window.portalRush.state?.players.length === 2);
  await a.bringToFront();
  const room = game.rooms.get(code), id = await a.evaluate(() => window.portalRush.myId), p = room.players.get(id), q = [...room.players.values()].find(p => p.id !== id);
  assert.equal(p.appearance.roughness, .83); assert.equal(p.appearance.finish, 'carbon'); assert.notEqual(p.color, q.color);
  await a.click('#start'); await a.waitForFunction(() => window.portalRush.state?.phase === 'racing', { timeout: 20000 }); console.log('Mercurio iniciado con dos jugadores');
  const z = p.body.position.z; await a.keyboard.down('w'); await a.waitForTimeout(800); await a.keyboard.up('w'); await a.waitForTimeout(200); assert.ok(p.body.position.z < z - 3);
  p.body.position.set(-2.7, .55, 2); p.body.velocity.setZero(); await a.waitForTimeout(180);
  let jumpPeak = .55, measureJump = true; const tick = room.tick.bind(room); room.tick = (now, dt) => { tick(now, dt); if (measureJump) jumpPeak = Math.max(jumpPeak, p.body.position.y); };
  await a.keyboard.press('Space'); for (let i = 0; i < 40 && jumpPeak <= 1.2; i++) await new Promise(r => setTimeout(r, 50)); measureJump = false; assert.ok(jumpPeak > 1.2, 'El teclado debe producir un salto físico real');
  await a.screenshot({ path: 'artifacts/v2-mercurio.png' });
  p.body.position.set(0, 1, -45); await a.waitForFunction(() => window.portalRush.state.players.find(p => p.id === window.portalRush.myId).checkpoint === 1);
  p.body.position.set(0, 1, -51); await a.waitForFunction(() => window.portalRush.state.players.find(p => p.id === window.portalRush.myId).checkpoint === 2);
  p.body.position.set(0, 1, -83); await a.waitForFunction(() => window.portalRush.state.players.find(p => p.id === window.portalRush.myId).checkpoint === 3);
  for (const v of room.players.values()) { v.checkpoint = 3; v.body.position.set(0, 1, -104); }
  await a.waitForFunction(() => window.portalRush.state.phase === 'boarding'); await a.waitForSelector('#results:not([hidden])'); await a.screenshot({ path: 'artifacts/v2-cohete.png' });
  async function nextLevel(level) {
    room.travelAt = Date.now() - 500; room.nextAt = Date.now() + 60000;
    await a.waitForFunction(() => window.portalRush.state.phase === 'travel');
    if (level === 1) { await a.waitForTimeout(200); await a.screenshot({ path: 'artifacts/v2-viaje.png' }); }
    room.nextAt = Date.now() - 1;
    await a.waitForFunction(level => window.portalRush.state.level === level && window.portalRush.state.phase === 'countdown', level, { timeout: 20000 });
    await a.waitForFunction(() => window.portalRush.state.phase === 'racing', { timeout: 20000 });
    await b.waitForFunction(level => window.portalRush.state.level === level, level); console.log('Planeta', level, 'sincronizado');
  }
  await nextLevel(1); p.body.position.set(-12, .55, 10); q.body.position.set(-12, .55, 4); p.spawnUntil = q.spawnUntil = 0; await a.waitForTimeout(300);
  await a.keyboard.down('f'); await a.waitForFunction(() => window.portalRush.state.players.find(p => p.id === window.portalRush.myId).kills >= 1, { timeout: 12000 }); await a.keyboard.up('f');
  await a.screenshot({ path: 'artifacts/v2-marte.png' }); assert.ok(p.kills >= 1); console.log('Disparos reales y primera eliminación verificados');
  p.kills = 9; q.health = 100; q.spawnUntil = 0; q.deadUntil = 0; p.body.position.set(-12, .55, 10); q.body.position.set(-12, .55, 4); p.shotAt = 0; await a.waitForTimeout(350); await a.keyboard.down('f'); await a.waitForFunction(() => window.portalRush.state.phase === 'boarding', { timeout: 12000 }); await a.keyboard.up('f');
  await nextLevel(2); const startZ = p.body.position.z; await a.keyboard.down('w'); await a.waitForTimeout(1000); await a.keyboard.up('w'); await a.waitForTimeout(150); assert.ok(p.territory > 1); assert.ok(p.body.position.z < startZ - 3);
  p.body.position.set(0, .55, 0); q.body.position.set(1.5, .55, 0); await a.waitForTimeout(150); await a.keyboard.press('e'); await a.waitForTimeout(200); assert.ok(p.pushAt > 0); await a.screenshot({ path: 'artifacts/v2-neptuno.png' });
  room.endsAt = Date.now() - 1; await a.waitForFunction(() => window.portalRush.state.phase === 'boarding');
  await nextLevel(3); const c = room.crystals[0]; p.body.position.set(c.x, c.y, c.z); await a.waitForFunction(() => window.portalRush.state.players.find(p => p.id === window.portalRush.myId).crystals >= 1);
  await a.screenshot({ path: 'artifacts/v2-urano.png' }); p.crystals = 14; c.availableAt = 0; p.body.position.set(c.x, c.y, c.z); await a.waitForFunction(() => window.portalRush.state.phase === 'boarding');
  await nextLevel(4); room.nextMeteorAt = Date.now() + 100000; room.meteors.push({ id: 800, tile: 55, x: 1.5, z: 1.5, impactAt: Date.now() + 2500 }); await a.waitForTimeout(300); await a.screenshot({ path: 'artifacts/v2-venus.png' });
  p.body.position.set(1.5, .55, 1.5); q.body.position.set(-10, .55, -10); room.meteors[0].impactAt = Date.now() - 1;
  await a.waitForFunction(() => window.portalRush.state.phase === 'boarding', { timeout: 15000 });
  await nextLevel(5); await a.waitForFunction(() => window.portalRush.lighting.dark); assert.equal(await a.evaluate(() => window.portalRush.lighting.environmentIntensity), 0); await a.screenshot({ path: 'artifacts/v2-saturno.png' });
  const mid = mazeCenter(MAZE.checkpoint); p.body.position.set(mid.x, .55, mid.z); await a.waitForFunction(() => window.portalRush.state.players.find(p => p.id === window.portalRush.myId).checkpoint === 1);
  for (const v of room.players.values()) { v.checkpoint = 1; v.body.position.set(MAZE.exit.x, .55, MAZE.exit.z); }
  await a.waitForFunction(() => window.portalRush.state.phase === 'finished', { timeout: 15000 }); await a.waitForSelector('#results:not([hidden])'); await a.screenshot({ path: 'artifacts/v2-final.png' }); assert.equal(room.history.length, 6); assert.ok(p.points > 0);
  await a.click('#again'); await a.waitForFunction(() => window.portalRush.state.level === 0 && window.portalRush.state.phase === 'countdown'); assert.equal(p.points, 0);
  await a.click('#help'); assert.equal(await a.locator('#help-dialog').isVisible(), true); await a.locator('#help-dialog .close').click(); await b.close(); await a.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await mobile.goto(url); await mobile.waitForFunction(() => window.portalRush?.modelReady, { timeout: 60000 }); await mobile.screenshot({ path: 'artifacts/v2-movil.png' }); assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []); console.log('OK: seis planetas, dos clientes, vestuario PBR, HDRI, linternas, disparos, empujones, cohete, puntuación y reinicio.');
} catch (error) { console.error('Errores de navegador:', JSON.stringify(errors)); throw error; }
finally { await browser?.close(); await game.close(); }
