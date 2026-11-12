import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sanitizeAppearance, WEAPONS } from '/shared/planets.js';
import { createWeaponRig } from './weapons.js';
const loader = new THREE.TextureLoader(), finishes = {};
for (const name of ['ceramic', 'brushed', 'carbon']) {
  const normal = loader.load(`/textures/${name}_normal.png`), roughness = loader.load(`/textures/${name}_roughness.png`);
  for (const t of [normal, roughness]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); }
  finishes[name] = { normal, roughness };
}
const box = new THREE.BoxGeometry(1, 1, 1), head = new THREE.SphereGeometry(.34, 16, 12), limb = new THREE.BoxGeometry(.21, .5, .23), shoe = new THREE.BoxGeometry(.26, .21, .4);
// Torso, cabeza y depósitos no se articulan: una geometría compartida sustituye cuatro dibujos por avatar.
const chassisParts = [box.clone().scale(.66, .67, .43).translate(0, .15, 0), head.clone().translate(0, .74, 0), box.clone().scale(.13, .42, .12).translate(-.15, .22, .42), box.clone().scale(.13, .42, .12).translate(.15, .22, .42)];
const chassis = mergeGeometries(chassisParts); for (const geometry of chassisParts) geometry.dispose();
const dark = new THREE.MeshStandardMaterial({ color: '#161b28', metalness: .65, roughness: .35 });
const visor = new THREE.MeshPhysicalMaterial({ color: '#101927', roughness: .06, metalness: .85, clearcoat: 1 });
function part(group, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; group.add(m); return m; }
export function createAvatar(p, preview = false) {
  const group = new THREE.Group(), color = new THREE.MeshPhysicalMaterial({ color: p.color, clearcoat: .35, clearcoatRoughness: .2 });
  part(group, chassis, color, 0, 0, 0);
  part(group, box, visor, 0, .76, -.28, .48, .18, .13);
  part(group, box, dark, 0, .18, .3, .44, .46, .19);
  const legs = [], arms = [];
  for (const sign of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(sign * .19, -.2, 0); group.add(leg); part(leg, limb, dark, 0, -.15, 0); part(leg, shoe, color, 0, -.31, -.05); legs.push(leg); arms.push(part(group, limb, color, sign * .47, .12, 0)); }
  const accessories = {};
  const antenna = new THREE.Group(); part(antenna, box, dark, .24, 1.12, 0, .045, .35, .045); part(antenna, new THREE.SphereGeometry(.07, 8, 6), color, .24, 1.31, 0); group.add(antenna); accessories.antenna = antenna;
  const halo = new THREE.Group(); const h = part(halo, new THREE.TorusGeometry(.43, .035, 6, 32), color, 0, 1.22, 0); h.rotation.x = Math.PI / 2; group.add(halo); accessories.halo = halo;
  const fins = new THREE.Group(); for (const s of [-1, 1]) { const fin = part(fins, box, color, s * .41, .82, 0, .13, .45, .3); fin.rotation.z = s * -.3; } group.add(fins); accessories.fins = fins;
  const gunRig = createWeaponRig(), gun = gunRig.root; gun.position.set(.46, .22, -.25); gun.visible = false; group.add(gun);
  const torch = new THREE.Group(), torchBody = part(torch, new THREE.CylinderGeometry(.095, .12, .5, 10), dark, 0, 0, -.15); torchBody.rotation.x = Math.PI / 2;
  const lens = part(torch, new THREE.CircleGeometry(.09, 12), new THREE.MeshBasicMaterial({ color: '#fff2d0' }), 0, 0, -.41); lens.rotation.y = Math.PI; torch.position.set(.44, .2, -.32); torch.visible = false; group.add(torch);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(.85, 12, 8), new THREE.MeshBasicMaterial({ color: '#a6eaff', transparent: true, opacity: .15, wireframe: true, depthWrite: false })); shield.position.y = .25; shield.visible = false; group.add(shield);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64; const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })); label.position.y = 1.65; label.scale.set(2.3, .58, 1); label.visible = !preview; group.add(label);
  group.position.set(p.x || 0, p.y || 0, p.z || 0);
  const a = { group, target: group.position.clone(), legs, arms, color, texture, label, canvas, accessories, gun, gunRig, shield, torch, lens, preview, yaw: 0, speed: 0, appearanceKey: '', weapon: -1 };
  updateAvatar(a, p); return a;
}
export function updateAvatar(a, p, level = 0, now = Date.now()) {
  const appearance = sanitizeAppearance(p.appearance), key = JSON.stringify([appearance, p.color, p.name]);
  if (key !== a.appearanceKey) {
    a.appearanceKey = key; a.color.color.set(p.color); a.color.roughness = appearance.roughness; a.color.metalness = appearance.metalness; a.color.clearcoat = (1 - appearance.roughness) * .65; a.color.clearcoatRoughness = appearance.roughness;
    a.color.roughnessMap = finishes[appearance.finish].roughness; a.color.normalMap = finishes[appearance.finish].normal; a.color.normalScale.setScalar(appearance.finish === 'ceramic' ? .08 : .28); a.color.needsUpdate = true;
    for (const name of Object.keys(a.accessories)) a.accessories[name].visible = name === appearance.accessory;
    const ctx = a.canvas.getContext('2d'); ctx.clearRect(0, 0, 256, 64); ctx.font = 'bold 25px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = p.color; ctx.fillText(p.name || '', 128, 39); a.texture.needsUpdate = true;
  }
  const weapon = Math.min(p.kills || 0, 9); a.gun.visible = level === 1;
  a.torch.visible = level === 5; a.lens.visible = p.flashlight !== false; a.label.visible = !a.preview && level !== 5;
  if (weapon !== a.weapon) { a.weapon = weapon; a.gunRig.setWeapon(weapon); }
  a.shield.visible = level === 1 && now < p.spawnUntil; a.group.visible = !p.out && (p.health === undefined || p.health > 0);
}
export function disposeAvatar(a) { a.color.dispose(); a.texture.dispose(); a.label.material.dispose(); a.gunRig.dispose(); a.shield.material.dispose(); }
