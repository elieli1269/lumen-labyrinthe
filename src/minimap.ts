import { CELL, type Maze } from "./maze.ts";
import type { Sim } from "./sim.ts";

const CREAM = "#f4ead6";
const CREAM_ALT = "#e7dcc4";
const INK = "#24302c";
const SAGE = "#7ea37a";
const CLAY = "#d4785a";
const CRYSTAL = "#5fa8c6";

export function drawMinimap(canvas: HTMLCanvasElement, maze: Maze, sim: Sim) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const bw = Math.max(1, Math.floor(w * dpr));
  const bh = Math.max(1, Math.floor(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = 12;
  const cw = (w - pad * 2) / maze.cols;
  const ch = (h - pad * 2) / maze.rows;

  for (let z = 0; z < maze.rows; z++) {
    for (let x = 0; x < maze.cols; x++) {
      if (!sim.explored[z * maze.cols + x]) continue;
      ctx.fillStyle = (x + z) % 2 === 0 ? CREAM : CREAM_ALT;
      ctx.fillRect(pad + x * cw, pad + z * ch, cw + 0.6, ch + 0.6);
    }
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = "square";
  ctx.beginPath();
  for (let z = 0; z <= maze.rows; z++) {
    for (let x = 0; x < maze.cols; x++) {
      if (!maze.hWalls[z * maze.cols + x]) continue;
      const above = z > 0 && sim.explored[(z - 1) * maze.cols + x];
      const below = z < maze.rows && sim.explored[z * maze.cols + x];
      if (!above && !below) continue;
      const x0 = pad + x * cw;
      const y0 = pad + z * ch;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + cw, y0);
    }
  }
  for (let z = 0; z < maze.rows; z++) {
    for (let x = 0; x <= maze.cols; x++) {
      if (!maze.vWalls[z * (maze.cols + 1) + x]) continue;
      const left = x > 0 && sim.explored[z * maze.cols + (x - 1)];
      const right = x < maze.cols && sim.explored[z * maze.cols + x];
      if (!left && !right) continue;
      const x0 = pad + x * cw;
      const y0 = pad + z * ch;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 + ch);
    }
  }
  ctx.stroke();

  for (let i = 0; i < maze.gems.length; i++) {
    if (sim.collected[i]) continue;
    const gem = maze.gems[i]!;
    if (!sim.explored[gem.z * maze.cols + gem.x]) continue;
    ctx.fillStyle = i % 2 === 0 ? CRYSTAL : CLAY;
    ctx.beginPath();
    ctx.arc(pad + (gem.x + 0.5) * cw, pad + (gem.z + 0.5) * ch, Math.max(2.2, cw * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }

  if (sim.explored[maze.exit.z * maze.cols + maze.exit.x]) {
    ctx.fillStyle = SAGE;
    const ex = pad + (maze.exit.x + 0.5) * cw;
    const ez = pad + (maze.exit.z + 0.5) * ch;
    const s = Math.max(4, cw * 0.22);
    ctx.fillRect(ex - s / 2, ez - s / 2, s, s);
  }

  const px = pad + (sim.x / CELL) * cw;
  const pz = pad + (sim.z / CELL) * ch;
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-sim.yaw);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, -6.5);
  ctx.lineTo(4.2, 5);
  ctx.lineTo(0, 2.6);
  ctx.lineTo(-4.2, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
