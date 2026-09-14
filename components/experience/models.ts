import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

import { FORMATION_COUNT } from './formations';

/**
 * The real models each chapter settles into.
 *
 * The solid geometry comes from Blender: assets-src/build_models.py models each
 * one with real bevels and bakes its ambient occlusion in Cycles, and
 * `npm run models` compresses the result into public/models/*.glb. The glTF
 * occlusion map arrives as `aoMap`, so every crease and every part resting on
 * another is already darkened before a single light touches it.
 *
 * What stays in code is what has to be live: the gameplay on the screens, the
 * price labels, the trophy plate, the pin's street map and ripples, and the
 * transitions. Overlay positions share the same local frame as the Blender
 * scene (three.js axes, no conversion), so they line up without offsets.
 *
 * Transitions are a snap and a build. Scrolling past a chapter, its model
 * crumbles from one side into ash that blows away; scrolling into one, glowing
 * specks stream in and lock onto its surface as it forms. Both are one sweep
 * across the model and one cloud of specks sampled from its real surface.
 * A model that has not loaded yet reports `ready: false`, and its chapter
 * simply stays voxels.
 */

export type Palette = {
  accent: THREE.Color;
  lamp: THREE.Color;
  paper: THREE.Color;
};

export type Transition = {
  /** 0 → nothing drawn, 1 → fully formed. */
  reveal: { value: number };
  /** 0 → building in (nanotech), 1 → snapping away (dust). */
  mode: { value: number };
  /** World space → the model's own frame, so the sweep stays fixed to the model while it spins. */
  space: { value: THREE.Matrix4 };
  /** Where the sweep axis starts and ends across this model's surface. */
  range: { value: THREE.Vector2 };
};

type DustShared = { time: { value: number }; scale: { value: number }; count: number };

export type HeroModel = {
  /** Positioned, scaled and spun by the scene exactly like its voxel formation. */
  root: THREE.Group;
  transition: Transition;
  /** False until its .glb has loaded. */
  ready: boolean;
  update: (elapsed: number) => void;
};

const DISSOLVE_NOISE = /* glsl */ `
  float dissolveHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float dissolveValue(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dissolveHash(i), dissolveHash(i + vec3(1, 0, 0)), f.x),
          mix(dissolveHash(i + vec3(0, 1, 0)), dissolveHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(dissolveHash(i + vec3(0, 0, 1)), dissolveHash(i + vec3(1, 0, 1)), f.x),
          mix(dissolveHash(i + vec3(0, 1, 1)), dissolveHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float dissolveNoise(vec3 p) {
    return 0.65 * dissolveValue(p) + 0.35 * dissolveValue(p * 2.7);
  }
`;

/**
 * The sweep: one number per point on a model, 0 on one side and 1 on the other,
 * roughened by noise so the front is ragged rather than a ruler line. Both the
 * surface and its dust read the same function in the model's own frame, which
 * is why a speck of dust leaves (or lands) exactly where the surface vanishes
 * (or appears).
 */
const SWEEP = /* glsl */ `
  uniform vec3 uSweepDir;
  uniform vec2 uSweepRange;
  float lvlSweep(vec3 p) {
    float d = (dot(p, uSweepDir) - uSweepRange.x) / max(uSweepRange.y - uSweepRange.x, 0.001);
    return clamp(d * 0.8 + (dissolveValue(p * 1.8) - 0.5) * 0.3 + 0.1, 0.0, 1.0);
  }
`;

/** The direction every model snaps from and builds toward: left to right, rising slightly. */
const SWEEP_DIR = { value: new THREE.Vector3(1, 0.35, 0.15).normalize() };
/** Where the snapped dust blows. */
const WIND = new THREE.Vector3(1, 0.25, 0.35).normalize();

/**
 * Patches any built-in material so its surface follows the model's transition:
 * eaten away behind the sweep while snapping, laid down behind it while
 * building, with a lit edge along the front either way.
 */
function dissolve<T extends THREE.Material>(material: T, transition: Transition, edge: THREE.Color): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = transition.reveal;
    shader.uniforms.uMode = transition.mode;
    shader.uniforms.uSpace = transition.space;
    shader.uniforms.uSweepRange = transition.range;
    shader.uniforms.uSweepDir = SWEEP_DIR;
    shader.uniforms.uEdgeColor = { value: edge };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDissolvePos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvDissolvePos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDissolvePos;
        uniform float uReveal;
        uniform float uMode;
        uniform mat4 uSpace;
        uniform vec3 uEdgeColor;
        ${DISSOLVE_NOISE}
        ${SWEEP}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float lvlS = lvlSweep((uSpace * vec4(vDissolvePos, 1.0)).xyz);
        float lvlQ = uMode > 0.5 ? 1.0 - uReveal : uReveal;
        // how far this fragment sits inside the surviving (or formed) side of the front
        float lvlLeft = uMode > 0.5 ? lvlS - lvlQ : lvlQ - lvlS;
        bool lvlMoving = uReveal > 0.001 && uReveal < 0.999;
        if (uReveal <= 0.001 || (lvlMoving && lvlLeft < 0.0)) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (lvlMoving) totalEmissiveRadiance += uEdgeColor * 3.5 * (1.0 - smoothstep(0.0, 0.035, lvlLeft));`,
      );
  };
  material.customProgramCacheKey = () => 'lvlup-sweep';
  return material;
}

const dustVertex = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uReveal;
  uniform float uMode;
  uniform float uTime;
  uniform float uScale;
  uniform float uSize;
  uniform vec3 uWind;
  varying float vAlpha;
  varying float vHeat;
  varying float vSpark;

  ${DISSOLVE_NOISE}
  ${SWEEP}

  void main() {
    float s = lvlSweep(position);
    float q = uMode > 0.5 ? 1.0 - uReveal : uReveal;
    vec3 p = position;
    float alpha = 0.0;
    float heat = 0.0;

    if (uMode > 0.5) {
      // snap: once the front has passed a speck, it lifts off and blows away, cooling to ash
      float gone = q - s;
      if (gone > 0.0) {
        float age = clamp(gone / 0.4, 0.0, 1.0);
        float ease = age * age;
        vec3 swirl = vec3(
          sin(p.y * 1.7 + uTime * 1.1 + aSeed.x * 6.2831),
          cos(p.z * 1.3 + uTime * 0.9),
          sin(p.x * 1.5 - uTime * 0.7 + aSeed.y * 6.2831)
        );
        p += uWind * ease * (3.0 + aSeed.x * 4.0) + swirl * ease * 1.1;
        p.y += ease * (0.5 + aSeed.y * 1.2);
        alpha = smoothstep(0.0, 0.03, gone) * (1.0 - age);
        heat = 1.0 - smoothstep(0.0, 0.3, age);
      }
    } else {
      // nanotech: specks stream in from the scatter and lock on as the front reaches them
      float t = smoothstep(s - 0.35, s, q);
      float settled = q - s;
      vec3 from = position + (aSeed - 0.5) * 5.5 - uWind * 2.5;
      p = mix(from, position, t * t * (3.0 - 2.0 * t));
      // gone again once the surface has formed under it
      alpha = t * (1.0 - smoothstep(0.0, 0.1, settled));
      heat = 0.4 + 0.6 * t;
    }

    vAlpha = alpha;
    vHeat = heat;
    vSpark = step(0.72, aSeed.z);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = alpha > 0.001 ? uSize * (0.5 + aSeed.y) * uScale / max(-mv.z, 0.1) : 0.0;
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uMode;
  varying float vAlpha;
  varying float vHeat;
  varying float vSpark;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float soft = 1.0 - smoothstep(0.1, 0.5, d);
    vec3 ash = vec3(0.34, 0.36, 0.4);
    vec3 ember = uAccent * 1.5 + vec3(0.15);
    vec3 snap = mix(ash, ember, vHeat * (0.25 + vSpark * 0.75));
    // below the bloom threshold except the brightest: the shape being built has to stay legible
    vec3 build = uAccent * (0.8 + vHeat * 1.5);
    gl_FragColor = vec4(uMode > 0.5 ? snap : build, vAlpha * soft * 0.85);
    #include <colorspace_fragment>
  }
`;

function surfaceArea(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): number {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
    b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrix);
    c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrix);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  return area;
}

/**
 * Samples the model's real surface — Blender geometry and code overlays alike —
 * into a cloud of specks, spread by area so big panels get their share. The
 * specks are the snap's ash and the build's nanotech in one Points object;
 * which one they are is the transition's mode.
 */
function addDust(ctx: Ctx, inner: THREE.Object3D) {
  inner.updateMatrixWorld(true);
  const toInner = inner.matrixWorld.clone().invert();

  const sources: { mesh: THREE.Mesh; matrix: THREE.Matrix4; area: number }[] = [];
  inner.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.noDust || !mesh.geometry.getAttribute('position')) return;
    const matrix = toInner.clone().multiply(mesh.matrixWorld);
    const area = surfaceArea(mesh.geometry, matrix);
    if (area > 1e-4) sources.push({ mesh, matrix, area });
  });
  const total = sources.reduce((sum, source) => sum + source.area, 0);
  if (!total) return;

  const count = ctx.dust.count;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const point = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  let written = 0;

  sources.forEach((source, k) => {
    const wanted = k === sources.length - 1 ? count - written : Math.round((count * source.area) / total);
    const share = Math.min(count - written, wanted);
    if (share <= 0) return;
    const sampler = new MeshSurfaceSampler(source.mesh).build();
    for (let i = 0; i < share; i++) {
      sampler.sample(point);
      point.applyMatrix4(source.matrix);
      positions[written * 3] = point.x;
      positions[written * 3 + 1] = point.y;
      positions[written * 3 + 2] = point.z;
      seeds[written * 3] = Math.random();
      seeds[written * 3 + 1] = Math.random();
      seeds[written * 3 + 2] = Math.random();
      const along = point.dot(SWEEP_DIR.value);
      if (along < min) min = along;
      if (along > max) max = along;
      written++;
    }
  });

  ctx.transition.range.value.set(min, max);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geometry.setDrawRange(0, written);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uReveal: ctx.transition.reveal,
      uMode: ctx.transition.mode,
      uSweepRange: ctx.transition.range,
      uSweepDir: SWEEP_DIR,
      uTime: ctx.dust.time,
      uScale: ctx.dust.scale,
      uSize: { value: 0.034 },
      uWind: { value: WIND },
      uAccent: { value: ctx.palette.accent },
    },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    // writes depth: without it the lens pass read every speck as far background and
    // blurred the cloud into a glowing blob; specks are too small for sort order to show
    depthWrite: true,
    blending: THREE.AdditiveBlending,
  });

  const dust = new THREE.Points(geometry, material);
  // positions move in the shader, so CPU bounds would cull specks that are on screen
  dust.frustumCulled = false;
  dust.userData.noDust = true;
  inner.add(dust);
}

type Surface = {
  /** Smudges, fingerprints and hairline scratches, as a roughness map. */
  wear: THREE.Texture;
  shadow: THREE.Texture;
};

type Ctx = {
  palette: Palette;
  surface: Surface;
  transition: Transition;
  dust: DustShared;
  redraws: (() => void)[];
  state: { disposed: boolean };
  mat: <T extends THREE.Material>(material: T) => T;
  add: (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x?: number,
    y?: number,
    z?: number,
  ) => THREE.Mesh;
};

function context(
  palette: Palette,
  surface: Surface,
  redraws: (() => void)[],
  state: { disposed: boolean },
  dust: DustShared,
): Ctx {
  const transition: Transition = {
    reveal: { value: 0 },
    mode: { value: 0 },
    space: { value: new THREE.Matrix4() },
    range: { value: new THREE.Vector2(-3, 3) },
  };
  return {
    palette,
    surface,
    transition,
    dust,
    redraws,
    state,
    mat: (material) => dissolve(material, transition, palette.accent),
    add(parent, geometry, material, x = 0, y = 0, z = 0) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    },
  };
}

function wrap(
  ctx: Ctx,
  inner: THREE.Group,
  baked: { rx: number; ry: number; rz?: number; k: number },
  update: (elapsed: number) => void = () => {},
): HeroModel {
  // YXZ gives Ry·Rx·Rz — the order formations.ts bakes into the voxels
  inner.rotation.set(baked.rx, baked.ry, baked.rz ?? 0, 'YXZ');
  inner.scale.setScalar(baked.k);
  const root = new THREE.Group();
  root.add(inner);
  root.visible = false;
  return {
    root,
    transition: ctx.transition,
    ready: false,
    update(elapsed) {
      // last frame's matrix: a frame of lag in the sweep is invisible
      ctx.transition.space.value.copy(inner.matrixWorld).invert();
      update(elapsed);
    },
  };
}

// --- loading --------------------------------------------------------------------

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/**
 * What glTF has no field for, keyed by the material names in build_models.py:
 * how much of the studio each surface reflects, and where wear breaks up the
 * roughness. Wear is declared per channel because on some surfaces (the pad's
 * body) it read as grey stone in the base layer and only belongs in the coat.
 */
const TUNING: Record<
  string,
  { env?: number; specular?: number; tint?: number; wear?: 'base' | 'coat' | 'both'; depthWrite?: boolean }
> = {
  shell: { env: 0.45, wear: 'coat' },
  trim: { env: 0.6, wear: 'both' },
  // baked occlusion lets the gold take less studio before it reads as polished
  gold: { env: 0.3, wear: 'both' },
  stone: { env: 0.4, specular: 0.5, wear: 'both' },
  glass: { env: 0.35, wear: 'both', depthWrite: false },
  base: { wear: 'base' },
  pinShell: { env: 0.4, specular: 0.4, wear: 'both' },
  // dimmed: a near-white disc under the key light bloomed over the whole head
  pinFace: { env: 0.15, tint: 0.7 },
  ground: { env: 0.5, wear: 'base' },
};

function tune(ctx: Ctx, material: THREE.Material): THREE.Material {
  const settings = TUNING[material.name.replace(/\.\d+$/, '')];
  const physical = material as THREE.MeshPhysicalMaterial;

  if (settings?.env !== undefined) physical.envMapIntensity = settings.env;
  if (settings?.tint !== undefined) physical.color.multiplyScalar(settings.tint);
  if (settings?.specular !== undefined && physical.isMeshPhysicalMaterial) physical.specularIntensity = settings.specular;
  if (settings?.wear === 'base' || settings?.wear === 'both') physical.roughnessMap = ctx.surface.wear;
  if ((settings?.wear === 'coat' || settings?.wear === 'both') && physical.isMeshPhysicalMaterial) {
    physical.clearcoatRoughnessMap = ctx.surface.wear;
  }
  if (settings?.depthWrite === false) material.depthWrite = false;

  return ctx.mat(material);
}

function load(ctx: Ctx, name: string, onLoad: (scene: THREE.Group) => void) {
  loader.load(
    `/models/${name}.glb`,
    (gltf) => {
      if (ctx.state.disposed) {
        disposeTree(gltf.scene);
        return;
      }
      const tuned = new Set<THREE.Material>();
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (tuned.has(material)) continue;
          tuned.add(material);
          tune(ctx, material);
        }
      });
      onLoad(gltf.scene);
      // every builder parents the scene into its model group before this runs
      if (gltf.scene.parent) addDust(ctx, gltf.scene.parent);
    },
    undefined,
    () => {
      // left unready: the chapter keeps its voxel formation
    },
  );
}

// --- textures -------------------------------------------------------------------

/**
 * Wear as a roughness map. Grey sits at 0.75, so a material using it declares a
 * roughness about a third higher than it reads; the marks push it either way.
 * Tiled across the baked models' UV islands it lands at a different scale on
 * every part, which is how real wear looks anyway.
 */
function surfaceTextures(): Surface {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');

  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  if (g) {
    g.fillStyle = 'rgb(191,191,191)';
    g.fillRect(0, 0, size, size);

    for (let i = 0; i < 160; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 20 + rand() * 90;
      const blotch = g.createRadialGradient(x, y, 0, x, y, r);
      blotch.addColorStop(0, rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
      blotch.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = blotch;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const turn = rand() * Math.PI;
      for (let k = 0; k < 14; k++) {
        g.beginPath();
        g.ellipse(cx, cy, 6 + k * 2.4, 4 + k * 1.8, turn, 0, Math.PI * 1.6);
        g.stroke();
      }
    }

    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 110; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const angle = rand() * Math.PI * 2;
      const length = 8 + rand() * 70;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      g.stroke();
    }
  }

  const wear = new THREE.CanvasTexture(canvas);
  wear.wrapS = wear.wrapT = THREE.RepeatWrapping;
  wear.repeat.set(3, 3);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const s = shadowCanvas.getContext('2d');
  if (s) {
    const pool = s.createRadialGradient(128, 128, 0, 128, 128, 128);
    pool.addColorStop(0, 'rgba(0,0,0,0.9)');
    pool.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = pool;
    s.fillRect(0, 0, 256, 256);
  }
  const shadow = new THREE.CanvasTexture(shadowCanvas);

  return { wear, shadow };
}

const cssFont = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** A canvas-backed texture, repainted once web fonts arrive so its type is not the fallback face. */
function canvasTexture(
  ctx: Ctx,
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const paint = () => {
    if (!g) return;
    g.clearRect(0, 0, width, height);
    draw(g, width, height);
    texture.needsUpdate = true;
  };
  paint();
  ctx.redraws.push(paint);
  return texture;
}

// --- 1. controller ------------------------------------------------------------

function controller(ctx: Ctx): HeroModel {
  const inner = new THREE.Group();
  const model = wrap(ctx, inner, { rx: -0.42, ry: -0.5, rz: 0.1, k: 0.8 });
  load(ctx, 'controller', (scene) => {
    inner.add(scene);
    model.ready = true;
  });
  return model;
}

// --- 2. bays --------------------------------------------------------------------

type ScreenKind = 'race' | 'pitch' | 'fight' | 'space' | 'start';

/** Made-up gameplay for each screen: generic, and nobody's artwork. */
function screenTexture(ctx: Ctx, kind: ScreenKind): THREE.CanvasTexture {
  const accent = `#${ctx.palette.accent.getHexString()}`;
  const paper = '#f5f7fa';

  return canvasTexture(ctx, 512, 288, (g, w, h) => {
    const display = cssFont('--font-chakra', 'sans-serif');
    const mono = cssFont('--font-geist-mono', 'monospace');
    g.textBaseline = 'alphabetic';

    if (kind === 'race') {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b1d3a');
      sky.addColorStop(0.5, '#1f5596');
      sky.addColorStop(0.52, '#07090d');
      sky.addColorStop(1, '#101318');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a2f37';
      g.beginPath();
      g.moveTo(w * 0.47, h * 0.52);
      g.lineTo(w * 0.53, h * 0.52);
      g.lineTo(w * 0.95, h);
      g.lineTo(w * 0.05, h);
      g.closePath();
      g.fill();
      g.strokeStyle = paper;
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const t = 0.55 + i * 0.08;
        g.beginPath();
        g.moveTo(w / 2, h * t);
        g.lineTo(w / 2, h * (t + 0.04));
        g.stroke();
      }
      g.strokeStyle = accent;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(w * 0.47, h * 0.52);
      g.lineTo(w * 0.05, h);
      g.moveTo(w * 0.53, h * 0.52);
      g.lineTo(w * 0.95, h);
      g.stroke();
      g.fillStyle = paper;
      g.textAlign = 'right';
      g.font = `600 44px ${display}`;
      g.fillText('182', w - 76, h - 22);
      g.font = `500 16px ${mono}`;
      g.fillText('KM/H', w - 20, h - 26);
      g.textAlign = 'left';
      g.fillText('LAP 2/3', 20, 32);
      g.fillText('POS 3', 20, 56);
    } else if (kind === 'pitch') {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#1a6030' : '#1d6b35';
        g.fillRect((i * w) / 8, 0, w / 8 + 1, h);
      }
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 3;
      g.strokeRect(24, 24, w - 48, h - 48);
      g.beginPath();
      g.moveTo(w / 2, 24);
      g.lineTo(w / 2, h - 24);
      g.stroke();
      g.beginPath();
      g.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
      g.stroke();
      g.strokeRect(24, h / 2 - 60, 60, 120);
      g.strokeRect(w - 84, h / 2 - 60, 60, 120);
      [
        [140, 90],
        [180, 190],
        [230, 140],
        [300, 100],
        [340, 200],
        [400, 150],
        [260, 210],
        [120, 150],
      ].forEach(([x, y], i) => {
        g.fillStyle = i % 2 ? accent : paper;
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.fill();
      });
      g.fillStyle = 'rgba(5,6,8,0.88)';
      g.fillRect(34, 34, 176, 30);
      g.fillStyle = paper;
      g.textAlign = 'left';
      g.font = `500 16px ${mono}`;
      g.fillText('LVL 2 - 1 PUN', 44, 55);
      g.fillStyle = accent;
      g.fillText("67'", 176, 55);
    } else if (kind === 'fight') {
      const dusk = g.createLinearGradient(0, 0, 0, h);
      dusk.addColorStop(0, '#2a0f2e');
      dusk.addColorStop(0.65, '#d9643a');
      dusk.addColorStop(0.66, '#1a1013');
      dusk.addColorStop(1, '#0b0709');
      g.fillStyle = dusk;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(20, 20, 200, 18);
      g.fillRect(w - 220, 20, 200, 18);
      g.fillStyle = '#f5c542';
      g.fillRect(20, 20, 160, 18);
      g.fillRect(w - 220 + 80, 20, 120, 18);
      g.fillStyle = '#0b0d11';
      g.fillRect(150, 140, 46, 120);
      g.fillRect(126, 170, 30, 16);
      g.fillRect(318, 150, 46, 110);
      g.fillRect(356, 176, 34, 16);
      g.fillStyle = paper;
      g.textAlign = 'center';
      g.font = `600 44px ${display}`;
      g.fillText('ROUND 2', w / 2, 110);
      g.font = `500 16px ${mono}`;
      g.fillText('99', w / 2, 36);
    } else if (kind === 'space') {
      g.fillStyle = '#04060a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = i % 7 === 0 ? accent : 'rgba(245,247,250,0.7)';
        g.fillRect((i * 97) % w, (i * 57) % h, 2, 2);
      }
      g.fillStyle = '#34d399';
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) g.fillRect(96 + c * 42, 40 + r * 30, 22, 14);
      }
      g.fillStyle = accent;
      g.beginPath();
      g.moveTo(w / 2, h - 60);
      g.lineTo(w / 2 + 22, h - 24);
      g.lineTo(w / 2 - 22, h - 24);
      g.closePath();
      g.fill();
      g.fillRect(w / 2 - 1, h - 130, 3, 50);
      g.fillStyle = paper;
      g.textAlign = 'left';
      g.font = `500 16px ${mono}`;
      g.fillText('SCORE 004210', 16, h - 12);
    } else {
      const glowFill = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6);
      glowFill.addColorStop(0, '#0d2c50');
      glowFill.addColorStop(1, '#050608');
      g.fillStyle = glowFill;
      g.fillRect(0, 0, w, h);
      g.font = `600 84px ${display}`;
      const lvl = g.measureText('LVL').width;
      const up = g.measureText('UP').width;
      const left = w / 2 - (lvl + up) / 2;
      g.textAlign = 'left';
      g.fillStyle = paper;
      g.fillText('LVL', left, h / 2 + 18);
      g.fillStyle = accent;
      g.fillText('UP', left + lvl, h / 2 + 18);
      g.textAlign = 'center';
      g.fillStyle = paper;
      g.font = `500 18px ${mono}`;
      g.fillText('PRESS START', w / 2, h / 2 + 64);
    }
  });
}

/** Mirrors SCREENS in assets-src/build_models.py: the frames come from Blender, the pictures from here. */
const SCREENS: { cx: number; cy: number; w: number; h: number; kind: ScreenKind }[] = [
  { cx: -2.75, cy: 1.0, w: 2.4, h: 1.45, kind: 'race' },
  { cx: 0, cy: 1.25, w: 2.8, h: 1.7, kind: 'pitch' },
  { cx: 2.75, cy: 1.0, w: 2.4, h: 1.45, kind: 'fight' },
  { cx: -1.4, cy: -1.25, w: 2.4, h: 1.45, kind: 'space' },
  { cx: 1.4, cy: -1.25, w: 2.4, h: 1.45, kind: 'start' },
];

function bays(ctx: Ctx): HeroModel {
  const inner = new THREE.Group();

  for (const screen of SCREENS) {
    const holder = new THREE.Group();
    holder.position.set(screen.cx, screen.cy, -Math.abs(screen.cx) * 0.3);
    holder.rotation.y = -screen.cx * 0.14;
    inner.add(holder);
    // unlit: a screen makes its own light, so scene lights and studio reflections
    // only ever greyed the picture out
    const panel = ctx.mat(new THREE.MeshBasicMaterial({ map: screenTexture(ctx, screen.kind) }));
    ctx.add(holder, new THREE.PlaneGeometry(screen.w, screen.h), panel, 0, 0, 0.047);
  }

  const model = wrap(ctx, inner, { rx: 0.12, ry: -0.42, k: 0.72 });
  load(ctx, 'bays', (scene) => {
    inner.add(scene);
    model.ready = true;
  });
  return model;
}

// --- 4. rates -------------------------------------------------------------------

function ratePillars(ctx: Ctx, amounts: number[]): HeroModel {
  const inner = new THREE.Group();
  const sorted = [...amounts].sort((a, b) => a - b);
  const tallest = sorted[sorted.length - 1] || 1;
  // the same heights build_models.py extrudes, so each label sits on its pillar
  const heights = sorted.map((amount) => (amount / tallest) * 3.4);
  const gap = 1.45;
  const floor = -2.3;

  heights.forEach((height, i) => {
    const x = (i - (heights.length - 1) / 2) * gap;
    const label = canvasTexture(ctx, 256, 128, (g, w, h) => {
      g.textAlign = 'center';
      g.fillStyle = '#f5f7fa';
      g.font = `600 64px ${cssFont('--font-chakra', 'sans-serif')}`;
      g.fillText(`₹${sorted[i]}`, w / 2, h / 2 + 10);
      g.fillStyle = '#a7b0bb';
      g.font = `500 20px ${cssFont('--font-geist-mono', 'monospace')}`;
      g.fillText('PER HOUR', w / 2, h - 14);
    });
    // writes depth where the glyphs are: without it the lens pass read the label as far
    // background and blurred the prices
    const labelMaterial = ctx.mat(new THREE.MeshBasicMaterial({ map: label, transparent: true, alphaTest: 0.1 }));
    ctx.add(inner, new THREE.PlaneGeometry(1.3, 0.65), labelMaterial, x, floor + height + 0.6, 0.2);
  });

  let arrow: THREE.Object3D | null = null;
  let arrowY = 0;

  const model = wrap(ctx, inner, { rx: 0.3, ry: -0.62, k: 0.95 }, (t) => {
    if (!arrow) return;
    arrow.position.y = arrowY + Math.sin(t * 2) * 0.12;
    arrow.rotation.y = t * 1.2;
  });
  load(ctx, 'rates', (scene) => {
    arrow = scene.getObjectByName('arrow') ?? null;
    arrowY = arrow?.position.y ?? 0;
    inner.add(scene);
    model.ready = true;
  });
  return model;
}

// --- 5. trophy ------------------------------------------------------------------

function trophy(ctx: Ctx): HeroModel {
  const inner = new THREE.Group();

  const plate = canvasTexture(ctx, 512, 96, (g, w, h) => {
    const brass = g.createLinearGradient(0, 0, w, h);
    brass.addColorStop(0, '#8a6a2e');
    brass.addColorStop(0.5, '#e0b25c');
    brass.addColorStop(1, '#8a6a2e');
    g.fillStyle = brass;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1206';
    g.textAlign = 'center';
    g.font = `600 34px ${cssFont('--font-chakra', 'sans-serif')}`;
    g.fillText('SATURDAY BRACKET', w / 2, 44);
    g.font = `500 20px ${cssFont('--font-geist-mono', 'monospace')}`;
    g.fillText('LVL UP · KALYANI NAGAR', w / 2, 78);
  });
  const plateMaterial = ctx.mat(new THREE.MeshStandardMaterial({ map: plate, metalness: 0.6, roughness: 0.35 }));
  ctx.add(inner, new THREE.PlaneGeometry(1.7, 0.32), plateMaterial, 0, -2.08, 1.152);

  const model = wrap(ctx, inner, { rx: 0.2, ry: 0.3, k: 0.8 });
  load(ctx, 'trophy', (scene) => {
    inner.add(scene);
    model.ready = true;
  });
  return model;
}

// --- 6. pin ---------------------------------------------------------------------

/** A soft pool under something that never touches the ground: the pin bobs, so its shadow cannot be baked. */
function contactShadow(ctx: Ctx, parent: THREE.Object3D, y: number, size: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);
  const material = ctx.mat(
    new THREE.MeshBasicMaterial({
      map: ctx.surface.shadow,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  const mesh = ctx.add(parent, geometry, material, 0, y, 0);
  mesh.userData.noDust = true;
  return mesh;
}

function pin(ctx: Ctx): HeroModel {
  const inner = new THREE.Group();
  const { palette } = ctx;

  const streets = canvasTexture(ctx, 512, 512, (g, w, h) => {
    g.strokeStyle = `#${palette.accent.getHexString()}`;
    g.globalAlpha = 0.45;
    g.lineWidth = 3;
    for (let i = 1; i < 8; i++) {
      g.beginPath();
      g.moveTo(0, (i * h) / 8 + (i % 2) * 14);
      g.lineTo(w, (i * h) / 8 - (i % 3) * 10);
      g.stroke();
      g.beginPath();
      g.moveTo((i * w) / 8 - (i % 2) * 12, 0);
      g.lineTo((i * w) / 8 + (i % 3) * 8, h);
      g.stroke();
    }
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, h * 0.85);
    g.lineTo(w, h * 0.2);
    g.stroke();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  });
  const map = new THREE.PlaneGeometry(7.2, 7.2);
  map.rotateX(-Math.PI / 2);
  ctx.add(inner, map, ctx.mat(new THREE.MeshBasicMaterial({ map: streets, transparent: true, depthWrite: false })), 0, -1.79, 0).userData.noDust = true;

  const shadow = contactShadow(ctx, inner, -1.795, 2.4, 0.8);

  const ripples = [0, 1, 2].map(() => {
    const geometry = new THREE.TorusGeometry(1, 0.03, 8, 128);
    geometry.rotateX(Math.PI / 2);
    const material = ctx.mat(
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: palette.accent,
        emissiveIntensity: 1.4,
        transparent: true,
        depthWrite: false,
      }),
    );
    const ring = ctx.add(inner, geometry, material, 0, -1.76, 0);
    ring.userData.noDust = true;
    return ring;
  });

  let floater: THREE.Object3D | null = null;

  const model = wrap(ctx, inner, { rx: 0.32, ry: -0.35, k: 0.85 }, (t) => {
    const bob = Math.sin(t * 1.6) * 0.12;
    if (floater) floater.position.y = bob;
    // the shadow tightens as the pin dips toward the ground
    shadow.scale.setScalar(1 - bob * 0.9);
    ripples.forEach((ripple, i) => {
      const phase = (t * 0.45 + i / 3) % 1;
      ripple.scale.setScalar(0.5 + phase * 3);
      (ripple.material as THREE.MeshStandardMaterial).opacity = (1 - phase) * 0.9;
    });
  });
  load(ctx, 'pin', (scene) => {
    floater = scene.getObjectByName('pin') ?? null;
    inner.add(scene);
    model.ready = true;
  });
  return model;
}

// --- kit ------------------------------------------------------------------------

function disposeTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** One model per formation index; the tunnel (2) stays pure voxels. */
export function createModels(palette: Palette, options: { rates: number[]; quality: 'high' | 'low' }) {
  const redraws: (() => void)[] = [];
  const state = { disposed: false };
  const surface = surfaceTextures();
  const dust: DustShared = {
    time: { value: 0 },
    scale: { value: 1000 },
    count: options.quality === 'high' ? 14000 : 5000,
  };
  const build = () => context(palette, surface, redraws, state, dust);

  const models: (HeroModel | null)[] = new Array(FORMATION_COUNT).fill(null);
  models[0] = controller(build());
  models[1] = bays(build());
  models[3] = ratePillars(build(), options.rates);
  models[4] = trophy(build());
  models[5] = pin(build());

  document.fonts?.ready.then(() => {
    if (!state.disposed) redraws.forEach((redraw) => redraw());
  });

  return {
    models,
    /** Per frame: animation time, and pixels per world unit at distance 1 for sizing the specks. */
    frame(time: number, scale: number) {
      dust.time.value = time;
      dust.scale.value = scale;
    },
    dispose() {
      state.disposed = true;
      models.forEach((model) => model && disposeTree(model.root));
      surface.wear.dispose();
      surface.shadow.dispose();
    },
  };
}
