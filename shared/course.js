// Una sola definición del recorrido para Blender, el servidor y el navegador.
export const PLATFORMS = [
  { x: 0, z: 5, w: 16, d: 20 },
  { x: 0, z: -14, w: 12, d: 16 },
  { x: -3, z: -27, w: 7, d: 6 },
  { x: 3, z: -33, w: 7, d: 6 },
  { x: -3, z: -39, w: 7, d: 6 },
  { x: 0, z: -47, w: 16, d: 12 },
  { x: 0, z: -72, w: 14, d: 28 },
  { x: 0, z: -98, w: 12, d: 20 }
];
export const PORTAL = { x: 0, y: 1.5, z: -51, destination: { x: 0, y: 1.2, z: -61 } };
export const CHECKPOINTS = [{ x: 0, z: 7 }, { x: 0, z: -45 }, { x: 0, z: -61 }, { x: 0, z: -83 }];
export const SWEEPERS = [{ z: -15, width: 5, amplitude: 3 }, { z: -70, width: 6, amplitude: 3.7 }, { z: -96, width: 5, amplitude: 3 }];
export const COLORS = ['#a9ff5b', '#b79bff', '#ffad66', '#62dcff'];
export const ZONES = ['Despegue', 'Islas suspendidas', 'Salto dimensional', 'Cámara de gravedad', 'Recta final'];
export const MAX_PLAYERS = 4;
export const RACE_SECONDS = 180;
