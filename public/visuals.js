import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { SWEEPERS, COLORS } from '/shared/course.js';
import { PLANETS, LASERS, laserActive, WEAPONS, PAINT_COLS, TILE_SIZE, rocketPosition } from '/shared/planets.js';
const loader = new THREE.TextureLoader();
function map(name, color = false, repeat = 1) { const t = loader.load('/textures/' + name); if (color) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); return t; }
export function createWorld(scene, renderer) {
  const levels = PLANETS.map(() => { const g = new THREE.Group(); g.visible = false; scene.add(g); return g; });
  const deck = { map: map('deck_color.png', true, 7), normalMap: map('deck_normal.png', false, 7), roughnessMap: map('deck_roughness.png', false, 7) };
  const laserTexture = map('laser.png', true, 3), lasers = [], portals = [], particles = [], dummy = new THREE.Object3D(), scratchColor = new THREE.Color();
  const planetMaps = ['mercurio', 'marte', 'neptuno', 'urano', 'venus'].map(name => map(`planet_${name}.png`, true));
  planetMaps.push(planetMaps[4]);
  let level = 0, hdri = null, hdriReady = false, tileVersion = -1, brokenCount = -1, lastProjectiles = null, rocket = null, darkness = false;
  let shadowQuality = { shadowSize: 512, localInterval: 0, remoteInterval: 0 };
  const flashlights = Array.from({ length: 4 }, () => {
    const light = new THREE.SpotLight('#fff1d2', 65, 15, Math.PI / 6, .55, 2); light.visible = false; light.castShadow = true;
    light.shadow.mapSize.set(512, 512); light.shadow.camera.near = .12; light.shadow.camera.far = 16; light.shadow.bias = -.0002; light.shadow.normalBias = .025; light.shadow.autoUpdate = false;
    scene.add(light, light.target); return { light, position: new THREE.Vector3(Infinity, Infinity, Infinity), target: new THREE.Vector3(Infinity, Infinity, Infinity), shadowAt: 0 };
  });
  const lightAim = new THREE.Vector3();
  const rocketRoot = new THREE.Group(); scene.add(rocketRoot);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(.7, 2.3, 12), new THREE.MeshBasicMaterial({ color: '#77d9ff', transparent: true, opacity: .75, depthWrite: false })); fire.rotation.x = Math.PI; fire.position.y = -1; rocketRoot.add(fire);
  const rocketLight = new THREE.PointLight('#82ceff', 0, 14); rocketLight.position.y = -.5; rocketRoot.add(rocketLight);
  function mesh(geo, mat, x, y, z, parent) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); parent.add(o); return o; }
  function particleSystem(parent, x, y, z, count, color, radius) {
    const positions = new Float32Array(count * 3), speeds = new Float32Array(count), seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) { positions[i * 3] = (Math.random() - .5) * radius; positions[i * 3 + 1] = Math.random() * 5; positions[i * 3 + 2] = (Math.random() - .5) * radius; speeds[i] = 1 + Math.random() * 2; seeds[i] = Math.random() * 6.28; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: .06, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending })); points.position.set(x, y, z); parent.add(points); particles.push({ points, positions, speeds, seeds, radius }); return points;
  }
  const rocketParticles = particleSystem(rocketRoot, 0, -1, 0, 150, '#7ddfff', 1.2); rocketParticles.rotation.x = Math.PI;
  const portalMat = new THREE.MeshStandardMaterial({ color: '#bb8cff', emissive: '#8e47ff', emissiveIntensity: 2, metalness: .5, roughness: .2 });
  for (const z of [-51, -60]) {
    const group = new THREE.Group(); group.position.set(0, 2.1, z); levels[0].add(group);
    const ring = mesh(new THREE.TorusGeometry(2, .11, 10, 64), portalMat, 0, 0, 0, group); portals.push(ring);
    mesh(new THREE.CircleGeometry(1.85, 40), new THREE.MeshBasicMaterial({ color: '#ad7aff', transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, group);
    particleSystem(levels[0], 0, 0, z, 210, '#b78bff', 5);
  }
  const checkpointMaterial = new THREE.MeshBasicMaterial({ color: '#b4ff62', transparent: true, opacity: .7 });
  for (const z of [-45, -83]) { const m = mesh(new THREE.TorusGeometry(3.3, .04, 6, 60), checkpointMaterial, 0, .05, z, levels[0]); m.rotation.x = -Math.PI / 2; }
  const sweepers = SWEEPERS.map(s => { const m = mesh(new THREE.BoxGeometry(s.width, .5, .6), new THREE.MeshStandardMaterial({ color: '#ff9c5a', metalness: .3, roughness: .35 }), 0, .8, s.z, levels[0]); m.castShadow = true; return m; });
  const balls = [0, 1, 2].map(() => { const m = mesh(new THREE.SphereGeometry(.85, 16, 12), new THREE.MeshStandardMaterial({ color: '#b4ff62', metalness: .55, roughness: .16 }), 0, 4, -70, levels[0]); m.castShadow = true; return m; });
  for (const l of LASERS) {
    const material = new THREE.MeshBasicMaterial({ map: laserTexture, color: '#ff525a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = mesh(new THREE.PlaneGeometry(l.width, .42), material, 0, l.y, l.z, levels[0]); lasers.push(beam);
    for (const sign of [-1, 1]) { mesh(new THREE.CylinderGeometry(.15, .22, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#302e39', metalness: .8, roughness: .25 }), sign * l.width / 2, .75, l.z, levels[0]); mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff5c68' }), sign * l.width / 2, l.y, l.z, levels[0]); }
  }
  const paint = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE_SIZE - .06, .12, TILE_SIZE - .06), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .15, roughness: .45, ...deck }), PAINT_COLS ** 2);
  paint.receiveShadow = true; levels[2].add(paint);
  for (let i = 0; i < PAINT_COLS ** 2; i++) { dummy.position.set((i % PAINT_COLS - (PAINT_COLS - 1) / 2) * TILE_SIZE, .04, (Math.floor(i / PAINT_COLS) - (PAINT_COLS - 1) / 2) * TILE_SIZE); dummy.updateMatrix(); paint.setMatrixAt(i, dummy.matrix); paint.setColorAt(i, scratchColor.set('#657185')); }
  const venusTiles = new THREE.InstancedMesh(new THREE.BoxGeometry(2.92, 1, 2.92), new THREE.MeshStandardMaterial({ color: '#bc8756', roughness: .65, metalness: .2, ...deck }), 100); venusTiles.receiveShadow = true; levels[4].add(venusTiles);
  const crystals = Array.from({ length: 23 }, () => mesh(new THREE.OctahedronGeometry(.45, 0), new THREE.MeshStandardMaterial({ color: '#8affea', emissive: '#22c6d0', emissiveIntensity: .6, metalness: .6, roughness: .1 }), 0, 1, 0, levels[3]));
  const shots = new THREE.InstancedMesh(new THREE.SphereGeometry(.1, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 200); shots.frustumCulled = false; shots.count = 0; scene.add(shots);
  const meteorMeshes = Array.from({ length: 20 }, () => { const group = new THREE.Group(); group.visible = false; levels[4].add(group); const rock = mesh(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: '#f89d55', emissive: '#f26012', emissiveIntensity: 1, roughness: .8 }), 0, 0, 0, group); const mark = mesh(new THREE.RingGeometry(1.8, 2.05, 32), new THREE.MeshBasicMaterial({ color: '#ff5858', side: THREE.DoubleSide, transparent: true, opacity: .7 }), 0, .06, 0, levels[4]); mark.rotation.x = -Math.PI / 2; mark.visible = false; return { group, rock, mark }; });
  const stars = new Float32Array(900 * 3); for (let i = 0; i < stars.length; i++) stars[i] = (Math.random() - .5) * 400;
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3)); const starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: .08, color: '#e1d4ff', transparent: true, opacity: .8 })); scene.add(starField);
  const planet = mesh(new THREE.SphereGeometry(42, 40, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .88, metalness: .05, map: planetMaps[0] }), 72, 22, -175, scene);
  const atmosphere = mesh(new THREE.SphereGeometry(43, 32, 20), new THREE.MeshBasicMaterial({ color: '#ffad65', side: THREE.BackSide, transparent: true, opacity: .1, depthWrite: false }), 72, 22, -175, scene);
  particleSystem(levels[3], 0, 0, 0, 260, '#8affec', 35); particleSystem(levels[4], 0, -3, 0, 250, '#ffad65', 31);
  const gltf = new GLTFLoader();
  const modelJobs = PLANETS.map((p, i) => gltf.loadAsync(`/models/${p.model}.glb`).then(data => {
    data.scene.traverse(o => { if (!o.isMesh) return; o.receiveShadow = true; o.castShadow = true; const list = Array.isArray(o.material) ? o.material : [o.material]; for (const m of list) if (m.name.startsWith('Pista')) { Object.assign(m, deck); m.normalScale.set(.28, .28); m.color.set(PLANETS[i].ground); m.roughness = .75; m.needsUpdate = true; } }); levels[i].add(data.scene);
  }));
  const ready = Promise.all([...modelJobs, gltf.loadAsync('/models/cohete.glb').then(data => { rocket = data.scene; rocket.traverse(o => { if (o.isMesh) o.castShadow = true; }); rocketRoot.add(rocket); }), new RGBELoader().loadAsync('/hdri/rogland_clear_night_1k.hdr').then(texture => {
    hdri = texture; texture.mapping = THREE.EquirectangularReflectionMapping; const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(texture); scene.environment = env.texture; scene.environmentIntensity = 2.2; pmrem.dispose(); hdriReady = true;
  })]);
  function switchLevel(next) { level = next; levels.forEach((g, i) => g.visible = i === next); scene.background = new THREE.Color(PLANETS[next].sky); scene.fog.color.set(PLANETS[next].sky); planet.material.map = planetMaps[next]; atmosphere.material.color.set(PLANETS[next].color); const r = rocketPosition(next); rocketRoot.position.set(r.x, r.y, r.z); tileVersion = -1; brokenCount = -1; }
  switchLevel(0);
  function setQuality(settings) {
    shadowQuality = settings;
    for (const view of flashlights) {
      const shadow = view.light.shadow;
      if (shadow.mapSize.x !== settings.shadowSize) { shadow.map?.dispose(); shadow.map = null; shadow.mapPass?.dispose(); shadow.mapPass = null; shadow.mapSize.set(settings.shadowSize, settings.shadowSize); }
      view.shadowAt = 0; shadow.needsUpdate = true;
    }
  }
  function setDarkness(enabled) {
    if (darkness === enabled) return; darkness = enabled; scene.environmentIntensity = enabled ? 0 : 2.2; planet.visible = atmosphere.visible = starField.visible = !enabled;
    scene.fog.density = enabled ? .025 : .005;
  }
  function updateFlashlights(state, myId, camera, avatars, torchOn) {
    const time = performance.now();
    for (let i = 0; i < flashlights.length; i++) {
      const view = flashlights[i], light = view.light, p = state?.players[i]; light.visible = darkness && !!p;
      if (!light.visible) continue;
      const avatar = avatars.get(p.id), local = p.id === myId, on = local ? torchOn : p.flashlight !== false;
      light.intensity = on ? 65 : 0;
      if (local) { light.position.copy(camera.position); camera.getWorldDirection(lightAim); }
      else { light.position.set(avatar?.group.position.x ?? p.x, (avatar?.group.position.y ?? p.y) + .8, avatar?.group.position.z ?? p.z); lightAim.set(p.aim?.x || 0, p.aim?.y || 0, p.aim?.z ?? -1).normalize(); light.position.addScaledVector(lightAim, .55); }
      light.target.position.copy(light.position).addScaledVector(lightAim, 12);
      light.shadow.needsUpdate = on && time >= view.shadowAt;
      if (light.shadow.needsUpdate) { view.shadowAt = time + (local ? shadowQuality.localInterval : shadowQuality.remoteInterval); view.position.copy(light.position); view.target.copy(light.target.position); }
    }
  }
  function update(state, dt, t, now) {
    const activeLevel = state?.level ?? 0;
    for (const system of particles) if (system.points.visible && system.points.parent.visible) {
      for (let i = 0; i < system.speeds.length; i++) { const j = i * 3; system.speeds[i] -= .7 * dt; system.positions[j + 1] += system.speeds[i] * dt; if (system.positions[j + 1] > 5 || system.positions[j + 1] < 0) { system.positions[j + 1] = 0; system.speeds[i] = 2.5 + system.seeds[i] * .35; system.positions[j] = Math.sin(system.seeds[i] * 4) * system.radius * .5; } } system.points.geometry.attributes.position.needsUpdate = true;
    }
    for (const ring of portals) ring.rotation.z = t * .4; laserTexture.offset.x = -t * 1.7;
    for (let i = 0; i < lasers.length; i++) lasers[i].material.opacity = laserActive(LASERS[i], state ? (now - state.startAt) / 1000 : t) ? .95 : .08;
    const flying = state?.phase === 'travel', boarding = state?.phase === 'boarding', r = rocketPosition(activeLevel);
    const flight = flying ? THREE.MathUtils.clamp((now - state.travelAt) / 5000, 0, 1) : 0;
    rocketRoot.position.set(r.x, flight * flight * 65, r.z); rocketRoot.rotation.z = flying ? Math.sin(t * 5) * .015 : 0;
    fire.visible = flying || boarding; rocketParticles.visible = flying || boarding; fire.scale.y = (flying ? 2.5 : .4) + Math.sin(t * 30) * .15; rocketLight.intensity = flying ? 18 : boarding ? 3 : 0;
    rocketLight.visible = flying || boarding;
    if (!state) { shots.count = 0; return; }
    state.sweepers.forEach((x, i) => { if (sweepers[i]) sweepers[i].position.x = x; }); state.balls.forEach((b, i) => { if (balls[i]) { balls[i].position.set(b.x, b.y, b.z); balls[i].quaternion.fromArray(b.q); } });
    if (activeLevel === 2 && state.tileVersion !== tileVersion) { tileVersion = state.tileVersion; for (let i = 0; i < state.tiles.length; i++) paint.setColorAt(i, scratchColor.set(state.tiles[i] < 0 ? '#6c7791' : COLORS[state.tiles[i]])); paint.instanceColor.needsUpdate = true; }
    if (activeLevel === 3) for (let i = 0; i < crystals.length; i++) { const c = state.crystals[i]; crystals[i].visible = !!c && now >= c.availableAt; if (c) { crystals[i].position.set(c.x, c.y + Math.sin(t * 2 + i) * .12, c.z); crystals[i].rotation.y = t + i; } }
    if (activeLevel === 4) {
      let broken = 0; for (const tile of state.brokenTiles) if (tile) broken++;
      if (broken !== brokenCount) { brokenCount = broken; for (let i = 0; i < 100; i++) { dummy.position.set((i % 10 - 4.5) * 3, -.5, (Math.floor(i / 10) - 4.5) * 3); dummy.scale.setScalar(state.brokenTiles[i] ? 0 : 1); dummy.updateMatrix(); venusTiles.setMatrixAt(i, dummy.matrix); } venusTiles.instanceMatrix.needsUpdate = true; dummy.scale.setScalar(1); }
      for (let i = 0; i < meteorMeshes.length; i++) { const m = state.meteors[i], view = meteorMeshes[i]; view.group.visible = view.mark.visible = !!m; if (m) { view.group.position.set(m.x, Math.max(0, (m.impactAt - now) / 2200 * 32), m.z); view.rock.rotation.set(t * 2, t, t * 3); view.mark.position.set(m.x, .06, m.z); view.mark.material.opacity = .5 + Math.sin(t * 16) * .3; } }
    }
    if (state.projectiles !== lastProjectiles) { lastProjectiles = state.projectiles; shots.count = Math.min(state.projectiles.length, 200);
      for (let i = 0; i < shots.count; i++) { const s = state.projectiles[i]; dummy.position.set(s.x, s.y, s.z); dummy.scale.setScalar(s.weapon === 7 || s.weapon === 6 ? 2.8 : 1); dummy.updateMatrix(); shots.setMatrixAt(i, dummy.matrix); shots.setColorAt(i, scratchColor.set(WEAPONS[s.weapon].color)); } shots.instanceMatrix.needsUpdate = true; if (shots.instanceColor) shots.instanceColor.needsUpdate = true; dummy.scale.setScalar(1);
    }
  }
  return { ready, switchLevel, update, setQuality, setDarkness, updateFlashlights, rocketRoot, get hdr() { return hdri; }, get hdriReady() { return hdriReady; }, get level() { return level; }, get lighting() { return { dark: darkness, environmentIntensity: scene.environmentIntensity, flashlights: flashlights.map(v => ({ visible: v.light.visible, intensity: v.light.intensity, castShadow: v.light.castShadow, x: v.light.position.x, y: v.light.position.y, z: v.light.position.z, target: v.light.target.position.toArray() })) }; } };
}
