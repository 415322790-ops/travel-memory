from math import cos, radians, sin
from pathlib import Path

from PIL import Image, ImageDraw


WIDTH = 8192
HEIGHT = 4096
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "retro-atlas" / "earth-retro-mountains-8192.png"
INK = (82, 71, 55, 220)


def project(lon, lat):
    return ((lon + 180) / 360 * WIDTH, (90 - lat) / 180 * HEIGHT)


def draw_polyline(draw, points, width=5, fill=INK):
    draw.line([project(lon, lat) for lon, lat in points], fill=fill, width=width, joint="curve")


def draw_peak(draw, lon, lat, scale, variant, tilt=0):
    width = 1.5 + scale * 2.1
    height = 1.2 + scale * 1.5
    base = [(lon - width, lat), (lon - width * 0.55, lat - height * 0.12)]
    if variant % 3 == 0:
        ridge = [
            (lon - width * 0.55, lat - height * 0.12),
            (lon - width * 0.18, lat - height * 0.92),
            (lon + width * 0.04, lat - height * 0.28),
            (lon + width * 0.38, lat - height * 0.68),
            (lon + width * 0.72, lat - height * 0.10),
        ]
    elif variant % 3 == 1:
        ridge = [
            (lon - width * 0.55, lat - height * 0.12),
            (lon - width * 0.30, lat - height * 0.56),
            (lon - width * 0.04, lat - height * 0.18),
            (lon + width * 0.30, lat - height * 0.86),
            (lon + width * 0.72, lat - height * 0.10),
        ]
    else:
        ridge = [
            (lon - width * 0.55, lat - height * 0.12),
            (lon - width * 0.12, lat - height * 0.72),
            (lon + width * 0.20, lat - height * 0.34),
            (lon + width * 0.72, lat - height * 0.10),
        ]

    if tilt:
        ridge = [(x + tilt * (y - lat), y) for x, y in ridge]

    draw_polyline(draw, base + ridge + [(lon + width, lat)], width=6)
    for offset in (-0.34, -0.05, 0.26):
        start = (lon - width * 0.18 + offset * width, lat - height * 0.08)
        end = (lon - width * 0.03 + offset * width, lat - height * (0.5 + abs(offset) * 0.18))
        draw_polyline(draw, [start, end], width=4, fill=(82, 71, 55, 145))


def draw_range(draw, points, scale, seed):
    for index, (lon, lat) in enumerate(points):
        phase = (seed * 7 + index * 11) % 17
        local_scale = scale * 1.14 * (0.76 + (phase % 7) / 14)
        tilt = ((phase % 5) - 2) * 0.018
        draw_peak(draw, lon, lat, local_scale, seed + index, tilt)
        if index % 2 == 1:
            draw_peak(draw, lon + 1.12, lat + 0.22, local_scale * 0.66, seed + index + 3, -tilt)


def main():
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Sparse, geographically anchored ranges for the first overlay pass.
    ranges = [
        ([(70, 31), (73, 31.7), (76, 31.4), (79, 32), (82, 31.6), (85, 32), (88, 31.5), (91, 31)], 1.15, 3),
        ([(78, 35), (81, 35.6), (84, 35.2), (87, 36), (90, 35.6), (93, 35.5), (96, 35.2), (99, 35)], 0.92, 9),
        ([(70, 42), (74, 42.6), (78, 42.2), (82, 42.5), (86, 42.8), (90, 42.5), (94, 42.5)], 0.78, 14),
        ([(84, 47), (88, 47.8), (92, 47.5), (96, 47), (100, 47)], 0.62, 21),
        ([(93, 45), (97, 45.8), (101, 45.4), (105, 44.8), (109, 44)], 0.56, 25),
        ([(96, 28), (99, 27.2), (102, 27.6), (105, 28.2), (108, 29)], 0.52, 32),
        ([(116, 45), (120, 45.8), (124, 45.4), (128, 44.8), (132, 44)], 0.48, 38),
        ([(130, 37), (133, 36.3), (136, 35.7), (139, 35)], 0.48, 44),
        ([(100, 22), (103, 22.4), (106, 22.8), (109, 23)], 0.38, 49),
    ]

    for points, scale, seed in ranges:
        draw_range(draw, points, scale, seed)

    # A few restrained ridge strokes keep the symbols connected to the terrain.
    ridge_strokes = [
        [(68, 30), (74, 31), (81, 30.5), (88, 31), (96, 30)],
        [(68, 41), (75, 42), (83, 41.5), (91, 42), (98, 41)],
        [(94, 46), (101, 45), (108, 44), (115, 44.5)],
    ]
    for points in ridge_strokes:
        draw_polyline(draw, points, width=4, fill=(82, 71, 55, 120))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, format="PNG", optimize=True)
    print(f"wrote {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
