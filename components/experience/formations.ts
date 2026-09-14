/**
 * Voxel formations for the scroll experience.
 *
 * Every formation is the same set of cubes in a different arrangement, so the
 * scene never swaps meshes: the vertex shader carries each cube from its place
 * in one formation to its place in the next. Index i deliberately means nothing
 * across formations — a cube that was a thumbstick ends up in a screen on the
 * far side — which is what makes a transition burst apart and reassemble
 * instead of sliding.
 *
 * Positions are world units around the origin; the scene shifts and scales
 * them per viewport. The fourth component packs three: scale + glow * 10 + debris * 20.
 */

export type Quality = 'high' | 'low';

export const FORMATION_NAMES = ['controller', 'bays', 'tunnel', 'rates', 'trophy', 'pin'] as const;
export const FORMATION_COUNT = FORMATION_NAMES.length;
export const TUNNEL_INDEX = 2;

/** The tunnel's z span. The shader wraps flight over exactly this range. */
export const TUNNEL_Z_MIN = -46;
export const TUNNEL_Z_LEN = 60;

type Voxel = { x: number; y: number; z: number; s: number; g: number };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive grid coordinates from min to max. Integer stepping, so no float drift. */
function grid(min: number, max: number, step: number): number[] {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, i) => min + i * step);
}

/** Rotates z, then x, then y — the same conventions as rotX/rotY in the shader — then scales. */
function transform(voxels: Voxel[], { rx = 0, ry = 0, rz = 0, k = 1 }): Voxel[] {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  return voxels.map((v) => {
    let { x, y, z } = v;
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    return { x: x * k, y: y * k, z: z * k, s: v.s * k, g: v.g };
  });
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(px - ax - abx * t, py - ay - aby * t);
}

function roundBox(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Chapter 1 — a pad, drawn as a signed-distance silhouette and extruded. */
function controller(step: number): Voxel[] {
  const out: Voxel[] = [];
  const s = step * 0.84;
  const push = (x: number, y: number, z: number, g = 0) => out.push({ x, y, z, s, g });

  for (const x of grid(-4.2, 4.2, step)) {
    for (const y of grid(-3.0, 2.2, step)) {
      const body = Math.min(
        roundBox(x, y, 0, 0.55, 2.4, 1.0, 0.7),
        segmentDistance(x, y, -1.9, 0.4, -3.05, -1.95) - 1.05,
        segmentDistance(x, y, 1.9, 0.4, 3.05, -1.95) - 1.05,
      );
      if (body > 0) continue;

      const rim = body > -step * 1.1;
      const dpad =
        (Math.abs(x + 2.05) < step * 0.75 && Math.abs(y - 0.5) < 0.6) ||
        (Math.abs(y - 0.5) < step * 0.75 && Math.abs(x + 2.05) < 0.6);
      const face = [
        [2.05, 1.05],
        [2.05, -0.05],
        [1.5, 0.5],
        [2.6, 0.5],
      ].some(([cx, cy]) => Math.hypot(x - cx, y - cy) < 0.24);
      const stick = Math.min(Math.hypot(x + 1.0, y + 0.6), Math.hypot(x - 1.0, y + 0.6));
      const pad = Math.abs(x) < 1.2 && y > 0.4 && y < 1.4;
      const lightbar = Math.abs(x) < 1.2 && Math.abs(y - 1.52) < step * 0.6;

      push(x, y, -step);
      // side walls only on the rim, so the silhouette has depth without filling the core
      if (rim) push(x, y, 0);
      // the touchpad sits a little lower than the shell around it
      push(x, y, pad ? step * 0.4 : step, lightbar ? 1 : 0);
      if (dpad || face) push(x, y, step * 2, 1);
      if (stick < 0.5) push(x, y, step * 2);
      if (stick < 0.5 && stick > 0.3) push(x, y, step * 3);
      if (stick < 0.14) push(x, y, step * 3, 1);
    }
  }

  return transform(out, { rx: -0.42, ry: -0.5, rz: 0.1, k: 0.72 });
}

/** Chapter 2 — five screens, one per bay, the centre one larger like the Recliner's OLED. */
function bays(step: number): Voxel[] {
  const out: Voxel[] = [];
  const s = step * 0.84;
  const screens = [
    { cx: -2.75, cy: 1.0, w: 2.4, h: 1.45 },
    { cx: 0, cy: 1.25, w: 2.8, h: 1.7 },
    { cx: 2.75, cy: 1.0, w: 2.4, h: 1.45 },
    { cx: -1.4, cy: -1.25, w: 2.4, h: 1.45 },
    { cx: 1.4, cy: -1.25, w: 2.4, h: 1.45 },
  ];

  for (const screen of screens) {
    // outer screens angle in, like monitors facing a couch
    const turn = -screen.cx * 0.14;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const depth = -Math.abs(screen.cx) * 0.3;
    const place = (u: number, v: number, d: number, g = 0) =>
      out.push({ x: screen.cx + u * c + d * sn, y: screen.cy + v, z: depth - u * sn + d * c, s, g });

    const us = grid(-screen.w / 2, screen.w / 2, step);
    const vs = grid(-screen.h / 2, screen.h / 2, step);

    us.forEach((u, i) => {
      vs.forEach((v, j) => {
        const frame = i === 0 || i === us.length - 1 || j === 0 || j === vs.length - 1;
        if (frame) {
          place(u, v, 0);
          place(u, v, -step);
        } else {
          // alternate rows lit: scanlines, and half the bloom a solid panel would cost
          place(u, v, -step * 0.3, j % 2 === 0 ? 1 : 0);
        }
      });
    });

    const foot = -screen.h / 2;
    place(0, foot - step, -step * 0.5);
    place(0, foot - step * 2, -step * 0.5);
    for (let i = -2; i <= 2; i++) place(i * step, foot - step * 3, -step * 0.5);
  }

  return transform(out, { rx: 0.12, ry: -0.42, k: 0.72 });
}

/** Chapter 3 — an octagonal corridor the camera flies down while the game list scrolls. */
function tunnel(quality: Quality): Voxel[] {
  const out: Voxel[] = [];
  const ringGap = quality === 'high' ? 1.15 : 1.7;
  // divisible by 4, so the four lit stripes land on whole voxels
  const perRing = quality === 'high' ? 44 : 28;
  const radius = 3.8;
  const s = quality === 'high' ? 0.34 : 0.42;
  const rings = Math.floor(TUNNEL_Z_LEN / ringGap);
  const sector = Math.PI / 4;

  for (let r = 0; r < rings; r++) {
    const z = TUNNEL_Z_MIN + r * ringGap;
    for (let k = 0; k < perRing; k++) {
      const a = (k / perRing) * Math.PI * 2;
      // an octagon reads as a corridor; a circle reads as a pipe
      const octagon = Math.cos(sector / 2) / Math.cos((a % sector) - sector / 2);
      out.push({
        x: Math.cos(a) * radius * octagon,
        y: Math.sin(a) * radius * octagon,
        z,
        s,
        g: r % 6 === 0 || k % (perRing / 4) === 0 ? 1 : 0,
      });
    }
  }

  return out;
}

/** Chapter 4 — one pillar per hourly rate, rising like a level meter, with an arrow on the top one. */
function rates(step: number, amounts: number[]): Voxel[] {
  const out: Voxel[] = [];
  const s = step * 0.84;
  const sorted = [...amounts].sort((a, b) => a - b);
  const tallest = sorted[sorted.length - 1] || 1;
  const heights = sorted.map((amount) => (amount / tallest) * 4.0);
  const side = Math.max(3, Math.round(0.9 / step));
  const gap = 1.45;
  const floor = -2.3;

  heights.forEach((height, b) => {
    const cx = (b - (heights.length - 1) / 2) * gap;
    const layers = Math.round(height / step);

    for (let l = 0; l <= layers; l++) {
      for (let ix = 0; ix < side; ix++) {
        for (let iz = 0; iz < side; iz++) {
          const shell = ix === 0 || iz === 0 || ix === side - 1 || iz === side - 1;
          if (!shell && l !== layers) continue;
          out.push({
            x: cx + (ix - (side - 1) / 2) * step,
            y: floor + l * step,
            z: (iz - (side - 1) / 2) * step,
            s,
            g: l >= layers - 1 ? 1 : 0,
          });
        }
      }
    }
  });

  const px = Math.round((heights.length * gap) / 2 / step);
  const pz = Math.round(1.1 / step);
  for (let i = -px; i <= px; i++) {
    for (let k = -pz; k <= pz; k++) {
      const edge = Math.abs(i) === px || Math.abs(k) === pz;
      if (!edge && (i + k) % 2 !== 0) continue;
      out.push({ x: i * step, y: floor - step, z: k * step, s: edge ? s : s * 0.7, g: 0 });
    }
  }

  const arrow = ['..#..', '.###.', '#####', '.###.', '.###.'];
  const ax = ((heights.length - 1) / 2) * gap;
  const ay = floor + heights[heights.length - 1] + 0.7;
  arrow.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell === '#') out.push({ x: ax + (c - 2) * step, y: ay + (arrow.length - 1 - r) * step, z: 0, s, g: 1 });
    });
  });

  return transform(out, { rx: 0.3, ry: -0.62, k: 0.95 });
}

/** Chapter 5 — a trophy for the Saturday bracket, ringed by one block per seat in the room. */
function trophy(step: number, seats: number): Voxel[] {
  const out: Voxel[] = [];
  const s = step * 0.84;
  const bottom = -2.3;
  const top = 1.9;

  const radiusAt = (y: number) => {
    if (y < -1.95) return 1.25;
    if (y < -1.6) return 0.95;
    if (y < -0.35) return Math.abs(y + 0.95) < 0.2 ? 0.46 : 0.28;
    return 0.38 + 1.1 * Math.sqrt((y + 0.35) / 2.25);
  };

  const ys = grid(bottom, top, step);
  ys.forEach((y, r) => {
    const radius = radiusAt(y);
    const count = Math.max(6, Math.round((Math.PI * 2 * radius) / step));
    const lit = r === ys.length - 1 || Math.abs(y + 1.95) < step * 0.5;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + r * 0.13;
      out.push({ x: Math.cos(a) * radius, y, z: Math.sin(a) * radius, s, g: lit ? 1 : 0 });
    }
  });

  // light pooled inside the cup
  const fillY = top - step * 1.5;
  const fillRadius = radiusAt(fillY) - step;
  for (const x of grid(-fillRadius, fillRadius, step)) {
    for (const z of grid(-fillRadius, fillRadius, step)) {
      if (Math.hypot(x, z) <= fillRadius) out.push({ x, y: fillY, z, s, g: 1 });
    }
  }

  for (const sideSign of [-1, 1]) {
    const steps = Math.round((Math.PI * 0.62) / step);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      out.push({ x: sideSign * (1.2 + 0.62 * Math.sin(a)), y: 0.85 + 0.62 * Math.cos(a), z: 0, s, g: 0 });
    }
  }

  for (let i = 0; i < seats; i++) {
    const a = (i / seats) * Math.PI * 2;
    const cx = Math.cos(a) * 3.2;
    const cz = Math.sin(a) * 3.2;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
          out.push({
            x: cx + (dx - 0.5) * step,
            y: bottom + dy * step,
            z: cz + (dz - 0.5) * step,
            s,
            g: dy === 1 && dx === 0 && dz === 0 ? 1 : 0,
          });
        }
      }
    }
  }

  return transform(out, { rx: 0.2, ry: 0.3, k: 0.9 });
}

/** Chapter 6 — a map pin over a patch of street grid, with rings rippling out from where it lands. */
function pin(step: number): Voxel[] {
  const out: Voxel[] = [];
  const s = step * 0.84;
  const headY = 1.35;
  const headR = 1.15;

  const count = Math.round((4 * Math.PI * headR * headR) / (step * step));
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const ny = 1 - (i / (count - 1)) * 2;
    // the cone covers the underside of the sphere
    if (ny < -0.55) continue;
    const ring = Math.sqrt(1 - ny * ny);
    const theta = golden * i;
    const nx = Math.cos(theta) * ring;
    const nz = Math.sin(theta) * ring;
    out.push({ x: nx * headR, y: headY + ny * headR, z: nz * headR, s, g: nz > 0.8 && nz < 0.93 ? 1 : 0 });
  }

  const coneTop = headY - headR * 0.55;
  const coneRadius = Math.sqrt(1 - 0.55 * 0.55) * headR;
  const tip = -1.5;
  for (const y of grid(tip, coneTop, step)) {
    const radius = coneRadius * ((y - tip) / (coneTop - tip));
    const around = Math.max(1, Math.round((Math.PI * 2 * radius) / step));
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      out.push({ x: Math.cos(a) * radius, y, z: Math.sin(a) * radius, s, g: radius < step ? 1 : 0 });
    }
  }

  const groundY = -1.75;
  const reach = 3.6;
  const cell = step * 1.4;
  for (const x of grid(-reach, reach, cell)) {
    for (const z of grid(-reach, reach, cell)) {
      if (Math.hypot(x, z) > reach) continue;
      if (Math.round(x / cell + z / cell) % 2 !== 0) continue;
      out.push({ x, y: groundY, z, s: s * 0.6, g: 0 });
    }
  }

  for (const radius of [1.3, 2.6]) {
    const around = Math.round((Math.PI * 2 * radius) / step);
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      out.push({ x: Math.cos(a) * radius, y: groundY + step * 0.5, z: Math.sin(a) * radius, s, g: 1 });
    }
  }

  return transform(out, { rx: 0.32, ry: -0.35, k: 0.95 });
}

/**
 * Shuffles a shape into `count` slots. Slots the shape does not need become
 * debris — small cubes drifting far behind — so every formation has exactly
 * the same number of instances.
 */
function pack(voxels: Voxel[], count: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const pool = voxels.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    let voxel = pool[i];
    // debris is flagged (+20) so the shader can keep it drifting while a real model replaces the shape
    let debris = 0;
    if (!voxel) {
      debris = 1;
      // debris is dust, not scenery: small, far, and mostly unlit, so it never competes with type
      const r = 16 + rand() * 22;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const z = r * Math.sin(phi) * Math.sin(theta);
      voxel = {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi) * 0.6,
        // never between the camera and the formation
        z: -Math.abs(z) - 10,
        s: 0.06 + rand() * 0.14,
        g: rand() < 0.04 ? 1 : 0,
      };
    }
    out[i * 4] = voxel.x;
    out[i * 4 + 1] = voxel.y;
    out[i * 4 + 2] = voxel.z;
    out[i * 4 + 3] = voxel.s + voxel.g * 10 + debris * 20;
  }
  return out;
}

export function buildFormations(quality: Quality, options: { rates: number[]; seats: number }) {
  const step = quality === 'high' ? 0.2 : 0.3;
  const shapes = [
    controller(step),
    bays(step),
    tunnel(quality),
    rates(step, options.rates),
    trophy(step, options.seats),
    pin(step),
  ];

  const largest = Math.max(...shapes.map((shape) => shape.length));
  const count = largest + (quality === 'high' ? 500 : 220);
  const data = shapes.map((shape, i) => pack(shape, count, 1234 + i * 97));

  const rand = mulberry32(4242);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();

  return { count, data, seeds };
}
