import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createGameServer } from '../server.js';
import { MAZE, mazeCenter } from '../shared/maze.js';
const game = createGameServer(); await new Promise(r => game.http.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${game.http.address().port}`;
await mkdir('artifacts', { recursive: true }); let browser; const peers = [], errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const a = await browser.newPage({ viewport: { width: 1280, height: 850 } }); a.on('pageerror', e => errors.push(e.message)); a.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await a.goto(url); await a.waitForFunction(() => window.portalRush?.modelReady, { timeout: 60000 });
  await a.fill('#nickname', 'Explorador'); await a.click('#join-button'); await a.waitForSelector('#lobby:not([hidden])'); const code = await a.textContent('#lobby-code');
  for (let i = 0; i < 3; i++) { const s = io(url, { transports: ['websocket'], forceNew: true }); peers.push(s); await new Promise(r => s.on('connect', r)); const joined = await new Promise(r => s.emit('join-room', { name: 'Tripulante ' + i, code }, r)); assert.equal(joined.code, code); }
  await a.selectOption('#practice-level', '5'); await a.click('#start'); await a.waitForFunction(() => window.portalRush.state?.level === 5 && window.portalRush.state.phase === 'racing', { timeout: 20000 });
  const room = game.rooms.get(code), id = await a.evaluate(() => window.portalRush.myId), p = room.players.get(id);
  for (const q of room.players.values()) if (q.id !== id) q.flashlight = false;
  await a.waitForTimeout(700); await a.waitForFunction(() => window.portalRush.lighting.dark && window.portalRush.lighting.flashlights.filter(l => l.visible).length === 4);
  const lighting = await a.evaluate(() => window.portalRush.lighting); assert.equal(lighting.hemisphere, 0); assert.equal(lighting.sun, 0); assert.equal(lighting.rim, 0); assert.equal(lighting.environmentIntensity, 0); assert.ok(lighting.flashlights.every(l => l.castShadow)); assert.equal(lighting.flashlights.filter(l => l.intensity > 0).length, 1);
  async function luminance(buffer) { return a.evaluate(async base64 => { const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); const data = context.getImageData(Math.floor(image.width * .35), Math.floor(image.height * .35), Math.floor(image.width * .3), Math.floor(image.height * .3)).data; let value = 0; for (let i = 0; i < data.length; i += 4) value += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; return value / (data.length / 4); }, buffer.toString('base64')); }
  const on = await a.screenshot({ path: 'artifacts/laberinto-linterna-encendida.png' }), onLuma = await luminance(on);
  await a.keyboard.press('l'); await a.waitForFunction(() => window.portalRush.lighting.flashlights.filter(l => l.visible).every(l => l.intensity === 0)); const off = await a.screenshot({ path: 'artifacts/laberinto-linterna-apagada.png' }), offLuma = await luminance(off); assert.ok(onLuma > offLuma + 3, `La linterna debe iluminar realmente el escenario: ${onLuma} frente a ${offLuma}`); assert.equal(p.flashlight, false);
  await a.keyboard.press('l'); await a.waitForTimeout(200); const target = await a.evaluate(() => window.portalRush.lighting.flashlights[0].target);
  await a.mouse.move(650, 420); await a.mouse.down({ button: 'right' }); await a.mouse.move(830, 450, { steps: 8 }); await a.mouse.up({ button: 'right' }); await a.waitForTimeout(300);
  const moved = await a.evaluate(() => window.portalRush.lighting.flashlights[0].target); assert.ok(Math.hypot(...moved.map((v, i) => v - target[i])) > .5); assert.ok(p.flashlight);
  const mid = mazeCenter(MAZE.checkpoint); p.body.position.set(mid.x, .55, mid.z); await a.waitForFunction(() => window.portalRush.state.players.find(p => p.id === window.portalRush.myId).checkpoint === 1);
  await a.keyboard.press('r'); await a.waitForTimeout(250); assert.ok(Math.hypot(p.body.position.x - mid.x, p.body.position.z - mid.z) < .1);
  for (const q of room.players.values()) { q.checkpoint = 1; q.body.position.set(MAZE.exit.x, .55, MAZE.exit.z); }
  await a.waitForFunction(() => window.portalRush.state.phase === 'finished'); await a.waitForFunction(() => !window.portalRush.lighting.dark); assert.equal(room.roundResults.length, 4); await a.screenshot({ path: 'artifacts/laberinto-resultados.png' }); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, players: 4, shadows: true, lightOn: onLuma, lightOff: offLuma, checks: ['Luz general apagada', 'HDRI apagado sólo en laberinto', '4 linternas individuales', 'Sombras', 'Interruptor L', 'Haz sigue la mirada', 'Checkpoint', 'Salida', 'Iluminación restaurada'] }, null, 2));
} catch (e) { console.error('Errores de navegador:', JSON.stringify(errors)); throw e; }
finally { for (const p of peers) p.disconnect(); await browser?.close(); await game.close(); }
