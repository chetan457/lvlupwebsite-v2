import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * The camera, as opposed to the scene: focus, and the finish a real lens adds.
 *
 * Three's stock BokehPass and SAO/GTAO passes re-render the scene with an
 * override material to get depth and normals. The voxels are positioned in
 * their own vertex shader, so under an override they all collapse to one cube
 * at the origin. LensPass sidesteps that: it renders the scene once, normally,
 * into a target that keeps the real depth buffer, and blurs from that.
 */

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const depthOfField = /* glsl */ `
  #include <packing>

  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform float uFocus;
  uniform float uRange;
  uniform float uSharp;
  uniform float uMaxBlur;
  varying vec2 vUv;

  const int TAPS = 20;

  float sceneDepth(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
  }

  /** Circle of confusion in pixels. Everything within uSharp of the focus stays crisp, so a whole model (and its labels) reads, and only the space around it softens. */
  float blurAt(float depth) {
    return clamp((abs(depth - uFocus) - uSharp) / uRange, 0.0, 1.0) * uMaxBlur;
  }

  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    float coc = blurAt(sceneDepth(vUv));
    if (coc < 0.5) {
      gl_FragColor = base;
      return;
    }

    vec3 sum = base.rgb;
    float total = 1.0;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float r = sqrt(fi + 0.5) / sqrt(float(TAPS));
      float a = fi * 2.39996323;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * coc / uResolution;
      // a sharp sample must not smear into the blurred background behind it
      float weight = clamp(blurAt(sceneDepth(uv)) / max(r * coc, 0.001), 0.0, 1.0);
      sum += texture2D(tDiffuse, uv).rgb * weight;
      total += weight;
    }
    gl_FragColor = vec4(sum / total, base.a);
  }
`;

export class LensPass extends Pass {
  /** Distance from the camera, in world units, that is perfectly sharp. */
  focus = 12;
  /** Depth either side of the focus, in world units, that stays fully sharp. */
  sharp = 3.5;
  /** How quickly blur builds beyond the sharp band. */
  range = 5;
  /** Largest blur radius, in drawing-buffer pixels. */
  maxBlur = 5;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uFocus: { value: 12 },
        uRange: { value: 5 },
        uSharp: { value: 3.5 },
        uMaxBlur: { value: 5 },
      },
      vertexShader: quadVertex,
      fragmentShader: depthOfField,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number) {
    this.target.setSize(width, height);
    this.material.uniforms.uResolution.value.set(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    const uniforms = this.material.uniforms;
    uniforms.tDiffuse.value = this.target.texture;
    uniforms.tDepth.value = this.target.depthTexture;
    uniforms.uNear.value = this.camera.near;
    uniforms.uFar.value = this.camera.far;
    uniforms.uFocus.value = this.focus;
    uniforms.uRange.value = this.range;
    uniforms.uSharp.value = this.sharp;
    uniforms.uMaxBlur.value = this.maxBlur;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

/**
 * Runs last, on display-space colour: lens fringing towards the corners, a cool
 * shadow grade, a vignette and moving film grain. All of it small — the point is
 * that the frame stops looking computer-perfect, not that anyone notices a filter.
 */
export function createFinishPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec2 uResolution;
      varying vec2 vUv;

      void main() {
        vec2 centred = vUv - 0.5;
        float dist = length(centred);

        vec2 fringe = centred * dist * 0.006;
        vec3 color = vec3(
          texture2D(tDiffuse, vUv + fringe).r,
          texture2D(tDiffuse, vUv).g,
          texture2D(tDiffuse, vUv - fringe).b
        );

        // cool the shadows, leave highlights neutral, a touch of contrast
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(color, color * vec3(0.9, 0.98, 1.1), (1.0 - luma) * 0.4);
        color = clamp((color - 0.5) * 1.05 + 0.5, 0.0, 1.0);

        // (edges in order: smoothstep with edge0 > edge1 is undefined in GLSL)
        color *= mix(1.0, 1.0 - smoothstep(0.25, 0.9, dist), 0.38);

        float grain = fract(sin(dot(vUv * uResolution + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
        color += (grain - 0.5) * 0.045;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}
