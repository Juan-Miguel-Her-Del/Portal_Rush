// Trazado determinista compartido por Blender, el servidor y el navegador.
const rows = 9, cols = 9, cell = 4, height = 4.2, thickness = .4;
const directions = [{ dr: -1, dc: 0, bit: 1, opposite: 4 }, { dr: 0, dc: 1, bit: 2, opposite: 8 }, { dr: 1, dc: 0, bit: 4, opposite: 1 }, { dr: 0, dc: -1, bit: 8, opposite: 2 }];
const start = (rows - 1) * cols, goal = cols - 1, cells = new Array(rows * cols).fill(15), visited = new Set([start]), stack = [start];
let seed = 73517;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
while (stack.length) {
  const current = stack[stack.length - 1], row = Math.floor(current / cols), col = current % cols;
  const choices = directions.filter(d => { const r = row + d.dr, c = col + d.dc; return r >= 0 && r < rows && c >= 0 && c < cols && !visited.has(r * cols + c); });
  if (!choices.length) { stack.pop(); continue; }
  const d = choices[Math.floor(random() * choices.length)], next = (row + d.dr) * cols + col + d.dc;
  cells[current] &= ~d.bit; cells[next] &= ~d.opposite; visited.add(next); stack.push(next);
}
cells[goal] &= ~1;
export function mazeCenter(index) { return { x: (index % cols - (cols - 1) / 2) * cell, y: 1.2, z: (Math.floor(index / cols) - (rows - 1) / 2) * cell }; }
export function mazeIndex(x, z) { const c = Math.floor((x + cols * cell / 2) / cell), r = Math.floor((z + rows * cell / 2) / cell); return r < 0 || r >= rows || c < 0 || c >= cols ? -1 : r * cols + c; }
export function mazeNeighbors(index) { const row = Math.floor(index / cols), col = index % cols; return directions.filter(d => !(cells[index] & d.bit) && row + d.dr >= 0 && row + d.dr < rows && col + d.dc >= 0 && col + d.dc < cols).map(d => (row + d.dr) * cols + col + d.dc); }
const distances = new Array(cells.length).fill(Infinity), queue = [goal]; distances[goal] = 0;
for (let i = 0; i < queue.length; i++) for (const next of mazeNeighbors(queue[i])) if (!Number.isFinite(distances[next])) { distances[next] = distances[queue[i]] + 1; queue.push(next); }
const solution = [start];
while (solution[solution.length - 1] !== goal) { const current = solution[solution.length - 1]; solution.push(mazeNeighbors(current).find(next => distances[next] === distances[current] - 1)); }
const walls = [];
for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
  const index = row * cols + col, p = mazeCenter(index);
  if (cells[index] & 1) walls.push({ x: p.x, z: p.z - cell / 2, w: cell + thickness, d: thickness, h: height });
  if (cells[index] & 8) walls.push({ x: p.x - cell / 2, z: p.z, w: thickness, d: cell + thickness, h: height });
  if (row === rows - 1 && cells[index] & 4) walls.push({ x: p.x, z: p.z + cell / 2, w: cell + thickness, d: thickness, h: height });
  if (col === cols - 1 && cells[index] & 2) walls.push({ x: p.x + cell / 2, z: p.z, w: thickness, d: cell + thickness, h: height });
}
export const MAZE = { rows, cols, cell, height, thickness, size: cols * cell, start, goal, cells, walls, distances, solution, checkpoint: solution[Math.floor(solution.length / 2)], exit: { x: mazeCenter(goal).x, z: -21, w: 3.1, d: 4 }, rocket: { x: mazeCenter(goal).x, y: 0, z: -26 } };
