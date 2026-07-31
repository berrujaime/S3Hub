#!/usr/bin/env python3
"""Draws the modernised S3Hub mark as SVG. Geometry only, no magic numbers
buried in the markup: everything derives from R (the cube's circumradius).

Composition is the existing logo: isometric cube, S / S / 3 on the three
faces, six nodes on a hexagonal halo joined to the cube's vertices by short
stubs, dotted arcs between the nodes. Only the execution and the palette
change: flat fills, one uniform stroke weight, theme colours.
"""

import math
import sys

SIZE = 1024
C = SIZE / 2
R = 268.0  # cube circumradius -> width 2*cos30*R, height 2*R
SW = 22.0  # the single stroke weight shared by every line in the mark
RN = 396.0  # radius of the node halo
NODE_R = 26.0  # node disc radius
ARC_CLEAR = 15.0  # degrees of arc trimmed either side of each node
DOT_GAP = 48.0  # spacing of the dotted arcs

COS30 = math.cos(math.radians(30))

PALETTES = {
    'dark': {
        'bg': '#0E1116',
        'line': '#E7ECF3',  # onBackground
        'face_top': '#38414D',  # outline
        'face_left': '#2A3442',  # elevation.level4
        'face_right': '#1E2530',  # elevation.level1 / surfaceVariant
        'node': '#E8973A',  # primary (dark)
    },
    'light': {
        'bg': '#F5F7FA',
        'line': '#10151C',  # onSurface
        'face_top': '#FFFFFF',  # surface
        'face_left': '#EFF3F7',  # elevation.level2
        'face_right': '#E7ECF2',  # surfaceVariant
        'node': '#AD610E',  # primary (light, AA)
    },
}

# Hexagon vertices, SVG angles (y grows downwards). V0 top, then clockwise.
ANGLES = [-90.0, -30.0, 30.0, 90.0, 150.0, 210.0]


def polar(deg, r):
    a = math.radians(deg)
    return (C + r * math.cos(a), C + r * math.sin(a))


V = [polar(a, R) for a in ANGLES]
V0, V1, V2, V3, V4, V5 = V
CEN = (C, C)


def pts(*p):
    return ' '.join(f'{x:.2f},{y:.2f}' for x, y in p)


def face(p, fill):
    return f'  <polygon points="{pts(*p)}" fill="{fill}"/>'


def line(a, b, col):
    return (
        f'  <line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" '
        f'stroke="{col}" stroke-width="{SW}" stroke-linecap="butt"/>'
    )


def iso_text(char, m, col):
    """Place a glyph inside a unit rhombus mapped by matrix m, centred."""
    a, b, c, d, e, f = m
    return (
        f'  <g transform="matrix({a:.4f},{b:.4f},{c:.4f},{d:.4f},{e:.2f},{f:.2f})">'
        f'<text x="{R / 2:.2f}" y="{R / 2:.2f}" fill="{col}" '
        f'font-family="Space Grotesk" font-weight="700" font-size="{R * 0.62:.2f}" '
        f'text-anchor="middle" dominant-baseline="central">{char}</text></g>'
    )


def build(pal, halo=True, letters=True, cube_scale=1.0, top_alt=False, bg=True,
          amber_top=False, vertex_nodes=False):
    o = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" '
        f'viewBox="0 0 {SIZE} {SIZE}">',
    ]
    if bg:
        o.append(f'  <rect width="{SIZE}" height="{SIZE}" fill="{pal["bg"]}"/>')
    if cube_scale != 1.0:
        o.append(f'  <g transform="translate({C} {C}) scale({cube_scale}) translate({-C} {-C})">')

    # --- faces (flat fills, lightest on top: light comes from above) -------
    o.append(face((V5, V0, V1, CEN), pal['node'] if amber_top else pal['face_top']))
    o.append(face((V5, CEN, V3, V4), pal['face_left']))
    o.append(face((CEN, V1, V2, V3), pal['face_right']))

    # --- glyphs, one per face, lying in that face's plane ------------------
    if letters:
        if top_alt:
            # baseline runs down-right, mirroring the right face
            o.append(iso_text('S', (COS30, 0.5, -COS30, 0.5, V0[0], V0[1]), pal['line']))
        else:
            # baseline runs up-right, mirroring the left face
            o.append(iso_text('S', (COS30, -0.5, COS30, 0.5, V5[0], V5[1]), pal['line']))
        o.append(iso_text('S', (COS30, 0.5, 0.0, 1.0, V5[0], V5[1]), pal['line']))
        o.append(iso_text('3', (COS30, -0.5, 0.0, 1.0, C, C), pal['line']))

    # --- cube: silhouette + the three seams -------------------------------
    o.append(
        f'  <polygon points="{pts(*V)}" fill="none" stroke="{pal["line"]}" '
        f'stroke-width="{SW}" stroke-linejoin="miter"/>'
    )
    for end in (V1, V3, V5):
        o.append(line(CEN, end, pal['line']))

    # --- halo: stubs, nodes, dotted arcs ----------------------------------
    for i, ang in enumerate(ANGLES if halo else []):
        o.append(line(polar(ang, R), polar(ang, RN - NODE_R + 4), pal['line']))
        nx, ny = polar(ang, RN)
        o.append(f'  <circle cx="{nx:.2f}" cy="{ny:.2f}" r="{NODE_R}" fill="{pal["node"]}"/>')

        a0 = ang + ARC_CLEAR
        a1 = ANGLES[(i + 1) % 6] + (360.0 if i == 5 else 0.0) - ARC_CLEAR
        p0, p1 = polar(a0, RN), polar(a1, RN)
        o.append(
            f'  <path d="M {p0[0]:.2f} {p0[1]:.2f} A {RN} {RN} 0 0 1 {p1[0]:.2f} {p1[1]:.2f}" '
            f'fill="none" stroke="{pal["line"]}" stroke-width="{SW}" '
            f'stroke-linecap="round" stroke-dasharray="1 {DOT_GAP}"/>'
        )

    # --- reduced mark: the halo's nodes collapsed onto the cube's vertices --
    if vertex_nodes:
        for ang in ANGLES:
            nx, ny = polar(ang, R)
            o.append(f'  <circle cx="{nx:.2f}" cy="{ny:.2f}" r="{NODE_R}" fill="{pal["node"]}"/>')

    if cube_scale != 1.0:
        o.append('  </g>')
    o.append('</svg>')
    return '\n'.join(o) + '\n'


if __name__ == '__main__':
    pal = PALETTES[sys.argv[1] if len(sys.argv) > 1 else 'dark']
    mode = sys.argv[2] if len(sys.argv) > 2 else 'full'
    # Reduced marks drop the halo and the glyphs (neither survives 48 px) and
    # are scaled so nothing leaves the launcher's 66/108 dp safe circle.
    if mode == 'icon-top':
        out = build(pal, halo=False, letters=False, cube_scale=1.30, amber_top=True)
    elif mode == 'icon-nodes':
        out = build(pal, halo=False, letters=False, cube_scale=1.05, vertex_nodes=True)
    else:
        out = build(pal, top_alt=True)
    sys.stdout.write(out)
