"""
Builds LvlUp v2's hero models in Blender and exports them as glTF.

Run through `npm run models` (assets-src/build.mjs), which passes the live rate
card and seat count from content/, then compresses the output into
public/models/. To run Blender directly:

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
    --python assets-src/build_models.py -- --out assets-src/out [--only trophy,pin]

Why Blender at all, when the site already draws these in code: two things a
browser cannot do in real time. Modifiers give real bevels and smooth curved
surfaces, and Cycles bakes ambient occlusion — the soft darkness in every
crease and under every part that rests on another — into one texture per
model. That texture ships inside the .glb as the glTF occlusion map, so
three.js applies it automatically. Lighting itself stays live in the browser
(the studio HDRI, bloom, the dissolve), which is why only occlusion is baked.

Coordinates: models are authored directly in three.js space (+Y up, camera
looking down -Z) and exported with export_yup disabled, so every position here
matches the overlay positions in components/experience/models.ts.
"""

import argparse
import math
import os
import sys
import traceback

import bpy
import numpy as np
from io_scene_gltf2.blender.com.material_helpers import create_settings_group, get_gltf_node_name

ACCENT = '#00a8ff'
LAMP = '#0070d1'

# --- setup ----------------------------------------------------------------------


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--only', default='')
    parser.add_argument('--rates', default='90,120,150')
    parser.add_argument('--seats', type=int, default=10)
    parser.add_argument('--samples', type=int, default=128)
    parser.add_argument('--size', type=int, default=1024)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--stills', default='')
    parser.add_argument('--hdri', default='')
    return parser.parse_args(argv)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
        scene.cycles.device = 'GPU'
    except Exception:
        scene.cycles.device = 'CPU'
    scene.world = bpy.data.worlds.new('world')


def srgb(hex_value):
    """Hex sRGB → linear RGBA, which is what Principled BSDF and glTF factors hold."""
    h = hex_value.lstrip('#')
    channels = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels], 1.0)


def material(name, color='#000000', metallic=0.0, roughness=0.5, coat=0.0, coat_roughness=0.03,
             emission=None, strength=0.0, alpha=1.0, double_sided=False):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(color)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = srgb(emission)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = not double_sided
    return m


def select_only(objects, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]


def finish(o, mat, loc=(0, 0, 0), rot=(0, 0, 0), smooth=35):
    """Material, transform and smoothing. rotation_mode ZYX composes like three.js's default XYZ."""
    o.data.materials.clear()
    o.data.materials.append(mat)
    o.rotation_mode = 'ZYX'
    o.rotation_euler = rot
    o.location = loc
    if smooth:
        select_only([o])
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth), keep_sharp_edges=True)
    return o


def bevel(o, width, segments):
    if width <= 0 or segments <= 0:
        return
    select_only([o])
    modifier = o.modifiers.new('bevel', 'BEVEL')
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = 'ANGLE'
    bpy.ops.object.modifier_apply(modifier=modifier.name)


# --- primitives, all in three.js axes -------------------------------------------


def box(name, w, h, d, radius, segments, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (w, h, d)
    bpy.ops.object.transform_apply(scale=True)
    bevel(o, min(radius, min(w, h, d) * 0.49), segments)
    return finish(o, mat, loc, rot)


def cylinder_z(name, r_bottom, r_top, depth, verts, mat, loc=(0, 0, 0), rot=(0, 0, 0), edge=0.0):
    """Axis along +Z, the way the site's buttons and discs face the camera."""
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r_bottom, radius2=r_top, depth=depth)
    o = bpy.context.active_object
    o.name = name
    bevel(o, edge, 2)
    return finish(o, mat, loc, rot)


def cylinder_y(name, radius, depth, verts, mat, loc=(0, 0, 0), edge=0.0):
    """Axis along +Y, upright."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, rotation=(-math.pi / 2, 0, 0))
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.transform_apply(rotation=True)
    bevel(o, edge, 2)
    return finish(o, mat, loc)


def torus(name, major, minor, mat, loc=(0, 0, 0), rot=(0, 0, 0), major_segments=96, minor_segments=16):
    """In the XY plane, like THREE.TorusGeometry."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=major_segments, minor_segments=minor_segments)
    o = bpy.context.active_object
    o.name = name
    return finish(o, mat, loc, rot, smooth=60)


def lathe(name, profile, mat, axis='Y', steps=128, loc=(0, 0, 0)):
    """Revolve (radius, height) pairs about an axis, like THREE.LatheGeometry."""
    if axis == 'Y':
        verts = [(r, y, 0) for r, y in profile]
    else:
        verts = [(r, 0, y) for r, y in profile]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [(i, i + 1) for i in range(len(verts) - 1)], [])
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    select_only([o])
    screw = o.modifiers.new('lathe', 'SCREW')
    screw.axis = axis
    screw.steps = steps
    screw.render_steps = steps
    screw.angle = math.tau
    screw.use_merge_vertices = True
    screw.merge_threshold = 1e-4
    screw.use_normal_calculate = True
    bpy.ops.object.modifier_apply(modifier=screw.name)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return finish(o, mat, loc, smooth=50)


def bezier_path(name, segments, dims='2D'):
    """segments: [(p0, c1, c2, p1)] of 2D points, closed."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = dims
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(segments) - 1)
    spline.use_cyclic_u = True
    for i, (p0, c1, _c2, _p1) in enumerate(segments):
        point = spline.bezier_points[i]
        point.handle_left_type = point.handle_right_type = 'FREE'
        point.co = (*p0, 0)
        point.handle_right = (*c1, 0)
        point.handle_left = (*segments[i - 1][2], 0)
    return curve


def curve_object(name, curve, mat, loc=(0, 0, 0), smooth=30):
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    select_only([o])
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    return finish(o, mat, loc, smooth=smooth)


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 6
    curve.resolution_u = 24
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = point.handle_right_type = 'AUTO'
    return curve_object(name, curve, mat, smooth=60)


def catmull_rom(points, samples):
    """Uniform Catmull-Rom through 2D points, matching THREE.SplineCurve."""
    out = []
    n = len(points)
    for s in range(samples + 1):
        t = s / samples * (n - 1)
        i = min(int(t), n - 2)
        f = t - i
        p0, p1, p2, p3 = (points[max(i - 1, 0)], points[i], points[i + 1], points[min(i + 2, n - 1)])
        f2, f3 = f * f, f * f * f
        out.append(tuple(
            0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2
                   + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3)
            for k in (0, 1)))
    return out


# --- models ---------------------------------------------------------------------


def build_controller(_args):
    m = {
        'shell': material('shell', '#0b0d11', roughness=0.55, coat=0.3, coat_roughness=0.4),
        'trim': material('trim', '#0c0f13', roughness=0.27, coat=1.0, coat_roughness=0.1),
        'rubber': material('rubber', '#14171c', roughness=0.85),
        'button': material('button', '#2a3039', roughness=0.3, coat=0.8, coat_roughness=0.1),
        'metal': material('metal', '#4a525e', metallic=0.9, roughness=0.28),
        'glow': material('glow', emission=ACCENT, strength=3.0),
        'seam': material('seam', '#030405', roughness=0.7),
    }

    def line(a, b):
        return (a, (a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3),
                (a[0] + 2 * (b[0] - a[0]) / 3, a[1] + 2 * (b[1] - a[1]) / 3), b)

    # the same silhouette as the code-built pad: right half, then mirrored back up
    outline = [
        line((0, 1.25), (1.35, 1.25)),
        ((1.35, 1.25), (2.2, 1.3), (2.75, 1.05), (2.95, 0.5)),
        ((2.95, 0.5), (3.2, -0.3), (3.3, -1.2), (3.05, -1.85)),
        ((3.05, -1.85), (2.85, -2.35), (2.25, -2.4), (1.95, -1.95)),
        ((1.95, -1.95), (1.7, -1.55), (1.45, -1.05), (1.0, -0.95)),
        ((1.0, -0.95), (0.6, -0.88), (0.3, -0.9), (0, -0.9)),
        ((0, -0.9), (-0.3, -0.9), (-0.6, -0.88), (-1.0, -0.95)),
        ((-1.0, -0.95), (-1.45, -1.05), (-1.7, -1.55), (-1.95, -1.95)),
        ((-1.95, -1.95), (-2.25, -2.4), (-2.85, -2.35), (-3.05, -1.85)),
        ((-3.05, -1.85), (-3.3, -1.2), (-3.2, -0.3), (-2.95, 0.5)),
        ((-2.95, 0.5), (-2.75, 1.05), (-2.2, 1.3), (-1.35, 1.25)),
        line((-1.35, 1.25), (0, 1.25)),
    ]

    parts = []
    shell_curve = bezier_path('body', outline)
    shell_curve.fill_mode = 'BOTH'
    shell_curve.extrude = 0.275
    shell_curve.bevel_depth = 0.25
    shell_curve.bevel_resolution = 8
    shell_curve.resolution_u = 32
    parts.append(curve_object('body', shell_curve, m['shell']))

    # the parting line where two halves of a moulded shell meet
    seam_curve = bezier_path('seam', outline)
    seam_curve.fill_mode = 'NONE'
    seam_curve.bevel_depth = 0.022
    seam_curve.bevel_resolution = 4
    seam_curve.offset = 0.24
    seam_curve.resolution_u = 32
    parts.append(curve_object('seam', seam_curve, m['seam'], smooth=60))

    front = 0.275 + 0.25
    parts.append(box('panel', 2.3, 1.0, 0.1, 0.045, 3, m['trim'], (0, 0.55, front - 0.02)))
    parts.append(box('lightbar', 2.0, 0.07, 0.06, 0.03, 2, m['glow'], (0, 1.14, front - 0.01)))
    parts.append(box('dpad_h', 0.66, 0.22, 0.16, 0.06, 3, m['button'], (-1.95, 0.35, front + 0.04)))
    parts.append(box('dpad_v', 0.66, 0.22, 0.16, 0.06, 3, m['button'], (-1.95, 0.35, front + 0.04), (0, 0, math.pi / 2)))

    for i, (dx, dy) in enumerate([(0, 0.38), (0, -0.38), (-0.38, 0), (0.38, 0)]):
        parts.append(cylinder_z(f'face{i}', 0.16, 0.16, 0.14, 40, m['button'], (1.95 + dx, 0.35 + dy, front + 0.05), edge=0.03))
        parts.append(torus(f'face_ring{i}', 0.16, 0.018, m['glow'], (1.95 + dx, 0.35 + dy, front + 0.12), major_segments=48, minor_segments=8))

    for i, x in enumerate([-1.0, 1.0]):
        parts.append(torus(f'well{i}', 0.4, 0.07, m['metal'], (x, -0.45, front - 0.02), major_segments=64))
        parts.append(cylinder_z(f'shaft{i}', 0.17, 0.15, 0.3, 24, m['rubber'], (x, -0.45, front + 0.12)))
        dish = [(0, 0.1), (0.3, 0.15), (0.36, 0.12), (0.36, 0.04), (0.3, 0), (0, 0)]
        parts.append(lathe(f'stick{i}', dish, m['rubber'], axis='Z', steps=48, loc=(x, -0.45, front + 0.24)))
        parts.append(torus(f'grip{i}', 0.3, 0.02, m['trim'], (x, -0.45, front + 0.37), major_segments=48, minor_segments=8))

    parts.append(cylinder_z('home', 0.13, 0.13, 0.06, 32, m['glow'], (0, -0.32, front + 0.01), edge=0.015))
    parts.append(box('pill_l', 0.26, 0.1, 0.07, 0.04, 2, m['button'], (-1.4, 0.95, front)))
    parts.append(box('pill_r', 0.26, 0.1, 0.07, 0.04, 2, m['button'], (1.4, 0.95, front)))

    for side in (-1, 1):
        parts.append(box(f'bumper{side}', 1.35, 0.3, 0.55, 0.13, 4, m['trim'], (side * 2.0, 1.35, -0.08), (0, 0, -side * 0.2)))
        parts.append(box(f'trigger{side}', 0.95, 0.55, 0.3, 0.12, 4, m['shell'], (side * 2.15, 1.35, -0.5), (0.5, 0, -side * 0.2)))

    return parts, []


SCREENS = [(-2.75, 1.0, 2.4, 1.45), (0, 1.25, 2.8, 1.7), (2.75, 1.0, 2.4, 1.45), (-1.4, -1.25, 2.4, 1.45), (1.4, -1.25, 2.4, 1.45)]


def build_bays(_args):
    m = {
        'frame': material('frame', '#0b0d11', metallic=0.7, roughness=0.35),
        'stand': material('stand', '#2b313a', metallic=0.85, roughness=0.3),
        'fabric': material('fabric', '#1c222b', roughness=0.95),
        'cushion': material('cushion', '#262d38', roughness=0.9),
        'glow': material('glow', emission=ACCENT, strength=2.5),
    }
    parts = []

    for i, (cx, cy, w, h) in enumerate(SCREENS):
        turn = -cx * 0.14
        origin = (cx, cy, -abs(cx) * 0.3)

        def at(x, y, z, turn=turn, origin=origin):
            return (origin[0] + x * math.cos(turn) + z * math.sin(turn), origin[1] + y,
                    origin[2] - x * math.sin(turn) + z * math.cos(turn))

        parts.append(box(f'frame{i}', w + 0.14, h + 0.14, 0.09, 0.035, 3, m['frame'], at(0, 0, 0), (0, turn, 0)))
        neck = 0.35 if i < 3 else 0.5
        parts.append(box(f'neck{i}', 0.14, neck, 0.08, 0.03, 2, m['stand'], at(0, -h / 2 - neck / 2, -0.03), (0, turn, 0)))
        parts.append(box(f'foot{i}', 0.9, 0.05, 0.42, 0.02, 2, m['stand'], at(0, -h / 2 - neck, 0.02), (0, turn, 0)))

    y, z = -2.9, 2.8
    parts.append(box('seat', 3.8, 0.42, 1.3, 0.1, 5, m['fabric'], (0, y + 0.26, z)))
    parts.append(box('back', 3.8, 0.95, 0.38, 0.14, 5, m['fabric'], (0, y + 0.75, z + 0.48)))
    for side in (-1, 1):
        parts.append(box(f'arm{side}', 0.36, 0.72, 1.3, 0.12, 5, m['fabric'], (side * 1.9, y + 0.6, z)))
        parts.append(box(f'cushion{side}', 1.62, 0.22, 0.95, 0.1, 5, m['cushion'], (side * 0.84, y + 0.56, z - 0.12)))
    parts.append(box('strip', 3.6, 0.03, 0.03, 0, 0, m['glow'], (0, y + 0.05, z + 0.66)))

    return parts, []


def build_rates(args):
    amounts = sorted(int(a) for a in args.rates.split(','))
    tallest = amounts[-1]
    heights = [a / tallest * 3.4 for a in amounts]
    gap, floor = 1.45, -2.3
    count = len(heights)

    glass = material('glass', '#9ec7e8', roughness=0.08, coat=1.0, coat_roughness=0.1, alpha=0.12, double_sided=True)
    cap = material('cap', emission=ACCENT, strength=1.6)
    base = material('base', '#12161c', metallic=0.8, roughness=0.45, coat=0.5, coat_roughness=0.2)

    parts = []
    for i, height in enumerate(heights):
        x = (i - (count - 1) / 2) * gap
        core = material(f'core{i}', '#06121e', roughness=0.4, emission=ACCENT,
                        strength=0.25 + 0.55 * (i / max(1, count - 1)))
        parts.append(box(f'core{i}', 0.46, height - 0.16, 0.46, 0.05, 3, core, (x, floor + height / 2 - 0.02, 0)))
        parts.append(box(f'glass{i}', 0.9, height, 0.9, 0.08, 4, glass, (x, floor + height / 2, 0)))
        parts.append(box(f'cap{i}', 0.98, 0.1, 0.98, 0.04, 3, cap, (x, floor + height + 0.05, 0)))

    parts.append(box('base', 5.4, 0.2, 2.2, 0.07, 4, base, (0, floor - 0.1, 0)))
    parts.append(box('strip', 5.2, 0.025, 0.025, 0, 0, cap, (0, floor - 0.02, 1.1)))

    chevron = bpy.data.curves.new('arrow', 'CURVE')
    chevron.dimensions = '2D'
    chevron.fill_mode = 'BOTH'
    chevron.extrude = 0.08
    chevron.bevel_depth = 0.03
    chevron.bevel_resolution = 3
    spline = chevron.splines.new('POLY')
    outline = [(0, 0.45), (0.45, 0), (0.2, 0), (0.2, -0.45), (-0.2, -0.45), (-0.2, 0), (-0.45, 0)]
    spline.points.add(len(outline) - 1)
    for point, (px, py) in zip(spline.points, outline):
        point.co = (px, py, 0, 1)
    spline.use_cyclic_u = True
    # separate node, origin at its centre: the site bobs and spins it
    arrow = curve_object('arrow', chevron, cap, loc=((count - 1) / 2 * gap, floor + heights[-1] + 1.25, 0), smooth=0)

    return parts, [arrow]


def build_trophy(args):
    gold = material('gold', '#e0b25c', metallic=1.0, roughness=0.36, coat=0.4, coat_roughness=0.13, double_sided=True)
    stone = material('stone', '#0d1015', metallic=0.2, roughness=0.24, coat=1.0, coat_roughness=0.1)
    glow = material('glow', emission=ACCENT, strength=1.5)

    profile = [(0, -1.8), (0.95, -1.8), (0.95, -1.64), (0.72, -1.56), (0.34, -1.36), (0.24, -1.05), (0.44, -0.92),
               (0.24, -0.78), (0.22, -0.46), (0.42, -0.32), (0.92, -0.08), (1.26, 0.42), (1.45, 1.1), (1.52, 1.78),
               (1.6, 1.9), (1.52, 1.95), (1.43, 1.82), (1.36, 1.12), (1.16, 0.48), (0.82, 0.02), (0, -0.12)]
    parts = [lathe('cup', catmull_rom(profile, 90), gold, steps=96)]

    for side in (-1, 1):
        points = [(side * 1.3, 1.35, 0), (side * 2.0, 1.45, 0), (side * 2.25, 0.9, 0), (side * 1.85, 0.3, 0), (side * 1.15, 0.35, 0)]
        parts.append(tube(f'handle{side}', points, 0.09, gold))

    parts.append(box('plinth', 2.3, 0.55, 2.3, 0.06, 4, stone, (0, -2.08, 0)))
    parts.append(torus('ring', 3.1, 0.018, glow, (0, -2.35, 0), (math.pi / 2, 0, 0), major_segments=200, minor_segments=8))

    for i in range(args.seats):
        a = i / args.seats * math.tau
        x, z = math.cos(a) * 3.1, math.sin(a) * 3.1
        parts.append(cylinder_y(f'puck{i}', 0.2, 0.1, 32, stone, (x, -2.3, z), edge=0.02))
        parts.append(cylinder_y(f'light{i}', 0.12, 0.02, 24, glow, (x, -2.24, z)))

    return parts, []


def build_pin(_args):
    shell = material('pinShell', LAMP, roughness=0.3, coat=0.3, coat_roughness=0.08, emission=ACCENT, strength=0.03)
    face = material('pinFace', '#dfe6ee', roughness=0.65)
    ground = material('ground', '#0a0d12', metallic=0.2, roughness=0.45)

    radius, centre, tip = 1.08, 1.35, -1.45
    profile = [(radius * math.sin(t), centre + radius * math.cos(t))
               for t in (i / 32 * math.pi * 0.7 for i in range(33))]
    profile.append((0, tip))
    head = lathe('head', profile, shell, steps=128)
    disc = cylinder_z('disc', 0.42, 0.42, 0.16, 48, face, (0, centre, radius - 0.07), edge=0.03)

    # head and disc travel together: one node, origin at 0, bobbed by the site
    select_only([head, disc], active=head)
    bpy.ops.object.join()
    pin = bpy.context.active_object
    pin.name = 'pin'

    base = cylinder_y('ground', 3.7, 0.1, 128, ground, (0, -1.85, 0), edge=0.02)
    return [base], [pin]


BUILDERS = {
    # name: (builder, occlusion reach in world units)
    'controller': (build_controller, 0.6),
    'bays': (build_bays, 0.8),
    'rates': (build_rates, 0.6),
    'trophy': (build_trophy, 0.7),
    'pin': (build_pin, 1.0),
}

# --- bake and export ------------------------------------------------------------


def ensure_uv(o):
    if not o.data.uv_layers:
        o.data.uv_layers.new(name='UVMap')


def soften(image, passes=2):
    """A light blur: 128-sample AO is still grainy, and grain in an occlusion map reads as dirt."""
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3]
    for _ in range(passes):
        rgb = (rgb + np.roll(rgb, 1, 0) + np.roll(rgb, -1, 0) + np.roll(rgb, 1, 1) + np.roll(rgb, -1, 1)) / 5
    px[..., :3] = rgb
    image.pixels[:] = px.ravel()


def bake_and_export(name, parts, extras, args, reach):
    for o in parts + extras:
        ensure_uv(o)

    select_only(parts)
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = f'{name}_body'
    bakeables = [body] + extras

    # One shared UV space for the whole model, so it bakes into one texture.
    # Angle-based islands, not a lightmap pack: lightmap packing boxes every face
    # separately, which on curved high-poly parts wastes the texture on margins,
    # bakes blocky, and splits every vertex on export.
    select_only(bakeables, active=body)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')

    image = bpy.data.images.new(f'{name}_ao', args.size, args.size, alpha=False)
    image.colorspace_settings.name = 'Non-Color'

    group_name = get_gltf_node_name()
    group = bpy.data.node_groups.get(group_name) or create_settings_group(group_name)
    materials = {slot.material for o in bakeables for slot in o.material_slots if slot.material}
    for mat in materials:
        tree = mat.node_tree
        texture = tree.nodes.new('ShaderNodeTexImage')
        texture.image = image
        split = tree.nodes.new('ShaderNodeSeparateColor')
        settings = tree.nodes.new('ShaderNodeGroup')
        settings.node_tree = group
        tree.links.new(texture.outputs['Color'], split.inputs['Color'])
        tree.links.new(split.outputs['Red'], settings.inputs['Occlusion'])
        # the active image node is where Cycles writes the bake
        tree.nodes.active = texture

    scene = bpy.context.scene
    scene.cycles.samples = args.samples
    scene.world.light_settings.distance = reach
    select_only(bakeables, active=body)
    bpy.ops.object.bake(type='AO', margin=16, use_clear=True, target='IMAGE_TEXTURES')
    soften(image)

    os.makedirs(args.out, exist_ok=True)
    image.filepath_raw = os.path.join(os.path.abspath(args.out), f'{name}_ao.png')
    image.file_format = 'PNG'
    image.save()

    select_only(bakeables, active=body)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(os.path.abspath(args.out), f'{name}.glb'),
        export_format='GLB',
        use_selection=True,
        export_yup=False,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )

    if args.preview:
        render_preview(name, args)
    if args.stills and name in STILLS:
        render_still(name, bakeables, args)


def render_preview(name, args):
    """A quick look at the shape, for checking a model without loading the site."""
    scene = bpy.context.scene
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    scene.collection.objects.link(camera)
    camera.location = (0, 0.4, 14)
    camera.data.lens = 40
    scene.camera = camera
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    scene.collection.objects.link(sun)
    sun.rotation_euler = (-0.6, -0.5, 0)
    sun.data.energy = 3
    scene.world.color = (0.05, 0.06, 0.08)
    scene.cycles.samples = 32
    scene.render.resolution_x, scene.render.resolution_y = 960, 600
    scene.render.filepath = os.path.join(os.path.abspath(args.out), f'{name}_preview.png')
    bpy.ops.render.render(write_still=True)


# Models that also ship as a still image, for visitors who get no WebGL scene.
# Rotation is the same baked pose models.ts gives the live model.
STILLS = {
    'controller': {'rotation': (-0.42, -0.5, 0.1)},
}


def render_still(name, objects, args):
    scene = bpy.context.scene
    root = bpy.data.objects.new('still_root', None)
    scene.collection.objects.link(root)
    for o in objects:
        o.parent = root
    # ZXY in Blender composes as Ry·Rx·Rz — three.js's 'YXZ', which models.ts uses
    root.rotation_mode = 'ZXY'
    root.rotation_euler = STILLS[name]['rotation']

    camera = bpy.data.objects.new('still_camera', bpy.data.cameras.new('still_camera'))
    scene.collection.objects.link(camera)
    camera.location = (0, 0, 11)
    camera.data.lens = 50
    scene.camera = camera

    world = scene.world
    try:
        world.use_nodes = True
    except Exception:
        pass
    if args.hdri and os.path.exists(args.hdri):
        environment = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
        environment.image = bpy.data.images.load(os.path.abspath(args.hdri))
        background = world.node_tree.nodes['Background']
        background.inputs['Strength'].default_value = 0.8
        world.node_tree.links.new(environment.outputs['Color'], background.inputs['Color'])

    key = bpy.data.objects.new('still_key', bpy.data.lights.new('still_key', 'AREA'))
    scene.collection.objects.link(key)
    key.location = (-5, 6, 9)
    key.rotation_euler = (-0.55, -0.45, 0)
    key.data.energy = 900
    key.data.size = 4

    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 82
    os.makedirs(args.stills, exist_ok=True)
    scene.render.filepath = os.path.join(os.path.abspath(args.stills), f'{name}.webp')
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    names = [n for n in args.only.split(',') if n] or list(BUILDERS)
    for name in names:
        reset()
        builder, reach = BUILDERS[name]
        parts, extras = builder(args)
        bake_and_export(name, parts, extras, args, reach)
        print(f'[lvlup] built {name}', flush=True)


try:
    main()
except Exception:
    traceback.print_exc()
    sys.exit(1)
