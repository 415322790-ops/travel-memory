import random
from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw


WIDTH = 8192
HEIGHT = 4096
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "retro-atlas" / "earth-retro-terrain-lines-8192.png"
INK = (101, 90, 72, 170)


def project(lon, lat):
    return ((lon + 180) / 360 * WIDTH, (90 - lat) / 180 * HEIGHT)


def in_city_quiet_zone(lon, lat):
    cities = [
        (113.26, 23.13, 3.0),
        (120.16, 30.25, 3.0),
        (104.07, 30.67, 2.6),
        (121.47, 31.23, 2.4),
        (114.31, 30.59, 2.2),
        (118.80, 32.06, 2.2),
        (118.09, 24.48, 2.0),
    ]
    return any(abs(lon - city_lon) < radius and abs(lat - city_lat) < radius for city_lon, city_lat, radius in cities)


def draw_stroke(draw, points, width=3):
    draw.line([project(lon, lat) for lon, lat in points], fill=INK, width=width, joint="curve")


def draw_region(draw, region, seed):
    rng = random.Random(seed)
    lon_min, lat_min, lon_max, lat_max, count, orientation = region
    for _ in range(count):
        center_lon = rng.uniform(lon_min, lon_max)
        center_lat = rng.uniform(lat_min, lat_max)
        length = rng.uniform(2.5, 7.2)
        bend = rng.uniform(0.12, 0.52)
        phase = rng.uniform(0, pi * 2)
        points = []
        for index in range(9):
            progress = index / 8
            wave = sin(progress * pi * 1.3 + phase) * bend
            if orientation == "north-east":
                lon = center_lon + progress * length
                lat = center_lat + progress * length * 0.18 + wave
            elif orientation == "north-south":
                lon = center_lon + wave
                lat = center_lat + progress * length * 0.62
            else:
                lon = center_lon + progress * length
                lat = center_lat + wave
            points.append((lon, lat))

        if any(in_city_quiet_zone(lon, lat) for lon, lat in points):
            continue
        draw_stroke(draw, points, width=rng.choice((2, 3)))


def main():
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Sparse terrain strokes are limited to mountain and plateau areas.
    regions = [
        (74, 28, 96, 34, 20, "north-east"),
        (78, 34, 101, 39, 18, "north-east"),
        (68, 39, 94, 45, 16, "north-east"),
        (88, 43, 108, 49, 12, "north-east"),
        (96, 24, 110, 31, 12, "north-east"),
        (116, 42, 132, 48, 8, "north-east"),
        (130, 33, 142, 40, 8, "north-south"),
        (98, 18, 107, 24, 6, "north-east"),
    ]

    for index, region in enumerate(regions):
        draw_region(draw, region, 100 + index * 41)

    image.save(OUTPUT, format="PNG", optimize=True)
    print(f"wrote {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
