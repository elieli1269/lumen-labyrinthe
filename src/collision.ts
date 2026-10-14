import { CELL, WALL_T, type Maze } from "./maze.ts";

export type AABB = { minX: number; maxX: number; minZ: number; maxZ: number };

const SKIN = 0.004;

export function buildWalls(maze: Maze): AABB[] {
  const walls: AABB[] = [];
  const t = WALL_T / 2;
  const { cols, rows, hWalls, vWalls } = maze;
  for (let z = 0; z <= rows; z++) {
    for (let x = 0; x < cols; x++) {
      if (!hWalls[z * cols + x]) continue;
      const cx = (x + 0.5) * CELL;
      const cz = z * CELL;
      walls.push({
        minX: cx - CELL / 2 - t,
        maxX: cx + CELL / 2 + t,
        minZ: cz - t,
        maxZ: cz + t,
      });
    }
  }
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x <= cols; x++) {
      if (!vWalls[z * (cols + 1) + x]) continue;
      const cx = x * CELL;
      const cz = (z + 0.5) * CELL;
      walls.push({
        minX: cx - t,
        maxX: cx + t,
        minZ: cz - CELL / 2 - t,
        maxZ: cz + CELL / 2 + t,
      });
    }
  }
  return walls;
}

export function circleHits(x: number, z: number, r: number, w: AABB) {
  const cx = Math.max(w.minX, Math.min(x, w.maxX));
  const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function circleHitsAny(x: number, z: number, r: number, walls: AABB[]) {
  for (const w of walls) {
    if (circleHits(x, z, r, w)) return true;
  }
  return false;
}

export function resolveCircle(x: number, z: number, r: number, walls: AABB[]) {
  const rad = r + SKIN;
  for (let n = 0; n < 6; n++) {
    let hit = false;
    for (const w of walls) {
      const cx = Math.max(w.minX, Math.min(x, w.maxX));
      const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      hit = true;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = (rad - d) / d;
        x += dx * push;
        z += dz * push;
      } else {
        const left = x - w.minX;
        const right = w.maxX - x;
        const north = z - w.minZ;
        const south = w.maxZ - z;
        const m = Math.min(left, right, north, south);
        if (m === left) x = w.minX - rad;
        else if (m === right) x = w.maxX + rad;
        else if (m === north) z = w.minZ - rad;
        else z = w.maxZ + rad;
      }
    }
    if (!hit) break;
  }
  return { x, z };
}

/** Axis-separated slide so a wall stops one axis and leaves the other free. */
export function moveSlide(x: number, z: number, dx: number, dz: number, r: number, walls: AABB[]) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.12));
  const sx = dx / steps;
  const sz = dz / steps;
  let px = x;
  let pz = z;
  for (let i = 0; i < steps; i++) {
    const nx = px + sx;
    if (!circleHitsAny(nx, pz, r, walls)) px = nx;
    const nz = pz + sz;
    if (!circleHitsAny(px, nz, r, walls)) pz = nz;
  }
  if (circleHitsAny(px, pz, r, walls)) return resolveCircle(px, pz, r, walls);
  return { x: px, z: pz };
}
