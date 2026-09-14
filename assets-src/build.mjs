/**
 * npm run models [-- controller,trophy]
 *
 * 1. Reads the rate card and seat count straight from content/, so the rate
 *    pillars and the trophy's seat ring always match what the site says.
 * 2. Builds and bakes each model in Blender (assets-src/build_models.py).
 *    Models listed in STILLS (build_models.py) are also rendered as a still
 *    into public/stills/, for visitors who get no WebGL scene.
 * 3. Compresses each .glb with gltf-transform into public/models/: meshopt
 *    geometry and WebP textures. Palette, join and flatten stay off — the site
 *    finds materials and the animated nodes ("arrow", "pin") by name.
 *
 * Needs Blender 5.x. Set BLENDER if it is not in /Applications.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { rates } from '../content/pricing.ts';
import { site } from '../content/site.ts';

const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const RAW = 'assets-src/out';
const PUBLIC = 'public/models';
const only = process.argv[2] ?? '';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n${command} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const hourly = rates.filter((rate) => rate.unit === '/hr').map((rate) => rate.amount);

// The studio lighting: Poly Haven "Monochrome Studio 02" (CC0), fetched once, then
// resampled to 512x256. Reflections only ever sample it through a blurred PMREM,
// so the 1k original's 1.5MB bought nothing a visitor could see.
const HDRI_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/monochrome_studio_02_1k.hdr';
const HDRI_SRC = 'assets-src/src/monochrome_studio_02_1k.hdr';
if (!existsSync(HDRI_SRC)) {
  mkdirSync(dirname(HDRI_SRC), { recursive: true });
  const response = await fetch(HDRI_URL, { headers: { 'user-agent': 'lvlup-models-build' } });
  if (!response.ok) throw new Error(`HDRI download failed: ${response.status}`);
  writeFileSync(HDRI_SRC, Buffer.from(await response.arrayBuffer()));
}
mkdirSync('public/env', { recursive: true });
run(BLENDER, ['-b', '--factory-startup', '--python', 'assets-src/build_env.py', '--', HDRI_SRC, 'public/env/studio.hdr', '512']);

run(BLENDER, [
  '-b',
  '--factory-startup',
  '--python',
  'assets-src/build_models.py',
  '--',
  '--out',
  RAW,
  '--rates',
  hourly.join(','),
  '--seats',
  String(site.seats),
  '--stills',
  'public/stills',
  '--hdri',
  HDRI_SRC,
  ...(only ? ['--only', only] : []),
]);

mkdirSync(PUBLIC, { recursive: true });
const wanted = only ? only.split(',') : null;

for (const file of readdirSync(RAW).filter((name) => name.endsWith('.glb'))) {
  if (wanted && !wanted.includes(file.replace('.glb', ''))) continue;
  run('npx', [
    '-y',
    '@gltf-transform/cli@4.5.0',
    'optimize',
    join(RAW, file),
    join(PUBLIC, file),
    '--compress',
    'meshopt',
    '--texture-compress',
    'webp',
    '--texture-size',
    '1024',
    '--simplify',
    'false',
    '--palette',
    'false',
    '--join',
    'false',
    '--flatten',
    'false',
    '--instance',
    'false',
  ]);
}
