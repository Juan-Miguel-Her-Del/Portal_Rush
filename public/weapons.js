import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPON_MODELS, MUZZLES } from '/shared/weapon-assets.js';
import { WEAPONS } from '/shared/planets.js';
const loader = new GLTFLoader(), templates = new Array(WEAPON_MODELS.length);
export const weaponsReady = Promise.all(WEAPON_MODELS.map((name, index) => loader.loadAsync(`/models/weapons/${name}.glb`).then(data => { templates[index] = data.scene; return data.scene; })));
export function createWeaponRig({ firstPerson = false } = {}) {
  const root = new THREE.Group(), animated = new THREE.Group(), models = new Map(); root.add(animated);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffe8a5', transparent: true, opacity: .9, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.11, .3, 5), flashMaterial); flash.rotation.x = -Math.PI / 2; flash.visible = false; animated.add(flash);
  let index = -1, desired = 0, recoil = 0, flashUntil = 0;
  function setWeapon(next) {
    desired = Math.max(0, Math.min(WEAPON_MODELS.length - 1, next));
    if (!templates[desired] || desired === index) return;
    for (const model of models.values()) model.visible = false;
    if (!models.has(desired)) {
      const model = templates[desired].clone(true); model.name = 'weapon-' + WEAPON_MODELS[desired];
      model.traverse(node => { if (node.isMesh) { node.castShadow = !firstPerson; node.receiveShadow = !firstPerson; } });
      model.scale.setScalar(firstPerson ? [.9, .75, .75, .75, .7, .7, .7, .6, .8, .7][desired] : .72); if (firstPerson) { model.position.z = desired === 7 ? -.18 : desired === 4 || desired === 9 ? -.08 : 0; model.rotation.y = .09; } animated.add(model); models.set(desired, model);
    }
    const model = models.get(desired); model.visible = true; index = desired;
    flash.position.set(0, .1, MUZZLES[index] - .12).multiplyScalar(model.scale.x).applyEuler(model.rotation).add(model.position); flash.scale.setScalar(index === 7 || index === 6 ? 1.5 : index === 2 ? 1.2 : .8); flashMaterial.color.set(WEAPONS[index].color);
  }
  weaponsReady.then(() => setWeapon(desired));
  return { root, setWeapon, fire() { recoil = 1; flashUntil = performance.now() + 85; }, update(dt, now) { recoil *= Math.exp(-dt * 23); animated.position.z = recoil * (index === 2 || index === 7 ? .11 : .065); animated.rotation.x = -recoil * .07; flash.visible = now < flashUntil; }, get index() { return index; }, get model() { return index < 0 ? null : WEAPON_MODELS[index]; }, get ready() { return index >= 0; }, dispose() { flash.geometry.dispose(); flashMaterial.dispose(); models.clear(); } };
}
