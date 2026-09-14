"""
Resamples the studio HDRI for the site.

  Blender -b --factory-startup --python assets-src/build_env.py -- <source.hdr> <dest.hdr> <width>

Run by assets-src/build.mjs. Height is half the width (equirectangular).
"""

import sys

import bpy

source, destination, width = sys.argv[sys.argv.index('--') + 1:][:3]
width = int(width)

image = bpy.data.images.load(source)
image.scale(width, width // 2)
image.filepath_raw = destination
image.file_format = 'HDR'
image.save()
print(f'[lvlup] studio lighting {width}x{width // 2} -> {destination}', flush=True)
