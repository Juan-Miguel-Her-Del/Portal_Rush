import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorld } from './visuals.js';
import { createAvatar, updateAvatar, disposeAvatar } from './avatars.js';
import { createGarage } from './garage.js';
import { PLANETS, WEAPONS, PAINT_COLS } from '/shared/planets.js';
import { MAZE } from '/shared/maze.js';
import { createWeaponRig, weaponsReady } from './weapons.js';
import { createGraphics } from './graphics.js';
const $ = id => document.getElementById(id), socket = window.io({ reconnectionAttempts: 8, transports: ['websocket', 'polling'], tryAllTransports: true });
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#191321', .005);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .1, 500); camera.position.set(39, 29, 27); scene.add(camera);
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
catch { $('loading-detail').textContent = 'Activa la aceleración gráfica del navegador para usar WebGL.'; throw new Error('WebGL no disponible'); }
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2; $('world').appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 0, -25); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 5; controls.maxDistance = 100; controls.maxPolarAngle = Math.PI * .47;
const hemisphere = new THREE.HemisphereLight('#d9e5ff', '#35263f', 1.8); scene.add(hemisphere);
const sun = new THREE.DirectionalLight('#fff0d4', 2.6); sun.position.set(-18, 35, 12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: .5, far: 100 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .05; scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight('#b596ff', 1.5); rim.position.set(20, 10, -40); scene.add(rim);
const world = createWorld(scene, renderer);
const graphics = createGraphics(renderer, sun, world, scene);
let modelReady = false, mode = 'create', state = null, myId = null, myCode = null, lastState = null, serverOffset = 0, playing = false, lastPhase = '', lastLevel = -1, toastUntil = 0, soundOn = localStorage.getItem('portal-sound') !== 'off';
const keys = new Set(), avatars = new Map(), followTarget = new THREE.Vector3(), lastTarget = new THREE.Vector3(), delta = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), movement = new THREE.Vector3(), aim = new THREE.Vector3();
const radialCenter = new THREE.Vector3(0, 0, -45), avatarFlat = new THREE.Vector3(), portalBox = new THREE.Box3(new THREE.Vector3(-1.8, -.2, -52.3), new THREE.Vector3(1.8, 4, -49.8));
const clock = new THREE.Clock(), input = { x: 0, z: 0, yaw: 0, jump: false, push: false, fire: false, flashlight: true, aim: { x: 0, y: 0, z: -1 } };
let torchOn = true;
let uiTime = 0, fpsTime = 0, frames = 0, pingTime = 0, firing = false, yaw = 0, pitch = 0, dragAim = false, resultKey = '', fpsSkip = true, touchAim = null;
const garage = createGarage(() => world.hdr, profile => { if (myId) socket.emit('customize', profile); toast('Traje guardado. Tu color se ajustará si ya está ocupado.'); });
const fpWeapon = createWeaponRig({ firstPerson: true }), fpGun = fpWeapon.root; fpGun.position.set(.28, -.27, -.75); fpGun.visible = false; camera.add(fpGun);
const fpTorch = new THREE.Group(), torchBody = new THREE.Mesh(new THREE.CylinderGeometry(.065, .08, .4, 14), new THREE.MeshStandardMaterial({ color: '#333b49', metalness: .8, roughness: .32 })); torchBody.rotation.x = Math.PI / 2; fpTorch.add(torchBody);
const torchLens = new THREE.Mesh(new THREE.CircleGeometry(.062, 16), new THREE.MeshBasicMaterial({ color: '#fff2d0' })); torchLens.rotation.y = Math.PI; torchLens.position.z = -.205; fpTorch.add(torchLens); fpTorch.position.set(.25, -.23, -.55); fpTorch.visible = false; camera.add(fpTorch);

// Sonido posicional del portal y efectos globales, todos almacenados localmente.
const listener = new THREE.AudioListener(); camera.add(listener);
const ambient = new THREE.PositionalAudio(listener); ambient.setRefDistance(4); ambient.setRolloffFactor(1.5); ambient.setLoop(true); ambient.setVolume(.3);
const emitter = new THREE.Object3D(); emitter.position.set(0, 1.5, -51); emitter.add(ambient); scene.add(emitter);
const globalAudio = new THREE.Audio(listener), hitAudio = new THREE.Audio(listener), audioLoader = new THREE.AudioLoader(), buffers = {};
for (const name of ['ambient', 'jump', 'checkpoint', 'teleport', 'finish', 'shot', 'push', 'crystal', 'meteor', 'launch', 'hit', 'kill']) audioLoader.load(`/sounds/${name}.wav`, buffer => { buffers[name] = buffer; if (name === 'ambient') { ambient.setBuffer(buffer); if (listener.context.state === 'running') ambient.play(); } });
function activateAudio() { listener.context.resume().then(() => { if (ambient.buffer && !ambient.isPlaying) ambient.play(); }).catch(() => {}); }
function syncSound() { $('sound').style.color = soundOn ? '#b4ff62' : '#a19bb3'; $('sound').setAttribute('aria-label', soundOn ? 'Silenciar sonido' : 'Activar sonido'); listener.setMasterVolume(soundOn ? .65 : 0); }
let lastShotSound = 0;
function sound(name) { if (!soundOn || !buffers[name]) return; if (name === 'shot') { if (performance.now() - lastShotSound < 110) return; lastShotSound = performance.now(); } if (globalAudio.isPlaying) globalAudio.stop(); globalAudio.setBuffer(buffers[name]); globalAudio.setVolume(name === 'shot' ? .2 : .5); globalAudio.play(); }
syncSound();
Promise.all([world.ready, weaponsReady]).then(() => { modelReady = true; $('loading').hidden = true; updateJoinButton(); }).catch(error => { $('loading-detail').textContent = 'No se pudieron cargar los recursos. Ejecuta INICIAR.bat y recarga.'; console.error(error); });
let hitUntil = 0, hitFatalUntil = 0, lastHit = null, lastHitSound = 0, hitTotal = 0, hitTarget = null, hitAt = 0;
function confirmHit(data) {
  const now = performance.now(); lastHit = { ...data, receivedAt: now };
  hitTotal = data.target === hitTarget && now - hitAt < 150 ? hitTotal + data.damage : data.damage; hitTarget = data.target; hitAt = now;
  if (data.fatal) hitFatalUntil = now + 480;
  const fatal = data.fatal || now < hitFatalUntil; hitUntil = now + (fatal ? 480 : 260);
  $('hit-marker').classList.add('visible'); $('hit-marker').classList.toggle('fatal', fatal); $('hit-info').textContent = `${fatal ? 'ELIMINACIÓN' : 'IMPACTO'} · −${Math.round(hitTotal)}`;
  const name = data.fatal ? 'kill' : 'hit'; if (soundOn && buffers[name] && (data.fatal || now - lastHitSound > 75)) { if (hitAudio.isPlaying) hitAudio.stop(); hitAudio.setBuffer(buffers[name]); hitAudio.setVolume(.55); hitAudio.play(); lastHitSound = now; }
}

function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); toastUntil = performance.now() + 3100; }
function timeString(ms) { const s = Math.max(0, ms) / 1000; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; }
function updateJoinButton() { $('join-button').disabled = !modelReady || !socket.connected; $('join-button').innerHTML = modelReady ? `${mode === 'create' ? 'Crear mi sala' : 'Unirme a la tripulación'} <span>↗</span>` : 'Preparando planetas…'; }
function setMode(value) { mode = value; $('code-field').hidden = value !== 'join'; $('room-code').required = value === 'join'; $('create-tab').classList.toggle('selected', value === 'create'); $('join-tab').classList.toggle('selected', value === 'join'); $('form-error').textContent = ''; updateJoinButton(); }
$('create-tab').onclick = () => setMode('create'); $('join-tab').onclick = () => setMode('join'); $('nickname').value = localStorage.getItem('portal-name') || '';
const initialCode = new URLSearchParams(location.search).get('sala'); if (initialCode) { setMode('join'); $('room-code').value = initialCode.slice(0, 6); }
$('join-form').onsubmit = e => {
  e.preventDefault(); activateAudio(); $('form-error').textContent = ''; $('join-button').disabled = true;
  const name = $('nickname').value.trim() || 'Piloto'; localStorage.setItem('portal-name', name);
  socket.timeout(5000).emit('join-room', { name, code: mode === 'join' ? $('room-code').value.trim() : '', appearance: garage.profile }, (err, result) => {
    updateJoinButton(); if (err || result.error) { $('form-error').textContent = result?.error || 'El servidor no responde.'; return; }
    myId = result.id; myCode = result.code; $('home').hidden = true; $('track-label').hidden = true; $('lobby').hidden = false; $('lobby-code').textContent = myCode; if (lastState?.code === myCode) handleState(lastState);
  });
};
function releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); firing = false; dragAim = false; }
function openGarage() { if (playing) return; activateAudio(); garage.open(); }
$('customize').onclick = $('lobby-customize').onclick = openGarage;
$('sound').onclick = () => { activateAudio(); soundOn = !soundOn; localStorage.setItem('portal-sound', soundOn ? 'on' : 'off'); syncSound(); };
$('help').onclick = () => { keys.clear(); releaseMouse(); $('help-dialog').showModal(); }; $('help-dialog').querySelector('.close').onclick = () => $('help-dialog').close();
function start() { activateAudio(); const level = Number($('practice-level').value); socket.emit('start-race', { practice: level >= 0, level: Math.max(0, level) }); }
$('start').onclick = start; $('again').onclick = start;
function leave() {
  socket.emit('leave-room'); releaseMouse(); myId = null; myCode = null; state = null; lastPhase = ''; lastLevel = -1; playing = false; keys.clear(); document.body.classList.remove('playing', 'boarding', 'travel');
  $('home').hidden = false; $('track-label').hidden = false; for (const id of ['lobby', 'hud', 'results', 'countdown', 'touch-controls', 'mission', 'planet-route', 'crosshair', 'travel-screen']) $(id).hidden = true;
  for (const a of avatars.values()) { scene.remove(a.group); disposeAvatar(a); } avatars.clear(); world.switchLevel(0); controls.enabled = true; controls.maxDistance = 100; camera.position.set(39, 29, 27); controls.target.set(0, 0, -25); fpGun.visible = fpTorch.visible = false;
}
$('leave').onclick = leave; $('exit-results').onclick = leave;
$('copy-code').onclick = async () => { try { await navigator.clipboard.writeText(myCode); toast('Código copiado: ' + myCode); } catch { toast('Comparte el código: ' + myCode); } };
socket.on('connect', () => { $('connection').textContent = 'SERVIDOR CONECTADO'; $('connection').classList.add('online'); updateJoinButton(); });
socket.on('disconnect', () => { $('connection').textContent = 'SIN CONEXIÓN'; $('connection').classList.remove('online'); updateJoinButton(); if (myId) { leave(); toast('Se perdió la conexión. Vuelve a entrar en una sala.'); } });
socket.on('connect_error', () => $('connection').textContent = 'SERVIDOR DESCONECTADO');

for (let i = 0; i < PLANETS.length; i++) {
  const p = PLANETS[i]; const home = document.createElement('div'); home.className = 'home-planet'; home.innerHTML = `<i style="background:${p.color}"></i>${p.name}`; $('home-planets').appendChild(home);
  const node = document.createElement('div'); node.className = 'route-node'; node.innerHTML = `<i style="background:${p.color}"></i>${p.name}`; $('planet-route').appendChild(node);
}
function playerRow(p, host) { const row = document.createElement('div'); row.className = 'player-row'; const dot = document.createElement('i'); dot.className = 'player-dot'; dot.style.background = p.color; const name = document.createElement('span'); name.textContent = p.name + (p.id === myId ? ' (tú)' : ''); const badge = document.createElement('small'); badge.textContent = p.id === host ? 'ANFITRIÓN' : 'LISTO'; row.append(dot, name, badge); return row; }
function rankedPlayers(players) { const level = state?.level || 0; return [...players].sort((a, b) => level === 0 || level === 5 ? (a.finish ?? Infinity) - (b.finish ?? Infinity) || (level === 5 ? (b.mazeBest || 0) - (a.mazeBest || 0) : b.checkpoint - a.checkpoint || a.z - b.z) : level === 1 ? b.kills - a.kills : level === 2 ? b.territory - a.territory : level === 3 ? b.crystals - a.crystals : Number(a.out) - Number(b.out) || (b.survived || 0) - (a.survived || 0)); }
function metric(p, level) { return level === 0 ? p.finish !== null ? timeString(p.finish) : `${p.checkpoint}/3` : level === 5 ? p.finish !== null ? timeString(p.finish) : 'EN RUTA' : level === 1 ? `${p.kills}/10` : level === 2 ? `${p.territory} ▧` : level === 3 ? `${p.crystals}/15` : p.out ? 'FUERA' : 'EN PIE'; }
let lobbySignature = '', rankSignature = '';
function syncRanking() {
  if (!state) return; const ranked = rankedPlayers(state.players), signature = JSON.stringify(ranked.map(p => [p.id, p.color, p.kills, p.territory, p.crystals, p.out, p.checkpoint, p.finish, p.points, p.mazeBest]));
  if (signature === rankSignature) return; rankSignature = signature;
  $('ranking').replaceChildren(...ranked.map((p, i) => { const row = document.createElement('div'); row.className = 'rank-row'; const pos = document.createElement('span'); pos.className = 'place'; pos.textContent = String(i + 1).padStart(2, '0'); const dot = document.createElement('i'); dot.className = 'player-dot'; dot.style.background = p.color; const name = document.createElement('span'); name.className = 'name'; name.textContent = p.name + (p.id === myId ? ' · tú' : ''); const value = document.createElement('span'); value.className = 'rank-time'; value.textContent = metric(p, state.level); row.append(pos, dot, name, value); return row; }));
}
function resetCamera(me) {
  controls.enabled = ![1, 5].includes(state.level); yaw = state.level === 5 && MAZE.cells[MAZE.start] & 1 ? -Math.PI / 2 : 0; pitch = state.level === 5 ? -.04 : 0;
  lastTarget.set(me.x, me.y + .6, me.z); controls.target.copy(lastTarget); camera.position.copy(lastTarget); camera.position.y += 5; camera.position.z += 11; controls.minDistance = 5; controls.maxDistance = 20;
}
function handleState(next) {
  lastState = next; if (!myId || next.code !== myCode) return;
  state = next; serverOffset = next.now - Date.now();
  const all = [...next.players, ...next.drones], alive = new Set();
  for (const p of all) {
    alive.add(p.id); if (!avatars.has(p.id)) { const a = createAvatar(p); avatars.set(p.id, a); scene.add(a.group); }
    const a = avatars.get(p.id); a.target.set(p.x, p.y, p.z); a.yaw = p.yaw; a.speed = Math.hypot(p.vx, p.vz); updateAvatar(a, p, next.level, next.now);
    if (a.group.position.distanceToSquared(a.target) > 100) a.group.position.copy(a.target);
  }
  const local = next.players.find(p => p.id === myId); if (local) fpWeapon.setWeapon(Math.min(local.kills, 9));
  for (const [id, a] of avatars) if (!alive.has(id)) { scene.remove(a.group); disposeAvatar(a); avatars.delete(id); }
  const ls = next.players.map(p => p.id + p.name + p.color).join() + next.host;
  if (ls !== lobbySignature) { lobbySignature = ls; $('lobby-players').replaceChildren(...next.players.map(p => playerRow(p, next.host))); }
  const isHost = myId === next.host; $('start').disabled = !isHost; $('practice-level').disabled = !isHost; $('again').disabled = !isHost;
  $('host-note').textContent = isHost ? 'Torneo completo o practica un planeta. También puedes jugar solo.' : 'El anfitrión elige la misión e inicia la partida.';
  $('player-count').textContent = `${next.players.length} / 4`; syncRanking();
  const me = next.players.find(p => p.id === myId);
  if (next.level !== lastLevel) {
    world.switchLevel(next.level); document.documentElement.style.setProperty('--planet', PLANETS[next.level].color); $('race-info')?.setAttribute('data-planet', PLANETS[next.level].name);
    torchOn = true;
    for (const button of document.querySelectorAll('[data-key]')) { const key = button.dataset.key; if (key === 'KeyL') button.hidden = next.level !== 5; if (key === 'KeyF') button.hidden = next.level !== 1; if (key === 'KeyE') button.hidden = ![2, 3, 4].includes(next.level); if (key === 'Space') button.hidden = next.level === 5; }
    $('hud').querySelector('.race-info .eyebrow').textContent = `${String(next.level + 1).padStart(2, '0')} / ${PLANETS[next.level].name.toUpperCase()}`;
    $('hud').querySelector('.controls').innerHTML = next.level === 5 ? '<span><kbd>W A S D</kbd> Caminar</span><span><kbd>RATÓN</kbd> Mirar</span><span><kbd>L</kbd> Linterna</span><span><kbd>R</kbd> Checkpoint</span>' : '<span><kbd>W A S D</kbd> Mover</span><span><kbd>ESPACIO</kbd> Saltar</span>' + (next.level === 1 ? '<span><kbd>CLIC / F</kbd> Disparar</span><span><kbd>ESC</kbd> Liberar ratón</span>' : next.level > 1 ? '<span><kbd>E</kbd> Empujar</span><span><kbd>R</kbd> ' + (next.level === 4 ? 'Retirarse' : 'Reaparecer') + '</span>' : '<span><kbd>R</kbd> Checkpoint</span><span><kbd>RATÓN</kbd> Girar cámara</span>');
    for (let i = 0; i < $('planet-route').children.length; i++) { $('planet-route').children[i].classList.toggle('current', i === next.level); $('planet-route').children[i].classList.toggle('done', i < next.level); }
    const rp = world.rocketRoot.position; emitter.position.set(next.level === 0 ? 0 : rp.x, 1.5, next.level === 0 ? -51 : rp.z); resultKey = ''; lastLevel = next.level;
  }
  if (next.phase !== lastPhase) {
    if (next.phase === 'countdown') {
      playing = true; keys.clear(); firing = false; $('lobby').hidden = $('results').hidden = $('travel-screen').hidden = true;
      $('hud').hidden = $('planet-route').hidden = $('mission').hidden = false; document.body.classList.add('playing'); document.body.classList.remove('boarding', 'travel'); releaseMouse();
      if (me) resetCamera(me); $('touch-controls').hidden = !matchMedia('(pointer: coarse)').matches;
    }
    if (next.phase === 'racing') { toast(PLANETS[next.level].description); sound('checkpoint'); }
    if (next.phase === 'boarding' || next.phase === 'finished') { keys.clear(); releaseMouse(); controls.enabled = true; document.body.classList.toggle('boarding', next.phase === 'boarding'); $('touch-controls').hidden = true; showResults(); sound('finish'); if (me) resetCamera(me); controls.enabled = true; }
    if (next.phase === 'travel') {
      releaseMouse(); controls.enabled = false; $('results').hidden = true; $('travel-screen').hidden = false; document.body.classList.add('travel'); document.body.classList.remove('boarding'); const dest = PLANETS[next.level + 1]; $('next-planet').textContent = dest.name; $('next-game').textContent = dest.game; sound('launch');
    }
    lastPhase = next.phase;
  }
}
socket.on('state', handleState);
function showResults() {
  const final = state.phase === 'finished', key = state.level + ':' + state.finishedAt + ':' + final; if (key === resultKey) return; resultKey = key; $('results').hidden = false;
  $('results').querySelector('.eyebrow').textContent = final && !state.practice ? 'EXPEDICIÓN COMPLETADA' : PLANETS[state.level].name.toUpperCase() + ' · RESULTADOS';
  $('results').querySelector('h2').textContent = final ? 'La tripulación triunfa.' : '¡Todos al cohete!';
  const total = final && !state.practice; const list = total ? [...state.players].sort((a, b) => b.points - a.points) : state.roundResults;
  const winners = list.filter(p => total ? p.points === list[0]?.points : p.rank === 1);
  $('result-message').textContent = winners.length > 1 ? `Empate entre ${winners.map(p => p.name).join(' y ')}.` : total ? `${list[0]?.name || 'La tripulación'} ganó el torneo.` : `${state.roundResults[0]?.name || 'Un piloto'} ganó en ${PLANETS[state.level].name}.`;
  $('result-list').replaceChildren(...list.map((p, i) => { const row = document.createElement('div'); row.className = 'result-row'; const place = document.createElement('span'); place.textContent = String(total ? list.findIndex(q => q.points === p.points) + 1 : p.rank).padStart(2, '0'); place.style.color = p.color; const info = document.createElement('div'), name = document.createElement('span'), small = document.createElement('small'); name.textContent = p.name; small.textContent = total ? 'Puntos acumulados en los seis planetas' : `${metric(p, state.level)} · Total: ${p.total} puntos`; info.append(name, small); const pts = document.createElement('strong'); pts.textContent = total ? `${p.points} pts` : `+${p.points}`; row.append(place, info, pts); return row; }));
  $('again').hidden = !final; $('again').firstChild.textContent = 'Volver a jugar '; $('exit-results').textContent = final ? 'Salir al inicio' : 'Salir de la expedición';
}
socket.on('game-event', data => {
  const mine = data.id === myId;
  if (data.event === 'shot') { avatars.get(data.id)?.gunRig.fire(); if (mine) { sound('shot'); fpWeapon.fire(); } }
  if (data.event === 'hit-confirmed' && mine) confirmHit(data);
  if (data.event === 'jump' && mine) sound('jump');
  if (data.event === 'checkpoint' && mine) { sound('checkpoint'); toast('Checkpoint guardado'); }
  if (data.event === 'teleport' && mine) { sound('teleport'); toast('Salto dimensional completado'); flash('#bca0ff'); }
  if (data.event === 'respawn' && mine) toast('De vuelta en el checkpoint');
  if (data.event === 'laser-hit' && mine) { flash('#ff364e'); toast('Láser activo · espera o salta por encima'); }
  if (data.event === 'push' && mine) { sound('push'); toast('¡Impulso orbital!'); }
  if (data.event === 'pushed' && mine) { flash('#bca0ff'); toast('¡Te empujaron!'); }
  if (data.event === 'damage' && mine) flash('#ff364e');
  if (data.event === 'elimination' && mine) { sound('checkpoint'); toast(data.kills >= 10 ? '¡Dominaste las diez armas!' : `Arma ${data.kills + 1}/10 · ${WEAPONS[data.weapon].name}`); }
  if (data.event === 'crystal' && mine) { sound('crystal'); toast(`Cristal recogido · ${data.count}/15`); }
  if (data.event === 'eliminated' && mine) { sound('meteor'); toast('Fuera de órbita · observando a la tripulación'); }
  if (data.event === 'meteor-impact') sound('meteor');
  if (data.event === 'finish') toast(mine ? '¡Llegaste al cohete! Esperando a la tripulación.' : `Un piloto llegó al cohete. ¡Quedan ${data.remaining || 20} segundos!`);
});
function flash(color) { $('portal-flash').style.background = color; $('portal-flash').classList.add('flash'); setTimeout(() => $('portal-flash').classList.remove('flash'), 70); }
function setKey(code, down) { if (down) { if (code === 'KeyL' && !keys.has(code) && state?.level === 5) { torchOn = !torchOn; input.flashlight = torchOn; socket.emit('input', input); } if (!keys.has(code) && (code === 'Space' || code === 'KeyE') && state?.phase === 'racing') { input.jump = code === 'Space'; input.push = code === 'KeyE'; socket.emit('input', input); input.jump = false; input.push = false; } keys.add(code); } else keys.delete(code); }
addEventListener('keydown', e => { if (!playing || $('help-dialog').open || !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'KeyE', 'KeyF', 'KeyL', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return; e.preventDefault(); if (e.code === 'KeyR' && !e.repeat) socket.emit('respawn'); setKey(e.code, true); });
addEventListener('keyup', e => setKey(e.code, false)); addEventListener('blur', () => { keys.clear(); firing = false; });
document.addEventListener('visibilitychange', () => { fpsTime = 0; frames = 0; fpsSkip = true; if (document.hidden) { keys.clear(); firing = false; socket.emit('input', { x: 0, z: 0, fire: false }); } });
renderer.domElement.addEventListener('pointerdown', e => { if (![1, 5].includes(state?.level) || state.phase !== 'racing' || $('help-dialog').open) return; activateAudio(); if (e.pointerType === 'touch') { touchAim = { id: e.pointerId, x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); return; } if (e.button === 0) { firing = true; if (!document.pointerLockElement) { try { const lock = renderer.domElement.requestPointerLock(); lock?.catch(() => {}); } catch {} } } if (e.button === 2) dragAim = true; });
renderer.domElement.addEventListener('pointermove', e => { if (touchAim?.id === e.pointerId) { yaw -= (e.clientX - touchAim.x) * .006; pitch = THREE.MathUtils.clamp(pitch - (e.clientY - touchAim.y) * .006, -1.3, 1.3); touchAim.x = e.clientX; touchAim.y = e.clientY; } });
addEventListener('pointerup', e => { if (touchAim?.id === e.pointerId) touchAim = null; if (e.button === 0) firing = false; if (e.button === 2) dragAim = false; });
renderer.domElement.addEventListener('pointercancel', () => touchAim = null);
addEventListener('mousemove', e => { if ([1, 5].includes(state?.level) && (document.pointerLockElement || dragAim)) { yaw -= e.movementX * .0025; pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0025, -1.3, 1.3); } });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) firing = false; });
for (const button of document.querySelectorAll('[data-key]')) { button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); activateAudio(); setKey(button.dataset.key, true); }; button.onpointerup = button.onpointercancel = () => setKey(button.dataset.key, false); }
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); graphics.resize(); });

function sendIntent() {
  if (!playing || !state || document.hidden || !['countdown', 'racing'].includes(state.phase)) return;
  const me = state.players.find(p => p.id === myId); if (!me) return; const fps = [1, 5].includes(state.level);
  if (fps) forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)); else forward.subVectors(controls.target, camera.position);
  forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize(); movement.set(0, 0, 0);
  const z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0), x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  movement.addScaledVector(forward, z).addScaledVector(right, x); if (movement.lengthSq() > 1) movement.normalize();
  if (fps) aim.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); else camera.getWorldDirection(aim);
  input.x = movement.x; input.z = movement.z; input.yaw = fps ? yaw : movement.lengthSq() > .01 ? Math.atan2(-movement.x, -movement.z) : me.yaw; input.jump = false; input.push = false; input.fire = state.level === 1 && (firing || keys.has('KeyF')); input.flashlight = torchOn; input.aim.x = aim.x; input.aim.y = aim.y; input.aim.z = aim.z;
  socket.volatile.emit('input', input);
}
setInterval(sendIntent, 1000 / 30);

function updateHUD(me, now) {
  const level = state.level, p = PLANETS[level], active = state.phase === 'racing', avatar = avatars.get(myId);
  $('mission-label').textContent = `${p.name.toUpperCase()} · OBJETIVO`;
  $('mission-goal').textContent = level === 5 ? me.finish !== null ? 'Salida encontrada' : 'Encuentra la salida' : level === 1 ? `${Math.min(me.kills + 1, 10)}/10 · ${WEAPONS[Math.min(me.kills, 9)].name}` : level === 2 ? `${me.territory} casillas · ${(me.territory / (PAINT_COLS ** 2) * 100).toFixed(1)}%` : level === 3 ? `${me.crystals} / 15 cristales` : level === 4 ? me.out ? 'Fuera de órbita' : 'Sigue en pie' : 'Llega al cohete';
  $('mission-action').textContent = level === 5 ? `L: linterna ${torchOn ? 'encendida' : 'apagada'} · ${me.checkpoint ? 'Checkpoint guardado' : 'Busca el checkpoint'}` : me.health <= 0 ? 'Regresas a la arena en un momento…' : level === 1 ? `Vida: ${Math.ceil(me.health)} · ${me.kills} eliminaciones` : level >= 2 ? `E: ${now >= me.pushAt ? 'empujón listo' : 'recargando impulso'} · ${me.points} puntos del torneo` : p.action;
  $('health-track').hidden = level !== 1; $('health-fill').style.width = `${me.health}%`;
  avatarFlat.set(me.x, 0, me.z);
  $('zone').textContent = level === 0 ? portalBox.containsPoint(avatar?.group.position || avatarFlat) ? 'Portal dimensional' : avatarFlat.distanceTo(radialCenter) < 5 ? 'Checkpoint guardado' : me.z < -88 ? 'Recta final' : me.z < -60 ? 'Campo láser' : 'Carrera láser' : p.game;
  $('coords').textContent = `X ${me.x.toFixed(1)} · Y ${me.y.toFixed(1)} · Z ${me.z.toFixed(1)}`;
  const percent = level === 5 ? (me.mazeBest || 0) / MAZE.distances[MAZE.start] * 100 : level === 0 ? (7 - me.z) / 111 * 100 : level === 1 ? me.kills * 10 : level === 2 ? me.territory / (PAINT_COLS ** 2) * 100 : level === 3 ? me.crystals / 15 * 100 : (now - state.startAt) / 900;
  $('progress').style.width = `${THREE.MathUtils.clamp(percent, 0, 100)}%`; $('checkpoint').textContent = level === 0 ? `CHECKPOINT ${me.checkpoint} / 3 · ${me.falls} CAÍDAS` : `${me.points} PUNTOS · PLANETA ${level + 1}/${PLANETS.length}`;
  $('timer').textContent = timeString([0, 5].includes(level) && me.finish !== null ? me.finish : Math.max(0, (active || state.phase === 'countdown' ? now : state.finishedAt) - state.startAt)); const left = Math.max(0, Math.ceil((state.endsAt - now) / 1000)); $('time-left').textContent = state.phase === 'boarding' ? `Despegue en ${Math.max(0, Math.ceil((state.travelAt - now) / 1000))} s` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} restantes`;
  $('crosshair').hidden = ![1, 5].includes(level) || !active || me.health <= 0;
  $('crosshair').querySelector('span').textContent = level === 5 ? 'CLIC PARA MIRAR · L LINTERNA · ESC LIBERA EL RATÓN' : 'CLIC PARA APUNTAR · F / CLIC DISPARA · ESC LIBERA EL RATÓN';
  if (state.phase === 'countdown') { $('countdown').hidden = false; $('countdown').querySelector('strong').textContent = Math.max(1, Math.ceil((state.startAt - now) / 1000)); $('countdown').querySelector('span').textContent = p.name.toUpperCase() + ' · ' + p.game.toUpperCase(); } else $('countdown').hidden = true;
}
function animate() {
  requestAnimationFrame(animate); const rawDt = clock.getDelta(), dt = Math.min(rawDt, .05), t = clock.elapsedTime, alpha = 1 - Math.exp(-18 * Math.min(rawDt, .15)), now = Date.now() + serverOffset;
  if (document.hidden) { fpsSkip = true; return; }
  if ($('garage-dialog').open) { garage.update(t); fpsSkip = true; return; }
  for (const [id, a] of avatars) { a.group.position.lerp(a.target, alpha); const diff = Math.atan2(Math.sin(a.yaw - a.group.rotation.y), Math.cos(a.yaw - a.group.rotation.y)); a.group.rotation.y += diff * alpha; const stride = Math.sin(t * 14) * Math.min(a.speed / 9, 1) * .65; a.legs[0].rotation.x = stride; a.legs[1].rotation.x = -stride; a.arms[0].rotation.x = state?.level === 1 ? -.6 : -stride; a.arms[1].rotation.x = [1, 5].includes(state?.level) ? -1.1 : stride; a.gunRig.update(dt, performance.now()); if ([1, 5].includes(state?.level) && id === myId && ['countdown', 'racing'].includes(state.phase)) a.group.visible = false; if (state?.phase === 'travel') a.group.visible = false; }
  const dark = state?.level === 5 && ['countdown', 'racing'].includes(state.phase); hemisphere.intensity = dark ? 0 : 1.8; sun.intensity = dark ? 0 : 2.6; rim.intensity = dark ? 0 : 1.5; hemisphere.visible = rim.visible = !dark; world.setDarkness(dark);
  world.update(state, dt, t, now); garage.update(t);
  if (playing && state) {
    const me = state.players.find(p => p.id === myId), a = avatars.get(myId), fps = [1, 5].includes(state.level) && ['countdown', 'racing'].includes(state.phase);
    fpGun.visible = fps && state.level === 1 && me?.health > 0; fpTorch.visible = fps && state.level === 5 && me?.health > 0; torchLens.visible = torchOn;
    if (me && a) {
      if (state.phase === 'travel') { const r = world.rocketRoot.position; camera.position.set(r.x + 17, r.y + 8, r.z + 24); camera.lookAt(r.x, r.y + 2, r.z); }
      else if (fps) { controls.enabled = false; if (me.health > 0) camera.position.set(a.group.position.x, a.group.position.y + .8, a.group.position.z); camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
      else { controls.enabled = true; const spectator = me.out ? state.players.find(p => !p.out) : null; if (spectator && avatars.has(spectator.id)) followTarget.copy(avatars.get(spectator.id).group.position); else followTarget.copy(a.group.position); followTarget.y += .6; delta.subVectors(followTarget, lastTarget); camera.position.add(delta); controls.target.add(delta); lastTarget.copy(followTarget); }
      sun.position.set(a.group.position.x - 18, 35, a.group.position.z + 12); sun.target.position.set(a.group.position.x, 0, a.group.position.z - 5);
      uiTime += dt;
      if (uiTime > .1) { uiTime = 0; updateHUD(me, now); }
    }
  } else { fpGun.visible = fpTorch.visible = false; controls.target.set(0, 0, -27); camera.position.x = 39 + Math.sin(t * .08) * 3; }
  fpWeapon.update(dt, performance.now()); if (performance.now() > hitUntil || state?.level !== 1 || !playing) $('hit-marker').classList.remove('visible');
  if (controls.enabled) controls.update(); world.updateFlashlights(state, myId, camera, avatars, torchOn); graphics.beforeRender(performance.now(), dark); renderer.render(scene, camera);
  if (modelReady) graphics.sample(rawDt);
  if (fpsSkip) { fpsSkip = false; fpsTime = 0; frames = 0; } else { fpsTime += rawDt; frames++; if (fpsTime > 1) { const fps = frames / fpsTime; $('fps').textContent = `${Math.round(fps)} FPS`; fpsTime = 0; frames = 0; } }
  pingTime += rawDt; if (pingTime > 3 && socket.connected) { pingTime = 0; const start = performance.now(); socket.timeout(3000).emit('latency', error => { $('ping').textContent = error ? 'SIN RESPUESTA' : `${Math.round(performance.now() - start)} MS`; }); }
  if (performance.now() > toastUntil) $('toast').classList.remove('visible');
}
animate();
window.portalRush = { get state() { return state; }, get myId() { return myId; }, get modelReady() { return modelReady; }, get hdriReady() { return world.hdriReady; }, get renderInfo() { return renderer.info.render; }, get graphics() { return graphics.info; }, get lighting() { return { ...world.lighting, hemisphere: hemisphere.intensity, sun: sun.intensity, rim: rim.intensity }; }, get lastHit() { return lastHit; }, get weapon() { return { index: fpWeapon.index, model: fpWeapon.model, ready: fpWeapon.ready }; } };
