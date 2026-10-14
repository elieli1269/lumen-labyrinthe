import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWalls, circleHitsAny, moveSlide } from "./collision.ts";
import {
  CELL,
  PLAYER_R,
  WALL_T,
  cellCenter,
  generateMaze,
  neighbors,
  reachableCount,
} from "./maze.ts";
import { createSim, forwardOf, rightOf, stepSim } from "./sim.ts";

describe("maze", () => {
  it("connects every cell and keeps the outer shell closed", () => {
    const maze = generateMaze(42);
    assert.equal(reachableCount(maze), maze.cols * maze.rows);
    for (let x = 0; x < maze.cols; x++) {
      assert.equal(maze.hWalls[x], 1);
      assert.equal(maze.hWalls[maze.rows * maze.cols + x], 1);
    }
    for (let z = 0; z < maze.rows; z++) {
      assert.equal(maze.vWalls[z * (maze.cols + 1)], 1);
      assert.equal(maze.vWalls[z * (maze.cols + 1) + maze.cols], 1);
    }
    assert.notDeepEqual(maze.exit, maze.start);
    assert.ok(maze.gems.length >= 8);
    for (const gem of maze.gems) {
      assert.ok(!(gem.x === maze.start.x && gem.z === maze.start.z));
      assert.ok(!(gem.x === maze.exit.x && gem.z === maze.exit.z));
    }
  });
});

describe("collision", () => {
  it("blocks a straight run into the north border and still slides along it", () => {
    const maze = generateMaze(7);
    const walls = buildWalls(maze);
    const start = cellCenter(maze.start);
    const moved = moveSlide(start.x, start.z, 0, -8, PLAYER_R, walls);
    const limit = WALL_T / 2 + PLAYER_R;
    assert.ok(moved.z >= limit - 0.02, `slipped through north wall at z=${moved.z}`);
    assert.equal(circleHitsAny(moved.x, moved.z, PLAYER_R - 0.001, walls), false);

    const slide = moveSlide(start.x, limit + 0.02, 3, -1, PLAYER_R, walls);
    assert.ok(slide.x > start.x + 1, "did not slide along the wall");
    assert.ok(slide.z >= limit - 0.02);
    assert.equal(circleHitsAny(slide.x, slide.z, PLAYER_R - 0.001, walls), false);
  });

  it("lets the player walk through an open doorway", () => {
    const maze = generateMaze(11);
    const walls = buildWalls(maze);
    let door: { x: number; z: number; nx: number; nz: number } | null = null;
    for (let z = 0; z < maze.rows && !door; z++) {
      for (let x = 0; x < maze.cols; x++) {
        const next = neighbors(maze, x, z).find((n) => n.x === x + 1);
        if (next) {
          door = { x, z, nx: next.x, nz: next.z };
          break;
        }
      }
    }
    assert.ok(door);
    const from = cellCenter({ x: door.x, z: door.z });
    const to = cellCenter({ x: door.nx, z: door.nz });
    const moved = moveSlide(from.x, from.z, to.x - from.x, to.z - from.z, PLAYER_R, walls);
    assert.ok(Math.abs(moved.x - to.x) < 0.2, `blocked in a doorway, landed at ${moved.x}`);
    assert.equal(circleHitsAny(moved.x, moved.z, PLAYER_R - 0.001, walls), false);
  });
});

describe("fps signs", () => {
  it("maps W forward, A left and D right on the yaw basis", () => {
    const yaw = 0;
    const forward = forwardOf(yaw);
    const right = rightOf(yaw);
    assert.ok(forward.z < -0.9);
    assert.ok(Math.abs(forward.x) < 0.01);
    assert.ok(right.x > 0.9);

    const maze = generateMaze(3);
    const walls = buildWalls(maze);
    const sim = createSim(maze);
    sim.yaw = 0;
    sim.pitch = 0;
    const originZ = sim.z;
    for (let i = 0; i < 40; i++) stepSim(sim, maze, walls, { forward: 1, strafe: 0, sprint: false }, 1 / 60);
    assert.ok(sim.z < originZ - 0.4, `W did not move toward -Z (${sim.z} vs ${originZ})`);
    assert.equal(circleHitsAny(sim.x, sim.z, PLAYER_R - 0.001, walls), false);

    sim.vx = 0;
    sim.vz = 0;
    const leftX = sim.x;
    for (let i = 0; i < 20; i++) stepSim(sim, maze, walls, { forward: 0, strafe: -1, sprint: false }, 1 / 60);
    assert.ok(sim.x < leftX - 0.15, "A did not strafe left (−X at yaw 0)");

    sim.vx = 0;
    sim.vz = 0;
    const rightX = sim.x;
    for (let i = 0; i < 20; i++) stepSim(sim, maze, walls, { forward: 0, strafe: 1, sprint: false }, 1 / 60);
    assert.ok(sim.x > rightX + 0.15, "D did not strafe right (+X at yaw 0)");
    assert.equal(sim.yaw, 0);
  });

  it("never embeds the body in a wall while wandering", () => {
    const maze = generateMaze(99);
    const walls = buildWalls(maze);
    const sim = createSim(maze);
    for (let i = 0; i < 500; i++) {
      sim.yaw += i % 17 === 0 ? 0.4 : 0.05;
      const forward = i % 11 === 0 ? -1 : 1;
      const strafe = i % 5 === 0 ? 1 : i % 5 === 1 ? -1 : 0;
      stepSim(sim, maze, walls, { forward, strafe, sprint: i % 8 === 0 }, 1 / 60);
      assert.equal(circleHitsAny(sim.x, sim.z, PLAYER_R - 0.001, walls), false);
      assert.ok(sim.x > 0 && sim.z > 0 && sim.x < maze.cols * CELL && sim.z < maze.rows * CELL);
    }
  });
});
