import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createGameServer } from '../server.js';
import { WEAPON_MODELS } from '../shared/weapon-assets.js';
const game = createGameServer(); await new Promise(r => game.http.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + game.http.address().port;
await mkdir('artifacts/weapons', { recursive: true }); let browser, peer; const errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.portalRush?.modelReady, { timeout: 60000 }); await page.fill('#nickname', 'Piloto'); await page.click('#join-button'); await page.waitForSelector('#lobby:not([hidden])'); const code = await page.textContent('#lobby-code');
  peer = io(url, { transports: ['websocket'], forceNew: true }); await new Promise(r => peer.on('connect', r)); await new Promise(r => peer.emit('join-room', { name: 'Rival', code }, r));
  await page.selectOption('#practice-level', '1'); await page.click('#start'); await page.waitForFunction(() => window.portalRush.state?.phase === 'racing', { timeout: 20000 }); const room = game.rooms.get(code), id = await page.evaluate(() => window.portalRush.myId), a = room.players.get(id), b = [...room.players.values()].find(p => p.id !== id);
  a.body.position.set(-12, .55, 10); b.body.position.set(-12, .55, 6); a.spawnUntil = b.spawnUntil = 0; a.shotAt = 0;
  await page.waitForTimeout(250); await page.keyboard.down('f'); await page.waitForFunction(() => window.portalRush.lastHit?.damage > 0, { timeout: 10000 }); await page.waitForSelector('#hit-marker.visible'); await page.screenshot({ path: 'artifacts/impacto-confirmado.png' });
  await page.waitForFunction(() => window.portalRush.lastHit?.fatal === true, { timeout: 10000 }); await page.keyboard.up('f'); assert.ok(a.kills >= 1); assert.equal(await page.evaluate(() => window.portalRush.lastHit.id), id); console.log('Impacto y eliminación confirmados por servidor');
  const last = await page.evaluate(() => window.portalRush.lastHit.receivedAt);
  a.body.position.set(0, .55, 7); b.body.position.set(0, .55, -6); b.health = 100; b.spawnUntil = 0; a.shotAt = 0; await page.waitForTimeout(200); await page.keyboard.down('f'); await page.waitForTimeout(700); await page.keyboard.up('f'); assert.equal(await page.evaluate(() => window.portalRush.lastHit.receivedAt), last);
  a.body.position.set(-12, .55, 10); b.body.position.set(-12, .55, 6); b.spawnUntil = Date.now() + 60000; a.shotAt = 0; await page.waitForTimeout(200); await page.keyboard.down('f'); await page.waitForTimeout(500); await page.keyboard.up('f'); assert.equal(await page.evaluate(() => window.portalRush.lastHit.receivedAt), last);
  for (let index = 0; index < 10; index++) { a.kills = index; await page.waitForFunction(index => window.portalRush.weapon.index === index && window.portalRush.weapon.ready, index); assert.equal(await page.evaluate(() => window.portalRush.weapon.model), WEAPON_MODELS[index]); await page.waitForTimeout(140); await page.screenshot({ path: `artifacts/weapons/${WEAPON_MODELS[index]}.png` }); }
  assert.deepEqual(errors, []); console.log('OK: 10 modelos distintos; confirmación real; protección y coberturas sin falsos impactos.');
} catch (e) { console.error('Errores:', errors); throw e; }
finally { peer?.disconnect(); await browser?.close(); await game.close(); }
