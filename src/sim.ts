import { circleHitsAny, moveSlide, type AABB } from "./collision.ts";
import {
  PLAYER_R,
  cellAt,
  cellCenter,
  facingYaw,
  revealFrom,
  type Maze,
} from "./maze.ts";

export const EYE = 1.58;
export const WALK = 4.35;
export const RUN = 6.4;

export type MoveInput = {
  /** +1 walks along the facing direction. */
  forward: number;
  /** +1 strafes to the player's right. */
  strafe: number;
  sprint: boolean;
};

export type Sim = {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  collected: boolean[];
  count: number;
  explored: Uint8Array;
  time: number;
  won: boolean;
  bob: number;
};

export type StepResult = { picked: number[]; won: boolean };

export function createSim(maze: Maze): Sim {
  const origin = cellCenter(maze.start);
  const sim: Sim = {
    x: origin.x,
    z: origin.z,
    yaw: facingYaw(maze, maze.start),
    pitch: 0,
    vx: 0,
    vz: 0,
    collected: maze.gems.map(() => false),
    count: 0,
    explored: new Uint8Array(maze.cols * maze.rows),
    time: 0,
    won: false,
    bob: 0,
  };
  revealFrom(maze, maze.start.x, maze.start.z, sim.explored);
  return sim;
}

export function forwardOf(yaw: number) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightOf(yaw: number) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function formatTime(t: number) {
  const safe = Math.max(0, t);
  const cs = Math.floor(safe * 100) % 100;
  const s = Math.floor(safe) % 60;
  const m = Math.floor(safe / 60);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function stepSim(
  sim: Sim,
  maze: Maze,
  walls: AABB[],
  input: MoveInput,
  dt: number,
): StepResult {
  const step = Math.min(Math.max(dt, 0), 0.05);
  if (sim.won || step === 0) return { picked: [], won: sim.won };

  const forward = forwardOf(sim.yaw);
  const right = rightOf(sim.yaw);
  const wx = forward.x * input.forward + right.x * input.strafe;
  const wz = forward.z * input.forward + right.z * input.strafe;
  const mag = Math.hypot(wx, wz);
  const max = input.sprint && mag > 0.2 ? RUN : WALK;
  let wishX = 0;
  let wishZ = 0;
  if (mag > 1e-5) {
    const scale = mag > 1 ? max / mag : max;
    wishX = wx * scale;
    wishZ = wz * scale;
  }
  const rate = mag > 0 ? 16 : 14;
  const k = 1 - Math.exp(-rate * step);
  sim.vx += (wishX - sim.vx) * k;
  sim.vz += (wishZ - sim.vz) * k;
  if (mag === 0 && Math.hypot(sim.vx, sim.vz) < 0.05) {
    sim.vx = 0;
    sim.vz = 0;
  }

  const next = moveSlide(sim.x, sim.z, sim.vx * step, sim.vz * step, PLAYER_R, walls);
  const movedX = Math.abs(next.x - sim.x) > 0.0001;
  const movedZ = Math.abs(next.z - sim.z) > 0.0001;
  if (!movedX) sim.vx = 0;
  if (!movedZ) sim.vz = 0;
  sim.x = next.x;
  sim.z = next.z;

  const speed = Math.hypot(sim.vx, sim.vz);
  sim.bob += speed * step;
  sim.time += step;

  const cell = cellAt(sim.x, sim.z, maze.cols, maze.rows);
  if (cell) revealFrom(maze, cell.x, cell.z, sim.explored);

  const picked: number[] = [];
  for (let i = 0; i < maze.gems.length; i++) {
    if (sim.collected[i]) continue;
    const gem = cellCenter(maze.gems[i]!);
    if (Math.hypot(sim.x - gem.x, sim.z - gem.z) < 0.82) {
      sim.collected[i] = true;
      sim.count += 1;
      picked.push(i);
    }
  }

  const exit = cellCenter(maze.exit);
  if (Math.hypot(sim.x - exit.x, sim.z - exit.z) < 1.05) sim.won = true;

  return { picked, won: sim.won };
}

export function overlapsWalls(sim: Sim, walls: AABB[]) {
  return circleHitsAny(sim.x, sim.z, PLAYER_R - 0.001, walls);
}
