import * as THREE from "three";
import { playPickup, playWin, unlockAudio } from "./audio.ts";
import { buildWalls, type AABB } from "./collision.ts";
import { drawMinimap } from "./minimap.ts";
import { CELL, cellCenter, generateMaze, type Maze } from "./maze.ts";
import { createSim, EYE, formatTime, stepSim, WALK, type Sim } from "./sim.ts";

type Phase = "intro" | "play" | "pause" | "win";

type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getPos: () => { x: number; z: number };
  setKeys: (codes: string[]) => void;
  resume: () => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

type Burst = {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
};

const BEST_KEY = "lumen-best-ms";

function randomSeed() {
  const n = (Math.random() * 0xffffffff) >>> 0;
  return n || 1;
}

function readBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeBest(ms: number) {
  try {
    localStorage.setItem(BEST_KEY, String(ms));
  } catch {
    /* ignore quota / private mode */
  }
}

export function mountGame(root: HTMLElement) {
  root.replaceChildren();
  root.classList.add("game-root");

  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  root.append(canvas);

  const hud = document.createElement("div");
  hud.className = "hud";
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  const timeChip = document.createElement("div");
  timeChip.className = "chip";
  const timeLabel = document.createElement("span");
  timeLabel.textContent = "Temps";
  const timeValue = document.createElement("b");
  timeValue.textContent = "0:00.00";
  timeChip.append(timeLabel, timeValue);
  const gemChip = document.createElement("div");
  gemChip.className = "chip";
  const gemLabel = document.createElement("span");
  gemLabel.textContent = "Prismes";
  const gemValue = document.createElement("b");
  gemValue.textContent = "0 / 0";
  gemChip.append(gemLabel, gemValue);
  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.className = "pause-btn";
  pauseBtn.textContent = "Pause";
  topbar.append(timeChip, gemChip, pauseBtn);

  const mapWrap = document.createElement("div");
  mapWrap.className = "minimap-wrap";
  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = 148;
  mapCanvas.height = 148;
  const mapCaption = document.createElement("p");
  mapCaption.textContent = "Exploré";
  mapWrap.append(mapCanvas, mapCaption);

  const crosshair = document.createElement("div");
  crosshair.className = "crosshair";
  crosshair.hidden = true;

  const touchUi = document.createElement("div");
  touchUi.className = "touch-ui";
  const stickBase = document.createElement("div");
  stickBase.className = "stick-base";
  const stickKnob = document.createElement("div");
  stickKnob.className = "stick-knob";
  stickBase.append(stickKnob);
  const lookHint = document.createElement("p");
  lookHint.className = "look-hint";
  lookHint.textContent = "Glisse pour regarder";
  touchUi.append(stickBase, lookHint);
  hud.append(topbar, mapWrap, crosshair, touchUi);

  const touchCatch = document.createElement("div");
  touchCatch.className = "touch-catch";

  const intro = veil(
    crystalSvg(),
    "Lumen",
    "Un jardin de papier. Ramasse les prismes, suis les couloirs, trouve la clairière.",
    [
      ["ZQSD", "WASD", "flèches", "pour marcher"],
      ["Souris", "pour regarder · Maj pour courir"],
      ["Téléphone", "joystick à gauche, glisser à droite"],
    ],
    [["Entrer", "primary"]],
  );
  const pauseVeil = veil(
    null,
    "Pause",
    "Le jardin attend. Le chronomètre est arrêté.",
    [],
    [
      ["Reprendre", "primary"],
      ["Nouvelle carte", "secondary"],
    ],
    "h2",
  );
  const winVeil = veil(
    crystalSvg(),
    "Sortie trouvée",
    "La clairière s’ouvre. Le jardin garde ta trace.",
    [],
    [
      ["Rejouer", "primary"],
      ["Même carte", "secondary"],
    ],
    "h2",
  );
  const winStats = document.createElement("div");
  winStats.className = "stats";
  const winTime = stat("Temps", "0:00.00");
  const winGems = stat("Prismes", "0 / 0");
  winStats.append(winTime.box, winGems.box);
  const record = document.createElement("p");
  record.className = "record";
  record.hidden = true;
  const seedLine = document.createElement("p");
  seedLine.className = "lede";
  const winCard = winVeil.veil.querySelector(".card");
  const winActions = winVeil.veil.querySelector(".actions");
  winCard?.insertBefore(winStats, winActions);
  winCard?.insertBefore(record, winActions);
  winCard?.insertBefore(seedLine, winActions);

  root.append(hud, touchCatch, intro.veil, pauseVeil.veil, winVeil.veil);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
  renderer.setClearColor("#8ecae6");
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9ed0e6");
  scene.fog = new THREE.Fog("#9ed0e6", 14, 42);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 90);
  camera.rotation.order = "YXZ";

  const hemi = new THREE.HemisphereLight("#e7f6ff", "#7ea37a", 0.78);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff3e2", 1.45);
  sun.position.set(18, 28, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 70;
  const shadowSpan = 28;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: "#6f946c", roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const world = {
    maze: generateMaze(randomSeed()),
    walls: [] as AABB[],
    sim: null as Sim | null,
    phase: "intro" as Phase,
  };
  world.walls = buildWalls(world.maze);
  world.sim = createSim(world.maze);

  let level: THREE.Group | null = null;
  let gemMeshes: THREE.Mesh[] = [];
  let exitSpin: THREE.Object3D | null = null;
  const bursts: Burst[] = [];
  const burstGeo = new THREE.OctahedronGeometry(0.08, 0);
  const burstMat = new THREE.MeshStandardMaterial({
    color: "#c9e7f4",
    emissive: "#5fa8c6",
    emissiveIntensity: 0.6,
    flatShading: true,
    roughness: 0.4,
  });

  const keys = new Set<string>();
  let lookX = 0;
  let lookY = 0;
  let stickX = 0;
  let stickY = 0;
  let shake = 0;
  let elapsed = 0;
  let acc = 0;
  let wonLatch = false;
  let disposed = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sens = 0.00215;

  function load(seed: number) {
    world.maze = generateMaze(seed);
    world.walls = buildWalls(world.maze);
    world.sim = createSim(world.maze);
    wonLatch = false;
    shake = 0;
    acc = 0;
    buildLevel(world.maze);
    paintHud();
    seedLine.textContent = `Carte n° ${world.maze.seed}`;
  }

  function buildLevel(maze: Maze) {
    if (level) {
      scene.remove(level);
      level.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat && mat !== burstMat) mat.dispose();
      });
    }
    for (const burst of bursts) scene.remove(burst.mesh);
    bursts.length = 0;

    level = new THREE.Group();
    gemMeshes = [];
    const cx = (maze.cols * CELL) / 2;
    const cz = (maze.rows * CELL) / 2;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + 14, 26, cz + 10);
    ground.position.set(cx, -0.02, cz);

    const floorMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
    const floor = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CELL - 0.22, 0.18, CELL - 0.22),
      floorMat,
      maze.cols * maze.rows,
    );
    floor.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let fi = 0;
    for (let z = 0; z < maze.rows; z++) {
      for (let x = 0; x < maze.cols; x++) {
        dummy.position.set((x + 0.5) * CELL, -0.09, (z + 0.5) * CELL);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        floor.setMatrixAt(fi, dummy.matrix);
        floor.setColorAt(fi, tint.set((x + z) % 2 === 0 ? "#d7e4cb" : "#c5d6b4"));
        fi++;
      }
    }
    floor.instanceMatrix.needsUpdate = true;
    if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
    level.add(floor);

    addWalls(level, maze, dummy, tint);
    addTrees(level, maze);

    maze.gems.forEach((gem, i) => {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? "#8ecae6" : "#d4785a",
          emissive: i % 2 === 0 ? "#3d8eaf" : "#a85a42",
          emissiveIntensity: 0.55,
          roughness: 0.32,
          metalness: 0.05,
          flatShading: true,
        }),
      );
      const p = cellCenter(gem);
      mesh.position.set(p.x, 0.92, p.z);
      mesh.castShadow = true;
      level!.add(mesh);
      gemMeshes.push(mesh);
    });

    const exit = cellCenter(maze.exit);
    const portal = new THREE.Group();
    portal.position.set(exit.x, 0, exit.z);
    const postMat = new THREE.MeshStandardMaterial({ color: "#3f6b4e", roughness: 0.85, flatShading: true });
    const postGeo = new THREE.BoxGeometry(0.28, 2.15, 0.28);
    const left = new THREE.Mesh(postGeo, postMat);
    left.position.set(-0.72, 1.05, 0);
    const right = new THREE.Mesh(postGeo, postMat);
    right.position.set(0.72, 1.05, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.24, 0.28), postMat);
    lintel.position.set(0, 2.2, 0);
    const veilMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.7),
      new THREE.MeshBasicMaterial({
        color: "#c9e7f4",
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    veilMesh.position.set(0, 1.15, 0);
    const spin = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      new THREE.MeshStandardMaterial({
        color: "#f7f1e6",
        emissive: "#7ea37a",
        emissiveIntensity: 0.7,
        flatShading: true,
        roughness: 0.3,
      }),
    );
    spin.position.set(0, 1.35, 0);
    for (const part of [left, right, lintel]) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
    portal.add(left, right, lintel, veilMesh, spin);
    const glow = new THREE.PointLight("#c9e7f4", 2.2, 7, 2);
    glow.position.set(0, 1.4, 0);
    portal.add(glow);
    level.add(portal);
    exitSpin = spin;
    scene.add(level);
  }

  function spawnBurst(x: number, y: number, z: number) {
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(burstGeo, burstMat);
      mesh.position.set(x, y, z);
      const a = (i / 8) * Math.PI * 2;
      scene.add(mesh);
      bursts.push({
        mesh,
        vx: Math.cos(a) * 1.6,
        vy: 1.8 + (i % 3) * 0.3,
        vz: Math.sin(a) * 1.6,
        life: 0.45,
      });
    }
  }

  function readMove() {
    let forward = 0;
    let strafe = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) forward += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) forward -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) strafe += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) strafe -= 1;
    const keyboard = forward !== 0 || strafe !== 0;
    if (!keyboard) {
      strafe = stickX;
      forward = -stickY;
    }
    const sprint =
      keys.has("ShiftLeft") ||
      keys.has("ShiftRight") ||
      (!keyboard && Math.hypot(strafe, forward) > 0.92);
    return { forward, strafe, sprint };
  }

  function paintHud() {
    const sim = world.sim;
    if (!sim) return;
    timeValue.textContent = formatTime(sim.time);
    gemValue.textContent = `${sim.count} / ${world.maze.gems.length}`;
    drawMinimap(mapCanvas, world.maze, sim);
  }

  function setPhase(phase: Phase) {
    world.phase = phase;
    intro.veil.hidden = phase !== "intro";
    pauseVeil.veil.hidden = phase !== "pause";
    winVeil.veil.hidden = phase !== "win";
    crosshair.hidden = phase !== "play";
    touchCatch.style.display = phase === "play" ? "" : "none";
    pauseBtn.hidden = phase === "intro" || phase === "win";
  }

  function lockPointer() {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    const target = canvas as HTMLCanvasElement & {
      requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };
    try {
      const pending = target.requestPointerLock({ unadjustedMovement: true });
      if (pending && typeof (pending as Promise<void>).catch === "function") {
        void (pending as Promise<void>).catch(() => {
          try {
            canvas.requestPointerLock();
          } catch {
            /* pointer lock unavailable */
          }
        });
      }
    } catch {
      try {
        canvas.requestPointerLock();
      } catch {
        /* pointer lock unavailable */
      }
    }
  }

  function begin() {
    unlockAudio();
    setPhase("play");
    lockPointer();
  }

  function onWin() {
    if (wonLatch) return;
    wonLatch = true;
    const sim = world.sim;
    if (!sim) return;
    setPhase("win");
    if (document.pointerLockElement) document.exitPointerLock();
    playWin();
    winTime.value.textContent = formatTime(sim.time);
    winGems.value.textContent = `${sim.count} / ${world.maze.gems.length}`;
    seedLine.textContent = `Carte n° ${world.maze.seed}`;
    const ms = Math.round(sim.time * 1000);
    const best = readBest();
    if (best === null || ms < best) {
      writeBest(ms);
      record.hidden = false;
      record.textContent = "Nouveau record";
    } else {
      record.hidden = false;
      record.textContent = `Record ${formatTime(best / 1000)}`;
    }
  }

  function restart(same: boolean) {
    load(same ? world.maze.seed : randomSeed());
    begin();
  }

  const listeners: Array<() => void> = [];
  const listen = (
    target: Window | Document | HTMLElement,
    type: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };

  listen(window, "keydown", (event) => {
    const e = event as KeyboardEvent;
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    if (e.code === "Escape" && world.phase === "play") setPhase("pause");
  });
  listen(window, "keyup", (event) => {
    keys.delete((event as KeyboardEvent).code);
  });
  listen(window, "blur", () => {
    keys.clear();
    stickX = 0;
    stickY = 0;
    stickKnob.style.transform = "";
  });
  listen(document, "visibilitychange", () => {
    if (document.hidden) keys.clear();
  });
  listen(document, "mousemove", (event) => {
    if (document.pointerLockElement !== canvas || world.phase !== "play") return;
    const e = event as MouseEvent;
    lookX += e.movementX * sens;
    lookY += e.movementY * sens;
  });
  let wasLocked = false;
  listen(document, "pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    if (wasLocked && !locked && world.phase === "play") setPhase("pause");
    wasLocked = locked;
  });

  const pointers = new Map<number, { sx: number; sy: number; lx: number; ly: number; kind: "move" | "look" }>();
  listen(touchCatch, "pointerdown", (event) => {
    if (world.phase !== "play") return;
    const e = event as PointerEvent;
    touchCatch.setPointerCapture(e.pointerId);
    const rect = touchCatch.getBoundingClientRect();
    const kind = e.clientX - rect.left < rect.width * 0.45 ? "move" : "look";
    pointers.set(e.pointerId, { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, kind });
  });
  listen(touchCatch, "pointermove", (event) => {
    const e = event as PointerEvent;
    const p = pointers.get(e.pointerId);
    if (!p || world.phase !== "play") return;
    if (p.kind === "look") {
      lookX += (e.clientX - p.lx) * 0.0048;
      lookY += (e.clientY - p.ly) * 0.0048;
      p.lx = e.clientX;
      p.ly = e.clientY;
      return;
    }
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    const max = 46;
    const len = Math.hypot(dx, dy) || 1;
    const scale = len > max ? max / len : 1;
    stickX = (dx * scale) / max;
    stickY = (dy * scale) / max;
    stickKnob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  });
  const endPointer = (event: Event) => {
    const e = event as PointerEvent;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (p?.kind === "move") {
      stickX = 0;
      stickY = 0;
      stickKnob.style.transform = "";
    }
  };
  listen(touchCatch, "pointerup", endPointer);
  listen(touchCatch, "pointercancel", endPointer);

  intro.buttons[0]?.addEventListener("click", begin);
  pauseVeil.buttons[0]?.addEventListener("click", () => {
    unlockAudio();
    setPhase("play");
    lockPointer();
  });
  pauseVeil.buttons[1]?.addEventListener("click", () => restart(false));
  winVeil.buttons[0]?.addEventListener("click", () => restart(false));
  winVeil.buttons[1]?.addEventListener("click", () => restart(true));
  pauseBtn.addEventListener("click", () => {
    if (world.phase === "play") {
      if (document.pointerLockElement) document.exitPointerLock();
      setPhase("pause");
    }
  });

  const resize = () => {
    const w = root.clientWidth || window.innerWidth || 1;
    const h = root.clientHeight || window.innerHeight || 1;
    camera.aspect = w / Math.max(1, h);
    camera.fov = h < 520 ? 80 : 72;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(root);

  load(world.maze.seed);
  setPhase("intro");

  if (import.meta.env.DEV || new URLSearchParams(location.search).has("qa")) {
    window.__controlsTest = {
      getYaw: () => world.sim?.yaw ?? 0,
      getSpeed: () => (world.sim ? Math.hypot(world.sim.vx, world.sim.vz) : 0),
      getPos: () => ({ x: world.sim?.x ?? 0, z: world.sim?.z ?? 0 }),
      setKeys: (codes) => {
        keys.clear();
        for (const code of codes) keys.add(code);
      },
      resume: () => setPhase("play"),
    };
  }

  let last = performance.now();
  const STEP = 1 / 60;
  renderer.setAnimationLoop(() => {
    if (disposed || !world.sim) return;
    const now = performance.now();
    let delta = (now - last) / 1000;
    last = now;
    if (document.hidden) return;
    delta = Math.min(Math.max(delta, 0), 0.1);
    elapsed += delta;
    shake *= Math.exp(-6 * delta);

    if (world.phase === "play") {
      world.sim.yaw -= lookX;
      world.sim.pitch = Math.max(-1.55, Math.min(1.55, world.sim.pitch - lookY));
    }
    lookX = 0;
    lookY = 0;

    if (world.phase === "play" && !world.sim.won) {
      acc += delta;
      const input = readMove();
      let guard = 0;
      while (acc >= STEP && guard++ < 6) {
        const result = stepSim(world.sim, world.maze, world.walls, input, STEP);
        acc -= STEP;
        if (result.picked.length) {
          shake = 0.05;
          playPickup();
          for (const index of result.picked) {
            const gem = world.maze.gems[index];
            if (!gem) continue;
            const p = cellCenter(gem);
            spawnBurst(p.x, 0.9, p.z);
          }
        }
        if (result.won) {
          acc = 0;
          onWin();
          break;
        }
      }
    } else {
      acc = 0;
    }

    gemMeshes.forEach((mesh, i) => {
      mesh.visible = !world.sim!.collected[i];
      if (!mesh.visible) return;
      mesh.position.y = 0.92 + Math.sin(elapsed * 2.1 + i) * 0.08;
      mesh.rotation.y = elapsed * 0.9 + i;
    });
    if (exitSpin) exitSpin.rotation.y = elapsed * 0.7;

    for (let i = bursts.length - 1; i >= 0; i--) {
      const burst = bursts[i]!;
      burst.life -= delta;
      burst.vy -= 6 * delta;
      burst.mesh.position.x += burst.vx * delta;
      burst.mesh.position.y += burst.vy * delta;
      burst.mesh.position.z += burst.vz * delta;
      if (burst.life <= 0) {
        scene.remove(burst.mesh);
        bursts.splice(i, 1);
      }
    }

    const sim = world.sim;
    const speed = Math.hypot(sim.vx, sim.vz);
    const bob =
      !reduceMotion && world.phase === "play"
        ? Math.sin(sim.bob * 9) * 0.032 * Math.min(1, speed / WALK)
        : 0;
    const sway = world.phase === "intro" && !reduceMotion ? Math.sin(elapsed * 0.45) * 0.1 : 0;
    camera.position.set(sim.x, EYE + bob + shake, sim.z);
    camera.rotation.y = sim.yaw + sway;
    camera.rotation.x = sim.pitch + (world.phase === "intro" ? Math.sin(elapsed * 0.3) * 0.025 : 0);
    paintHud();
    renderer.render(scene, camera);
  });

  return () => {
    disposed = true;
    renderer.setAnimationLoop(null);
    observer.disconnect();
    for (const off of listeners) off();
    if (window.__controlsTest) delete window.__controlsTest;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    burstGeo.dispose();
    burstMat.dispose();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    if (level) {
      scene.remove(level);
      level.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && mesh.geometry !== burstGeo) mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat && mat !== burstMat) mat.dispose();
      });
    }
    renderer.dispose();
    root.replaceChildren();
  };
}

function addWalls(level: THREE.Group, maze: Maze, dummy: THREE.Object3D, tint: THREE.Color) {
  const t = 0.38;
  const horizontals: { x: number; z: number }[] = [];
  const verticals: { x: number; z: number }[] = [];
  for (let z = 0; z <= maze.rows; z++) {
    for (let x = 0; x < maze.cols; x++) {
      if (!maze.hWalls[z * maze.cols + x]) continue;
      horizontals.push({ x: (x + 0.5) * CELL, z: z * CELL });
    }
  }
  for (let z = 0; z < maze.rows; z++) {
    for (let x = 0; x <= maze.cols; x++) {
      if (!maze.vWalls[z * (maze.cols + 1) + x]) continue;
      verticals.push({ x: x * CELL, z: (z + 0.5) * CELL });
    }
  }
  const bodyMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.94, metalness: 0 });
  const capMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, metalness: 0 });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, horizontals.length + verticals.length);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), capMat, horizontals.length + verticals.length);
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  caps.castShadow = true;
  let i = 0;
  const place = (x: number, z: number, sx: number, sz: number) => {
    dummy.position.set(x, 1.15, z);
    dummy.scale.set(sx, 2.3, sz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, tint.set(i % 3 === 0 ? "#f7f1e6" : "#f3ebdd"));
    dummy.position.set(x, 2.4, z);
    dummy.scale.set(sx + 0.06, 0.26, sz + 0.06);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
    caps.setColorAt(i, tint.set(i % 2 === 0 ? "#7ea37a" : "#6d946c"));
    i++;
  };
  for (const wall of horizontals) place(wall.x, wall.z, CELL + t, t);
  for (const wall of verticals) place(wall.x, wall.z, t, CELL + t);
  bodies.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  level.add(bodies, caps);
}

function addTrees(level: THREE.Group, maze: Maze) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#d4785a", roughness: 0.8, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#3f6b4e", roughness: 0.85, flatShading: true });
  const spots = [
    [-2.2, -2.2],
    [maze.cols * CELL + 2.2, -2.4],
    [-2.4, maze.rows * CELL + 2.2],
    [maze.cols * CELL + 2.3, maze.rows * CELL + 2.1],
  ];
  for (const [x, z] of spots) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 5), trunkMat);
    trunk.position.set(x!, 0.4, z!);
    trunk.castShadow = true;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 6), leafMat);
    leaf.position.set(x!, 1.55, z!);
    leaf.castShadow = true;
    level.add(trunk, leaf);
  }
}

function crystalSvg() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 25 13.2 16 16.2 7 13.2Z" fill="#C9E7F4"/><path d="M16 3 25 13.2 16 16.2Z" fill="#8ECAE6"/><path d="M7 13.2 16 16.2 16 29Z" fill="#5FA8C6"/><path d="M25 13.2 16 16.2 16 29Z" fill="#D4785A"/></svg>`;
  return wrap.firstElementChild as SVGElement;
}

function stat(label: string, value: string) {
  const box = document.createElement("div");
  box.className = "stat";
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("b");
  strong.textContent = value;
  box.append(span, strong);
  return { box, value: strong };
}

function veil(
  mark: SVGElement | null,
  title: string,
  lede: string,
  help: string[][],
  actions: Array<[string, "primary" | "secondary"]>,
  heading: "h1" | "h2" = "h1",
) {
  const overlay = document.createElement("div");
  overlay.className = "veil";
  const card = document.createElement("div");
  card.className = "card";
  if (mark) card.append(mark);
  const h = document.createElement(heading);
  h.textContent = title;
  const p = document.createElement("p");
  p.className = "lede";
  p.textContent = lede;
  card.append(h, p);
  if (help.length) {
    const list = document.createElement("ul");
    list.className = "help";
    for (const row of help) {
      const li = document.createElement("li");
      if (row.length === 4) {
        for (const key of row.slice(0, 3)) {
          const kbd = document.createElement("kbd");
          kbd.textContent = key;
          li.append(kbd);
        }
        li.append(document.createTextNode(` ${row[3]}`));
      } else {
        const kbd = document.createElement("kbd");
        kbd.textContent = row[0] ?? "";
        li.append(kbd, document.createTextNode(` ${row[1] ?? ""}`));
      }
      list.append(li);
    }
    card.append(list);
  }
  const row = document.createElement("div");
  row.className = "actions";
  const buttons: HTMLButtonElement[] = [];
  for (const [label, kind] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = kind === "primary" ? "btn" : "btn secondary";
    button.textContent = label;
    row.append(button);
    buttons.push(button);
  }
  card.append(row);
  overlay.append(card);
  return { veil: overlay, buttons };
}
