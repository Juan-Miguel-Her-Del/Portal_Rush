import * as THREE from 'three';

const PROFILES = {
  fluid: { label: 'Fluido', pixels: 1280 * 720, ratio: 1, floor: .45, sunSize: 512, torchSize: 256, sunHz: 12, torchHz: 15, remoteHz: 10, filter: THREE.BasicShadowMap },
  balanced: { label: 'Equilibrado', pixels: 1920 * 1080, ratio: 1.25, floor: .6, sunSize: 1024, torchSize: 512, sunHz: 24, torchHz: 30, remoteHz: 20, filter: THREE.PCFShadowMap },
  high: { label: 'Alto', pixels: Infinity, ratio: 1.5, floor: .85, sunSize: 1024, torchSize: 512, sunHz: 60, torchHz: 60, remoteHz: 60, filter: THREE.PCFSoftShadowMap }
};

export function createGraphics(renderer, sun, world, scene) {
  const selector = document.getElementById('graphics-quality');
  let mode = localStorage.getItem('portal-graphics'); if (!PROFILES[mode]) mode = 'fluid';
  let profile, scale = 1, elapsed = 0, frames = 0, stable = 0, nextShadow = 0, measuredFPS = 0;
  sun.shadow.autoUpdate = false;
  function resize() {
    const base = Math.min(devicePixelRatio || 1, profile.ratio, Math.sqrt(profile.pixels / (innerWidth * innerHeight)));
    const ratio = Math.max(Math.min(base, profile.floor), base * scale);
    renderer.setPixelRatio(ratio); renderer.setSize(innerWidth, innerHeight);
  }
  function apply(value) {
    const filterChanged = profile?.filter !== (PROFILES[value] || PROFILES.fluid).filter;
    mode = PROFILES[value] ? value : 'fluid'; profile = PROFILES[mode]; scale = 1; elapsed = 0; frames = 0; stable = 0; nextShadow = 0;
    selector.value = mode; document.body.dataset.quality = mode; localStorage.setItem('portal-graphics', mode);
    renderer.shadowMap.type = profile.filter;
    if (sun.shadow.mapSize.x !== profile.sunSize) {
      sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapPass?.dispose(); sun.shadow.mapPass = null;
      sun.shadow.mapSize.set(profile.sunSize, profile.sunSize);
    }
    sun.shadow.needsUpdate = true;
    world.setQuality({ shadowSize: profile.torchSize, localInterval: 1000 / profile.torchHz, remoteInterval: 1000 / profile.remoteHz });
    // Cambiar el filtro de sombras requiere recompilar los materiales que lo usan.
    if (filterChanged) scene.traverse(object => { if (object.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) material.needsUpdate = true; } });
    renderer.shadowMap.needsUpdate = true;
    resize();
  }
  selector.addEventListener('change', () => apply(selector.value));
  apply(mode);
  return {
    resize,
    beforeRender(now, dark) {
      sun.visible = !dark;
      sun.shadow.needsUpdate = !dark && now >= nextShadow;
      if (sun.shadow.needsUpdate) nextShadow = now + 1000 / profile.sunHz;
    },
    sample(dt) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > 2) { elapsed = 0; frames = 0; return; }
      elapsed += dt; frames++;
      if (elapsed < 1.5) return;
      measuredFPS = frames / elapsed;
      if (measuredFPS < 42 && scale > .45) { scale = Math.max(.45, scale * .8); stable = 0; resize(); }
      else if (measuredFPS > 58 && scale < 1 && ++stable >= 6) { scale = Math.min(1, scale * 1.08); stable = 0; resize(); }
      else if (measuredFPS <= 58) stable = 0;
      elapsed = 0; frames = 0;
    },
    get info() { return { mode, label: profile.label, fps: Math.round(measuredFPS), pixelRatio: renderer.getPixelRatio(), width: renderer.domElement.width, height: renderer.domElement.height, sunShadowSize: profile.sunSize, torchShadowSize: profile.torchSize }; }
  };
}
