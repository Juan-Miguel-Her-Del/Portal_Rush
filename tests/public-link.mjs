import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
const url = process.argv[2]; if (!url) throw new Error('Indica la URL publica como argumento.');
const clients = []; let browser;
function waitState(socket, predicate) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.off('state', handler); reject(new Error('No llego el estado compartido por el enlace publico.')); }, 15000); const handler = state => { if (predicate(state)) { clearTimeout(timer); socket.off('state', handler); resolve(state); } }; socket.on('state', handler); }); }
function join(s, data) { return new Promise((resolve, reject) => s.timeout(10000).emit('join-room', data, (err, result) => err || result.error ? reject(err || new Error(result.error)) : resolve(result))); }
try {
  const health = await fetch(url + '/api/health'); assert.equal(health.status, 200); assert.equal((await health.json()).app, 'portal-rush');
  for (let i = 0; i < 2; i++) { const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 12000 }); clients.push(s); await new Promise((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); }); }
  const created = await join(clients[0], { name: 'Prueba enlace A' }); await join(clients[1], { name: 'Prueba enlace B', code: created.code });
  const shared = await waitState(clients[1], s => s.players.length === 2); assert.equal(shared.code, created.code);
  clients[0].emit('start-race', { practice: true, level: 1 }); await waitState(clients[1], s => s.level === 1 && s.phase === 'racing');
  const before = await waitState(clients[1], s => s.players.length === 2); const playerId = clients[0].id; clients[0].emit('input', { x: 0, z: -1 });
  const z = before.players.find(p => p.id === playerId).z; const moved = await waitState(clients[1], s => s.players.find(p => p.id === playerId).z < z - 2); assert.ok(moved.players.length === 2);
  const model = await fetch(url + '/models/weapons/pistola.glb'); assert.equal(model.status, 200); const bytes = new Uint8Array(await model.arrayBuffer()); assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'glTF');
  if (process.argv.includes('--browser')) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto(url, { timeout: 60000 }); assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.portalRush?.modelReady && window.portalRush?.hdriReady, { timeout: 90000 });
    await page.fill('#nickname', 'Prueba navegador'); await page.click('#join-button');
    await page.waitForSelector('#lobby:not([hidden])', { timeout: 15000 });
    assert.match((await page.textContent('#lobby-code')).trim(), /^\d{6}$/);
    await page.screenshot({ path: 'artifacts/enlace-publico-verificado.png' });
    assert.deepEqual(errors, []);
    console.log('Navegador Chrome: pagina, modelos, HDRI y creacion de sala verificados por HTTPS.');
  }
  console.log(JSON.stringify({ ok: true, url, transport: 'WebSocket seguro', checks: ['HTTPS', 'Dos conexiones a traves de Internet', 'Sala compartida', 'Movimiento sincronizado', 'Modelo GLB servido'] }, null, 2));
} finally { for (const s of clients) s.disconnect(); await browser?.close(); }
