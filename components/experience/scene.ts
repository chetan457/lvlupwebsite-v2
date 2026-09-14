import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

import { rates } from '@/content/pricing';
import { site } from '@/content/site';
import { bootDone, experience, sceneStatus } from '@/lib/experience-store';

import {
  buildFormations,
  FORMATION_COUNT,
  TUNNEL_INDEX,
  TUNNEL_Z_LEN,
  TUNNEL_Z_MIN,
  type Quality,
} from './formations';
import { createModels } from './models';
import { createFinishPass, LensPass } from './post';

/**
 * The whole 3D layer: one instanced voxel mesh, a star field and a floor grid,
 * rendered through bloom on capable machines.
 *
 * Plain TypeScript rather than a component. React mounts it once and calls the
 * returned dispose; everything per-frame happens here, reading scroll state
 * from the experience store, so no scroll event ever touches React.
 */

const N = FORMATION_COUNT;

const voxelVertex = /* glsl */ `
  attribute vec4 aF0;
  attribute vec4 aF1;
  attribute vec4 aF2;
  attribute vec4 aF3;
  attribute vec4 aF4;
  attribute vec4 aF5;
  attribute vec4 aRand;

  uniform float uProg;
  uniform float uTime;
  uniform float uFlow;
  uniform float uTilt;
  uniform vec3 uShift[${N}];
  uniform float uScale[${N}];
  uniform float uSpin[${N}];
  uniform float uHide[${N}];

  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vGlow;
  varying float vSeed;
  varying float vDepth;

  const float PI = 3.14159265;
  const int TUNNEL = ${TUNNEL_INDEX};
  const float Z_MIN = ${TUNNEL_Z_MIN.toFixed(1)};
  const float Z_LEN = ${TUNNEL_Z_LEN.toFixed(1)};

  mat3 rotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

  vec4 pick(int i) {
    if (i == 0) return aF0;
    if (i == 1) return aF1;
    if (i == 2) return aF2;
    if (i == 3) return aF3;
    if (i == 4) return aF4;
    return aF5;
  }

  vec3 place(int i, out float scale, out float glow) {
    vec4 f = pick(i);
    float debris = floor(f.w / 20.0);
    float packed = f.w - debris * 20.0;
    glow = floor(packed / 10.0);
    scale = packed - glow * 10.0;
    // a formation's own cubes shrink away while its real model dissolves in; debris keeps drifting
    if (debris < 0.5) scale *= 1.0 - uHide[i];
    vec3 p = f.xyz;

    if (i == TUNNEL) {
      // fly: slide every ring toward the camera and wrap it back to the far end
      p.z = mod(p.z - Z_MIN + uFlow, Z_LEN) + Z_MIN;
      float roll = uSpin[i];
      p.xy = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * p.xy;
      // shrink to nothing at both ends, so the wrap never pops
      // (smoothstep with edge0 > edge1 is undefined in GLSL, hence the 1.0 -)
      scale *= (1.0 - smoothstep(Z_MIN + Z_LEN - 5.0, Z_MIN + Z_LEN, p.z)) * smoothstep(Z_MIN, Z_MIN + 10.0, p.z);
      return p;
    }

    p = rotY(uSpin[i]) * rotX(uTilt) * p;
    scale *= uScale[i];
    return p * uScale[i] + uShift[i];
  }

  void main() {
    float seg = clamp(floor(uProg), 0.0, ${(N - 2).toFixed(1)});
    int a = int(seg);
    int b = a + 1;
    float f = clamp(uProg - seg, 0.0, 1.0);

    // each cube leaves at its own moment, so a formation dissolves rather than jumps
    float delay = aRand.x * 0.45;
    float t = smoothstep(delay, delay + 0.55, f);

    float sa; float ga; float sb; float gb;
    vec3 pa = place(a, sa, ga);
    vec3 pb = place(b, sb, gb);

    float arc = sin(t * PI);
    vec3 scatter = normalize(aRand.yzw - 0.5 + 0.0001);
    // the burst follows the formations' scale, or a phone gets lens-sized cubes mid-morph
    float spread = mix(uScale[a], uScale[b], t);
    vec3 p = mix(pa, pb, t) + scatter * arc * (1.5 + aRand.x * 2.5) * spread;
    p.y += sin(uTime * 0.9 + aRand.y * 6.2831) * 0.035;

    float scale = mix(sa, sb, t) * (1.0 - arc * 0.3);
    vGlow = mix(ga, gb, t);

    float spinA = a == TUNNEL ? 0.0 : uSpin[a];
    float spinB = b == TUNNEL ? 0.0 : uSpin[b];
    float tumble = arc * (aRand.z - 0.5) * 9.0;
    mat3 orient = rotY(mix(spinA, spinB, t) + tumble) * rotX(uTilt + tumble * 0.6);

    vNormal = normalize(mat3(modelMatrix) * (orient * normal));
    vec4 world = modelMatrix * vec4(p + orient * (position * scale), 1.0);
    vWorld = world.xyz;
    vSeed = aRand.y;

    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const voxelFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uAccent;
  uniform vec3 uFog;
  uniform float uTime;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vGlow;
  varying float vSeed;
  varying float vDepth;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);

    float key = max(dot(n, normalize(vec3(-0.45, 0.8, 0.55))), 0.0);
    float fill = max(dot(n, normalize(vec3(0.7, -0.2, 0.4))), 0.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    vec3 color = uBase * (0.35 + key * 0.9 + fill * 0.25) + uAccent * (rim * 0.55 + fill * 0.1);

    float pulse = 0.85 + 0.15 * sin(uTime * 2.4 + vSeed * 40.0);
    vec3 lit = uAccent * 2.2 * pulse + vec3(0.18);
    color = mix(color, lit, vGlow);

    color = mix(color, uFog, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const floorVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const floorFragment = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uMove;
  uniform float uStrength;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec2 cell = vUv * 40.0;
    cell.y += uMove;
    vec2 g = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float fade = (1.0 - smoothstep(8.0, 46.0, vDepth)) * smoothstep(0.0, 6.0, vDepth);
    gl_FragColor = vec4(uAccent * line, line * fade * uStrength);
    #include <colorspace_fragment>
  }
`;

/** Reads the live palette off the document, so the scene and the CSS never disagree. */
function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => {
    const colour = new THREE.Color();
    try {
      colour.setStyle(css.getPropertyValue(name).trim() || fallback);
    } catch {
      colour.setStyle(fallback);
    }
    return colour;
  };

  return {
    accent: pick('--color-accent', '#00a8ff'),
    base: pick('--color-dimmer', '#7d8590'),
    fog: pick('--color-room', '#050608'),
    lamp: pick('--color-lamp', '#0070d1'),
    paper: pick('--color-paper', '#f5f7fa'),
  };
}

type Pose = { x: number; y: number; z: number; lookY: number; fov: number };

/**
 * Where the camera stands for each formation, as offsets from the base framing.
 * Small on purpose: the copy owns the left of the frame and must never be
 * crowded. The tunnel's entry is empty because flight takes over there.
 */
const POSES: Pose[] = [
  { x: -0.6, y: -0.6, z: 0.8, lookY: 0.2, fov: 0 }, // controller: slightly low, so it reads heroic
  { x: 0.4, y: 1.1, z: 0.3, lookY: -0.3, fov: 0 }, // bays: from above, looking down over the couch
  { x: 0, y: 0, z: 0, lookY: 0, fov: 0 }, // tunnel
  { x: -0.7, y: -0.7, z: 0, lookY: 0.2, fov: 1 }, // rates: low, so the pillars tower
  { x: 0.6, y: 1.2, z: 0.2, lookY: -0.35, fov: 0 }, // trophy: over its shoulder, high enough to see the seat ring
  { x: -0.5, y: 1.6, z: 0.3, lookY: -0.4, fov: 0 }, // pin: high, like reading a map
];

const smooth01 = (t: number) => t * t * (3 - 2 * t);

export function createScene(host: HTMLElement, quality: Quality, onFirstFrame: () => void): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: quality === 'high',
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }

  console.info(`[lvlup] 3D scene: ${quality} quality`);

  // ?debug on the URL: a corner readout of what the scene is actually running
  const debug = new URLSearchParams(window.location.search).has('debug') ? document.createElement('div') : null;
  if (debug) {
    debug.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:200;padding:6px 8px;font:11px/1.4 ui-monospace,monospace;color:#9ec7e8;background:rgba(3,4,5,.85);border:1px solid #232d3a;pointer-events:none;white-space:pre';
    document.body.appendChild(debug);
  }
  let debugFrames = 0;
  let debugClock = 0;
  const palette = readPalette();
  let pixelRatio = Math.min(window.devicePixelRatio, quality === 'high' ? 1.75 : 1.25);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(palette.fog, 1);
  // filmic tone mapping so HDRI reflections on metal and glass roll off instead of clipping
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const gl = renderer.getContext();
  const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = gpuInfo ? String(gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL)).slice(0, 48) : 'hidden';

  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 140);
  camera.position.set(0, 0.3, 12);

  const disposables: { dispose: () => void }[] = [];

  // --- voxels ---------------------------------------------------------------
  const hourly = rates.filter((rate) => rate.unit === '/hr').map((rate) => rate.amount);
  const formations = buildFormations(quality, { rates: hourly, seats: site.seats });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = box.index;
  geometry.setAttribute('position', box.getAttribute('position'));
  geometry.setAttribute('normal', box.getAttribute('normal'));
  formations.data.forEach((array, i) => {
    geometry.setAttribute(`aF${i}`, new THREE.InstancedBufferAttribute(array, 4));
  });
  geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(formations.seeds, 4));
  geometry.instanceCount = formations.count;
  disposables.push(box, geometry);

  const shifts = Array.from({ length: N }, () => new THREE.Vector3());
  const scales = new Array<number>(N).fill(1);
  const spins = new Array<number>(N).fill(0);
  const hides = new Array<number>(N).fill(0);

  const uniforms = {
    uProg: { value: 0 },
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uTilt: { value: 0 },
    uShift: { value: shifts },
    uScale: { value: scales },
    uSpin: { value: spins },
    uHide: { value: hides },
    uBase: { value: palette.base },
    uAccent: { value: palette.accent },
    uFog: { value: palette.fog },
    uFogNear: { value: 13 },
    uFogFar: { value: 50 },
  };

  const voxelMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: voxelVertex,
    fragmentShader: voxelFragment,
  });
  disposables.push(voxelMaterial);

  const voxels = new THREE.Mesh(geometry, voxelMaterial);
  // instances are placed in the shader, so the CPU-side bounds mean nothing
  voxels.frustumCulled = false;
  scene.add(voxels);

  // --- stars ----------------------------------------------------------------
  const starCount = quality === 'high' ? 1400 : 600;
  const starPositions = new Float32Array(starCount * 3);
  const starRand = Math.random;
  for (let i = 0; i < starCount; i++) {
    const r = 30 + starRand() * 45;
    const theta = starRand() * Math.PI * 2;
    const phi = Math.acos(2 * starRand() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = -Math.abs(r * Math.sin(phi) * Math.sin(theta));
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: palette.paper,
    size: 0.11,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
  disposables.push(starGeometry, starMaterial);

  // --- floor ----------------------------------------------------------------
  const floorGeometry = new THREE.PlaneGeometry(120, 120);
  const floorUniforms = {
    uAccent: { value: palette.accent },
    uMove: { value: 0 },
    uStrength: { value: 0.3 },
  };
  const floorMaterial = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    vertexShader: floorVertex,
    fragmentShader: floorFragment,
    transparent: true,
    depthWrite: false,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.4;
  scene.add(floor);
  disposables.push(floorGeometry, floorMaterial);

  // --- lighting and real models ---------------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  // an instant procedural studio first; the HDRI replaces it on the high tier once it arrives
  let environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.85;

  let disposed = false;
  if (quality === 'high') {
    new HDRLoader().load('/env/studio.hdr', (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      const studio = pmrem.fromEquirectangular(texture).texture;
      texture.dispose();
      environment.dispose();
      environment = studio;
      scene.environment = studio;
    });
  }

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(-5, 7, 9);
  const rimLight = new THREE.PointLight(palette.accent, 35, 24);
  rimLight.position.set(7, 2.5, 3);
  const underLight = new THREE.PointLight(palette.lamp, 30, 18);
  underLight.position.set(2, -4, 4);
  scene.add(keyLight, rimLight, underLight);

  const kit = createModels(
    { accent: palette.accent, lamp: palette.lamp, paper: palette.paper },
    { rates: hourly, quality },
  );
  kit.models.forEach((model) => model && scene.add(model.root));

  // --- post -----------------------------------------------------------------
  // scene + depth of field → bloom → tone map to display colour → lens finish
  let composer: EffectComposer | null = null;
  let lens: LensPass | null = null;
  let finish: ReturnType<typeof createFinishPass> | null = null;
  if (quality === 'high') {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pixelRatio);
    lens = new LensPass(scene, camera);
    finish = createFinishPass();
    composer.addPass(lens);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 0.88));
    composer.addPass(new OutputPass());
    composer.addPass(finish);
  }

  // --- layout ---------------------------------------------------------------
  let baseFov = 35;
  let narrow = false;

  const layout = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const aspect = width / height;
    narrow = aspect < 1;

    camera.aspect = aspect;
    baseFov = narrow ? 52 : 35;

    for (let i = 0; i < N; i++) {
      if (i === TUNNEL_INDEX) {
        shifts[i].set(0, 0, 0);
        scales[i] = 1;
      } else if (narrow) {
        // phones: formation above the copy, which scrolls over a scrim
        shifts[i].set(0, 1.9, 0);
        scales[i] = 0.58;
      } else {
        // desktop: centred in the right half of the frame, away from the copy
        const drop = i === 3 ? -0.45 : 0.1;
        shifts[i].set(Math.min(4.3, 1.92 * aspect), drop, 0);
        scales[i] = Math.min(1, aspect / 1.78);
      }
    }

    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    finish?.uniforms.uResolution.value.copy(renderer.getDrawingBufferSize(new THREE.Vector2()));
    camera.updateProjectionMatrix();
  };
  layout();

  // --- input ----------------------------------------------------------------
  const onPointerMove = (event: PointerEvent) => {
    experience.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    experience.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  };

  // --- loop -----------------------------------------------------------------
  // Timer, not the deprecated Clock; connected to the document it also ignores time spent in a hidden tab
  const timer = new THREE.Timer();
  timer.connect(document);
  const look = new THREE.Vector3();
  const bufferSize = new THREE.Vector2();
  const shown = { progress: experience.progress, flow: experience.flow, px: 0, py: 0 };
  let elapsed = 0;
  let raf = 0;
  let first = true;
  let windowFrames = 0;
  let slowFrames = 0;
  let lensOff = false;
  let bootRamp = 0;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    timer.update();
    const rawDt = timer.getDelta();
    const dt = Math.min(rawDt, 0.05);
    elapsed += dt;

    const ease = (rate: number) => 1 - Math.exp(-dt * rate);
    shown.progress += (experience.progress - shown.progress) * ease(3.2);
    shown.flow += (experience.flow - shown.flow) * ease(4);
    shown.px += (experience.pointerX - shown.px) * ease(2.5);
    shown.py += (experience.pointerY - shown.py) * ease(2.5);

    const tunnelWeight = smooth01(Math.min(1, Math.max(0, 1 - Math.abs(shown.progress - TUNNEL_INDEX))));

    for (let i = 0; i < N; i++) {
      spins[i] = shown.px * 0.35 + Math.sin(elapsed * 0.25 + i) * 0.12;
    }
    spins[TUNNEL_INDEX] = elapsed * 0.08;
    // the trophy turns on its plinth
    spins[4] = elapsed * 0.35 + shown.px * 0.3;

    uniforms.uProg.value = shown.progress;
    uniforms.uTime.value = elapsed;
    uniforms.uFlow.value = shown.flow + elapsed * 0.9;
    uniforms.uTilt.value = shown.py * 0.12;

    // Snap and build: each chapter's model builds in as the scroll arrives and snaps away
    // as it leaves. The boot ramp makes the first arrival the page-load intro.
    bootRamp = bootDone.get() ? Math.min(1, bootRamp + dt / 2.4) : 0;
    kit.models.forEach((model, i) => {
      // a model that has not loaded (or failed to) leaves its chapter to the voxels
      const presence = model?.ready
        ? (1 - THREE.MathUtils.smoothstep(Math.abs(shown.progress - i), 0.04, 0.45)) * bootRamp
        : 0;
      // a loaded model owns its chapter outright: its cubes never show, its dust does the travelling
      hides[i] = model?.ready ? 1 : 0;
      if (!model) return;
      model.transition.reveal.value = presence;
      // ahead of the scroll it builds in; behind it, it snaps away (and both run backwards scrolling up)
      model.transition.mode.value = shown.progress > i ? 1 : 0;
      model.root.visible = presence > 0.001;
      if (!model.root.visible) return;
      model.root.position.copy(shifts[i]);
      model.root.scale.setScalar(scales[i]);
      model.root.rotation.set(shown.py * 0.12, spins[i], 0, 'YXZ');
      model.update(elapsed);
    });

    const calm = 1 - tunnelWeight;

    // each chapter frames its model from its own angle; the camera eases between them
    const from = Math.max(0, Math.min(N - 1, Math.floor(shown.progress)));
    const to = Math.min(N - 1, from + 1);
    const blend = smooth01(Math.min(1, Math.max(0, shown.progress - from)));
    const pose = (key: keyof Pose) => POSES[from][key] + (POSES[to][key] - POSES[from][key]) * blend;
    // phones get a fraction of the move, or the model leaves a narrow frame
    const reach = narrow ? 0.4 : 1;
    // a slow push-in once the scroll comes to rest on a chapter
    const settle = 1 - Math.min(1, Math.abs(shown.progress - Math.round(shown.progress)) * 4);

    camera.position.set(
      (shown.px * 0.8 + pose('x') * reach) * calm,
      0.3 + (pose('y') * reach - shown.py * 0.4) * calm,
      12 + (pose('z') * reach - settle * 0.35) * calm - tunnelWeight,
    );
    look.set(shown.px * 0.2 * tunnelWeight, pose('lookY') * reach * calm, -30 * tunnelWeight);
    camera.lookAt(look);

    if (lens && !lensOff) {
      const nearest = Math.max(0, Math.min(N - 1, Math.round(shown.progress)));
      lens.focus = nearest === TUNNEL_INDEX ? 16 : camera.position.distanceTo(shifts[nearest]);
      // the tunnel is all depth; blurring it just smears the flight
      lens.range = 6 + tunnelWeight * 20;
    }
    if (finish) finish.uniforms.uTime.value = elapsed;

    const fov = baseFov + tunnelWeight * (narrow ? 18 : 25) + pose('fov') * calm;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    renderer.getDrawingBufferSize(bufferSize);
    kit.frame(elapsed, bufferSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));

    floorUniforms.uMove.value = shown.flow * 0.35 + elapsed * 0.15;
    floorUniforms.uStrength.value = 0.3 * (1 - tunnelWeight * 0.8);
    stars.rotation.y = elapsed * 0.006;

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);

    if (first) {
      first = false;
      sceneStatus.set('ready');
      onFirstFrame();
    }

    if (debug) {
      debugFrames++;
      debugClock += rawDt;
      if (debugClock >= 1) {
        debug.textContent =
          `tier   ${quality}\nfps    ${Math.round(debugFrames / debugClock)}\npixels ${pixelRatio}x\n` +
          `bloom  ${composer ? 'on' : 'OFF'}\nfocus  ${lens && !lensOff ? 'on' : 'off'}\ngpu    ${gpuName}`;
        debugFrames = 0;
        debugClock = 0;
      }
    }

    // Shed cost only for sustained slowness, never for hitches. A model loading, its dust
    // being sampled or a shader compiling stalls a few frames on any machine; averaging
    // those used to strip bloom from fast GPUs seconds after load, leaving the page flat.
    if (rawDt < 0.25) {
      windowFrames++;
      if (rawDt > 1 / 40) slowFrames++;
    }
    // __lvlupKeepQuality: set by the screenshot harness, whose software renderer is always "slow"
    const keepQuality = (window as Window & { __lvlupKeepQuality?: boolean }).__lvlupKeepQuality === true;
    if (elapsed > 6 && windowFrames >= 150) {
      const slowShare = slowFrames / windowFrames;
      windowFrames = 0;
      slowFrames = 0;
      if (!keepQuality && slowShare > 0.6) {
        // one step at a time, cheapest loss first: sharpness, then focus blur, bloom last
        if (pixelRatio > 1) {
          pixelRatio = 1;
          renderer.setPixelRatio(1);
          composer?.setPixelRatio(1);
          layout();
          console.info('[lvlup] sustained low frame rate: rendering at 1x resolution');
        } else if (lens && !lensOff) {
          lensOff = true;
          lens.maxBlur = 0;
          console.info('[lvlup] sustained low frame rate: depth of field off');
        } else if (composer) {
          composer.dispose();
          lens?.dispose();
          finish?.dispose();
          composer = null;
          lens = null;
          finish = null;
          console.info('[lvlup] sustained low frame rate: bloom and lens effects off');
        }
      }
    }
  };

  const start = () => {
    if (raf) return;
    timer.update();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = () => (document.hidden ? stop() : start());

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', onVisibility);
  start();

  return () => {
    stop();
    timer.dispose();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', layout);
    document.removeEventListener('visibilitychange', onVisibility);

    disposed = true;
    kit.dispose();
    environment.dispose();
    pmrem.dispose();
    scene.clear();
    disposables.forEach((item) => item.dispose());
    composer?.dispose();
    lens?.dispose();
    finish?.dispose();
    debug?.remove();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
