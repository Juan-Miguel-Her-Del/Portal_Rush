import * as THREE from 'three';
import { createAvatar, updateAvatar } from './avatars.js';
import { sanitizeAppearance } from '/shared/planets.js';
import { COLORS } from '/shared/course.js';
export function createGarage(getHDR, onSave) {
  let stored; try { stored = JSON.parse(localStorage.getItem('portal-appearance') || '{}'); } catch { stored = {}; }
  let profile = sanitizeAppearance(stored), renderer, avatar, scene, camera, environment, lastFrame = 0;
  const dialog = document.getElementById('garage-dialog'), $ = id => document.getElementById(id);
  $('roughness').value = profile.roughness; $('metalness').value = profile.metalness; $('finish').value = profile.finish; $('accessory').value = profile.accessory;
  for (const color of COLORS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'color-swatch'; b.style.background = color; b.dataset.color = color; b.setAttribute('aria-label', 'Elegir color ' + color); b.onclick = () => { profile.preferredColor = color; refresh(); }; $('garage-colors').append(b); }
  function refresh() {
    profile.roughness = Number($('roughness').value); profile.metalness = Number($('metalness').value); profile.finish = $('finish').value; profile.accessory = $('accessory').value;
    $('roughness-value').textContent = `${Math.round(profile.roughness * 100)}%`; $('metalness-value').textContent = `${Math.round(profile.metalness * 100)}%`;
    for (const b of $('garage-colors').children) b.classList.toggle('chosen', b.dataset.color === (profile.preferredColor || COLORS[0]));
    if (avatar) updateAvatar(avatar, { color: profile.preferredColor || COLORS[0], name: '', appearance: profile });
  }
  for (const id of ['roughness', 'metalness', 'finish', 'accessory']) $(id).oninput = refresh;
  function open() {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(280, 310); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4;
      $('garage-preview').appendChild(renderer.domElement); scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(34, 280 / 310, .1, 30); camera.position.set(2.4, 1.6, -4.1); camera.lookAt(0, .4, 0);
      scene.add(new THREE.HemisphereLight('#d5e5ff', '#342848', 2)); const key = new THREE.DirectionalLight('#ffffff', 2.5); key.position.set(-3, 4, -2); scene.add(key);
      avatar = createAvatar({ color: profile.preferredColor || COLORS[0], name: '', appearance: profile }, true); scene.add(avatar.group);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.9, .025, 8, 64), new THREE.MeshBasicMaterial({ color: '#b4ff62' })); ring.rotation.x = Math.PI / 2; ring.position.y = -.56; scene.add(ring);
    }
    if (!environment && getHDR()) { const pmrem = new THREE.PMREMGenerator(renderer); environment = pmrem.fromEquirectangular(getHDR()); scene.environment = environment.texture; scene.environmentIntensity = 1.6; pmrem.dispose(); }
    refresh(); dialog.showModal();
  }
  $('garage-save').onclick = () => { localStorage.setItem('portal-appearance', JSON.stringify(profile)); onSave(profile); dialog.close(); };
  $('garage-dialog').querySelector('.close').onclick = () => dialog.close();
  refresh();
  return { open, get profile() { return profile; }, update(t) { if (renderer && dialog.open && t - lastFrame > 1 / 30) { lastFrame = t; avatar.group.rotation.y = Math.sin(t * .4) * .45; renderer.render(scene, camera); } } };
}
