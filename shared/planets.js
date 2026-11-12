import { MAZE, mazeCenter } from './maze.js';
export const PLANETS = [
  { name: 'Mercurio', game: 'Carrera láser', description: 'Salta los láseres y atraviesa el portal. El cohete espera en la meta.', color: '#ffb36b', ground: '#5e4a42', sky: '#191321', gravity: 22, seconds: 180, model: 'circuito', goal: 'Llega al cohete', action: 'Saltar / esquivar' },
  { name: 'Marte', game: 'Arsenal orbital', description: 'Cada eliminación desbloquea un arma. Consigue una con cada una de las 10 armas para ganar.', color: '#ff866b', ground: '#854e3b', sky: '#25121c', gravity: 18, seconds: 240, model: 'marte', goal: '10 eliminaciones · 10 armas', action: 'Clic / F para disparar' },
  { name: 'Neptuno', game: 'Guerra de color', description: 'Pinta las casillas al caminar y roba territorio. Empuja a tus rivales. Gana quien pinte más en 3 minutos.', color: '#72c8ff', ground: '#3a5475', sky: '#0c1b30', gravity: 20, seconds: 180, model: 'neptuno', goal: 'Más territorio en 3:00', action: 'E para empujar' },
  { name: 'Urano', game: 'Fiebre de cristales', description: 'Explora las plataformas de hielo en baja gravedad. El primero en reunir 15 cristales gana.', color: '#70ffe0', ground: '#426a75', sky: '#102832', gravity: 7.5, seconds: 120, model: 'urano', goal: 'Reúne 15 cristales', action: 'Salta más alto · E empuja' },
  { name: 'Venus', game: 'Última órbita', description: 'Los meteoritos destruyen el suelo. Evita las zonas marcadas y sobrevive más que tus rivales.', color: '#ffd079', ground: '#72543b', sky: '#29180f', gravity: 19, seconds: 90, model: 'venus', goal: 'Sé el último superviviente', action: 'Esquiva · E empuja' },
  { name: 'Saturno', game: 'Laberinto de sombras', description: 'Explora el complejo a oscuras con tu linterna. Encuentra la salida y alcanza el cohete.', color: '#d4c4ff', ground: '#596575', sky: '#010205', gravity: 20, seconds: 180, model: 'saturno', goal: 'Encuentra la salida', action: 'Ratón: mirar · L: linterna' }
];
export const LASERS = [
  { z: -12, width: 11.5, y: .85, phase: 0, period: 4.8 },
  { z: -19, width: 11.5, y: .8, phase: 1.5, period: 5.3 },
  { z: -67, width: 13.5, y: .9, phase: .9, period: 4.8 },
  { z: -77, width: 13.5, y: 1.05, phase: 2.7, period: 5.2 },
  { z: -94, width: 11.5, y: .85, phase: 2.1, period: 4.5 }
];
export function laserActive(laser, seconds) { return ((seconds + laser.phase) % laser.period + laser.period) % laser.period < laser.period * .57; }
export const ARENA_SIZE = 40;
export const PAINT_COLS = 14;
export const TILE_SIZE = 2.5;
export const PAINT_SIZE = PAINT_COLS * TILE_SIZE;
export const COVER = [
  { x: -8, z: -4, w: 6, d: 2, h: 2.4 }, { x: 8, z: 4, w: 6, d: 2, h: 2.4 },
  { x: -6, z: 7, w: 2, d: 5, h: 1.6 }, { x: 6, z: -7, w: 2, d: 5, h: 1.6 },
  { x: 0, z: 0, w: 3, d: 3, h: 2.1 }, { x: -13, z: -12, w: 3, d: 3, h: 3 },
  { x: 13, z: 12, w: 3, d: 3, h: 3 }
];
export const ICE_STEPS = [
  { x: -9, z: -6, w: 6, d: 6, h: 1.5 }, { x: 9, z: 6, w: 6, d: 6, h: 1.5 },
  { x: 0, z: 0, w: 5, d: 5, h: 3 }, { x: 8, z: -10, w: 5, d: 5, h: 2.5 },
  { x: -8, z: 10, w: 5, d: 5, h: 2.5 }
];
export const WEAPONS = [
  { name: 'Pistola iónica', damage: 34, interval: 380, speed: 48, spread: .012, pellets: 1, color: '#81ecff' },
  { name: 'Subfusil de pulsos', damage: 17, interval: 100, speed: 48, spread: .07, pellets: 1, color: '#96ff9c' },
  { name: 'Escopeta estelar', damage: 18, interval: 800, speed: 38, spread: .18, pellets: 7, color: '#ffc078' },
  { name: 'Carabina marciana', damage: 27, interval: 210, speed: 65, spread: .025, pellets: 1, color: '#ff9393' },
  { name: 'Fusil de precisión', damage: 65, interval: 700, speed: 110, spread: .002, pellets: 1, color: '#d2c3ff' },
  { name: 'Láser continuo', damage: 13, interval: 85, speed: 140, spread: .002, pellets: 1, color: '#ff668c' },
  { name: 'Cañón de plasma', damage: 75, interval: 950, speed: 25, spread: .008, pellets: 1, splash: 2.8, color: '#ce87ff' },
  { name: 'Lanzacohetes', damage: 100, interval: 1200, speed: 23, spread: .003, pellets: 1, splash: 3.5, color: '#ffb55f' },
  { name: 'Bláster doble', damage: 28, interval: 280, speed: 60, spread: .035, pellets: 2, color: '#7bffde' },
  { name: 'Riel cuántico', damage: 100, interval: 900, speed: 160, spread: 0, pellets: 1, color: '#fff2ad' }
];
export const FINISHES = ['ceramic', 'brushed', 'carbon'];
export function sanitizeAppearance(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    roughness: Number.isFinite(value.roughness) ? Math.max(.03, Math.min(1, value.roughness)) : .4,
    metalness: Number.isFinite(value.metalness) ? Math.max(0, Math.min(1, value.metalness)) : .35,
    finish: FINISHES.includes(value.finish) ? value.finish : 'ceramic',
    accessory: ['antenna', 'halo', 'fins'].includes(value.accessory) ? value.accessory : 'antenna',
    preferredColor: typeof value.preferredColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.preferredColor) ? value.preferredColor.toLowerCase() : null
  };
}
export function spawnPoint(slot, level) {
  if (level === 0) return { x: (slot - 1.5) * 1.8, y: 1.2, z: 7 };
  if (level === 5) { const p = mazeCenter(MAZE.start), offset = (slot - 1.5) * .8, north = !(MAZE.cells[MAZE.start] & 1); return { x: p.x + (north ? offset : 0), y: p.y, z: p.z + (north ? 0 : offset) }; }
  const places = [{ x: -12, z: 12 }, { x: 12, z: -12 }, { x: -12, z: -12 }, { x: 12, z: 12 }];
  return { ...places[slot % 4], y: 1.2 };
}
export const rocketPosition = level => level === 0 ? { x: 0, y: 0, z: -107 } : level === 5 ? MAZE.rocket : { x: 0, y: 0, z: -16 };
