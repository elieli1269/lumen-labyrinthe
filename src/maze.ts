export const COLS = 11;
export const ROWS = 11;
export const CELL = 4;
export const WALL_T = 0.38;
export const PLAYER_R = 0.32;

export type Cell = { x: number; z: number };

export type Maze = {
  cols: number;
  rows: number;
  /** North edge of cell (x, z) lives at index z * cols + x. Includes the south border at z = rows. */
  hWalls: Uint8Array;
  /** West edge of cell (x, z) lives at index z * (cols + 1) + x. Includes the east border at x = cols. */
  vWalls: Uint8Array;
  start: Cell;
  exit: Cell;
  gems: Cell[];
  seed: number;
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellCenter(cell: Cell) {
  return { x: (cell.x + 0.5) * CELL, z: (cell.z + 0.5) * CELL };
}

export function cellAt(x: number, z: number, cols: number, rows: number): Cell | null {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return null;
  return { x: cx, z: cz };
}

export function neighbors(maze: Maze, x: number, z: number): Cell[] {
  const out: Cell[] = [];
  const { cols, rows, hWalls, vWalls } = maze;
  if (z > 0 && !hWalls[z * cols + x]) out.push({ x, z: z - 1 });
  if (z + 1 < rows && !hWalls[(z + 1) * cols + x]) out.push({ x, z: z + 1 });
  if (x > 0 && !vWalls[z * (cols + 1) + x]) out.push({ x: x - 1, z });
  if (x + 1 < cols && !vWalls[z * (cols + 1) + x + 1]) out.push({ x: x + 1, z });
  return out;
}

export function openingCount(maze: Maze, x: number, z: number) {
  return neighbors(maze, x, z).length;
}

/** yaw = 0 looks toward world −Z. */
export function facingYaw(maze: Maze, cell: Cell) {
  const { cols, hWalls, vWalls } = maze;
  if (!vWalls[cell.z * (cols + 1) + cell.x + 1]) return -Math.PI / 2;
  if (!hWalls[(cell.z + 1) * cols + cell.x]) return Math.PI;
  if (!vWalls[cell.z * (cols + 1) + cell.x]) return Math.PI / 2;
  return 0;
}

export function revealFrom(maze: Maze, x: number, z: number, explored: Uint8Array) {
  const mark = (cx: number, cz: number) => {
    if (cx < 0 || cz < 0 || cx >= maze.cols || cz >= maze.rows) return;
    explored[cz * maze.cols + cx] = 1;
  };
  mark(x, z);
  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;
  for (const [dx, dz] of dirs) {
    let cx = x;
    let cz = z;
    for (let i = 0; i < 7; i++) {
      const next = neighbors(maze, cx, cz).find((c) => c.x === cx + dx && c.z === cz + dz);
      if (!next) break;
      cx = next.x;
      cz = next.z;
      mark(cx, cz);
    }
  }
}

function farthest(maze: Maze, origin: Cell): Cell {
  const { cols, rows } = maze;
  const dist = new Int16Array(cols * rows).fill(-1);
  const q: Cell[] = [origin];
  dist[origin.z * cols + origin.x] = 0;
  let best = origin;
  let bestD = 0;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]!;
    const d = dist[cur.z * cols + cur.x]!;
    if (d > bestD) {
      bestD = d;
      best = cur;
    }
    for (const n of neighbors(maze, cur.x, cur.z)) {
      const ni = n.z * cols + n.x;
      if (dist[ni] !== -1) continue;
      dist[ni] = d + 1;
      q.push(n);
    }
  }
  return best;
}

export function generateMaze(seed: number, cols = COLS, rows = ROWS): Maze {
  const rand = mulberry32(seed || 1);
  const hWalls = new Uint8Array((rows + 1) * cols).fill(1);
  const vWalls = new Uint8Array(rows * (cols + 1)).fill(1);
  const visited = new Uint8Array(cols * rows);
  const stack: Cell[] = [{ x: 0, z: 0 }];
  visited[0] = 1;
  const dirs = [
    { dx: 0, dz: -1 },
    { dx: 1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: -1, dz: 0 },
  ];

  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    const options = [];
    for (const d of dirs) {
      const nx = cur.x + d.dx;
      const nz = cur.z + d.dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      if (visited[nz * cols + nx]) continue;
      options.push(d);
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const d = options[(rand() * options.length) | 0]!;
    const nx = cur.x + d.dx;
    const nz = cur.z + d.dz;
    if (d.dz === -1) hWalls[cur.z * cols + cur.x] = 0;
    else if (d.dz === 1) hWalls[nz * cols + cur.x] = 0;
    else if (d.dx === 1) vWalls[cur.z * (cols + 1) + nx] = 0;
    else vWalls[cur.z * (cols + 1) + cur.x] = 0;
    visited[nz * cols + nx] = 1;
    stack.push({ x: nx, z: nz });
  }

  const maze: Maze = {
    cols,
    rows,
    hWalls,
    vWalls,
    start: { x: 0, z: 0 },
    exit: { x: 0, z: 0 },
    gems: [],
    seed: seed >>> 0 || 1,
  };
  maze.exit = farthest(maze, maze.start);

  const dead: Cell[] = [];
  const halls: Cell[] = [];
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      if ((x === maze.start.x && z === maze.start.z) || (x === maze.exit.x && z === maze.exit.z)) {
        continue;
      }
      const n = openingCount(maze, x, z);
      if (n === 1) dead.push({ x, z });
      else if (n === 2) halls.push({ x, z });
    }
  }
  const shuffle = (list: Cell[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const tmp = list[i]!;
      list[i] = list[j]!;
      list[j] = tmp;
    }
  };
  shuffle(dead);
  shuffle(halls);
  const target = Math.min(10, dead.length + halls.length);
  maze.gems = [...dead, ...halls].slice(0, target);
  return maze;
}

export function reachableCount(maze: Maze) {
  const seen = new Uint8Array(maze.cols * maze.rows);
  const q: Cell[] = [maze.start];
  seen[0] = 1;
  let n = 0;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]!;
    n++;
    for (const next of neighbors(maze, cur.x, cur.z)) {
      const ni = next.z * maze.cols + next.x;
      if (seen[ni]) continue;
      seen[ni] = 1;
      q.push(next);
    }
  }
  return n;
}
