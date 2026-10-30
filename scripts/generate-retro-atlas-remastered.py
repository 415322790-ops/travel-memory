from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "retro-atlas"
OUTPUT = ASSET_DIR / "retro-atlas-remastered-8192.jpg"
BASE = ASSET_DIR / "earth-retro-paper-8192.jpg"
MOUNTAINS = ASSET_DIR / "earth-retro-mountains-8192.png"
TERRAIN = ASSET_DIR / "earth-retro-terrain-lines-8192.png"
GRATICULE = ASSET_DIR / "earth-retro-graticule-8192.png"


def apply_overlay(base, path, opacity):
    overlay = Image.open(path).convert("RGBA")
    alpha = overlay.getchannel("A").point(lambda value: int(value * opacity))
    overlay.putalpha(alpha)
    return Image.alpha_composite(base, overlay)


def project(lon, lat):
    return ((lon + 180) / 360 * 8192, (90 - lat) / 180 * 4096)


def draw_handdrawn_ranges(base):
    """Bake restrained mountain-chain strokes into the final atlas asset."""
    ink = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(ink)
    ranges = [
        # Andes, Rockies and western North America.
        ([( -72, 8), (-74, 0), (-73, -10), (-72, -20), (-70, -30), (-68, -40)], 1.15, 18),
        ([( -125, 52), (-121, 47), (-118, 42), (-114, 37), (-110, 33)], 0.95, 15),
        # Alps, Atlas, Caucasus and Ural.
        ([( 5, 45), (10, 46), (15, 47), (20, 46), (25, 45)], 0.76, 8),
        ([( -10, 32), (-5, 34), (0, 35), (5, 35)], 0.7, 12),
        ([( 38, 43), (42, 44), (46, 43), (50, 42)], 0.64, 9),
        ([( 58, 68), (60, 62), (61, 56), (60, 50), (59, 45)], 0.62, 7),
        # The main Asian mountain belts.
        ([( 70, 31), (76, 31), (82, 32), (88, 31), (94, 30), (100, 29)], 1.25, 3),
        ([( 72, 36), (80, 36), (88, 36), (96, 35), (104, 34)], 0.95, 11),
        ([( 70, 42), (78, 42), (86, 43), (94, 42), (102, 42)], 0.78, 17),
        ([( 92, 47), (100, 46), (108, 45), (116, 44)], 0.66, 21),
        ([( 100, 23), (106, 24), (112, 25), (118, 26)], 0.55, 28),
        ([( 129, 38), (134, 36), (139, 35)], 0.5, 31),
        # New Guinea and New Zealand.
        ([( 137, -5), (143, -6), (148, -7)], 0.48, 36),
        ([( 166, -40), (171, -43), (176, -45)], 0.42, 39),
    ]

    for points, scale, seed in ranges:
        for index, (lon, lat) in enumerate(points):
            phase = (seed * 7 + index * 11) % 17
            width = 1.35 + scale * 1.9
            height = 1.05 + scale * 1.35
            tilt = ((phase % 5) - 2) * 0.018
            ridge = [
                (lon - width, lat),
                (lon - width * 0.46, lat - height * 0.12),
                (lon - width * 0.12 + tilt * height, lat - height * (0.78 if phase % 2 else 0.58)),
                (lon + width * 0.18, lat - height * 0.2),
                (lon + width * 0.52 + tilt * height, lat - height * 0.64),
                (lon + width, lat),
            ]
            draw.line([project(*point) for point in ridge], fill=(74, 61, 43, 122), width=5, joint="curve")
            for offset in (-0.28, 0.04, 0.32):
                start = (lon + offset * width, lat - height * 0.08)
                end = (lon + offset * width * 0.7, lat - height * 0.48)
                draw.line([project(*start), project(*end)], fill=(74, 61, 43, 76), width=3)

    # A few long, broken ridge strokes make the groups read as mountain belts.
    ridge_strokes = [
        [(68, 30), (76, 30.8), (84, 30.4), (92, 30.8), (101, 29.8)],
        [(69, 41), (78, 41.8), (87, 41.4), (96, 41.8), (105, 40.6)],
        [(106, 24), (113, 25), (120, 26), (127, 27)],
    ]
    for points in ridge_strokes:
        draw.line([project(*point) for point in points], fill=(74, 61, 43, 86), width=4, joint="curve")

    return Image.alpha_composite(base, ink)


def draw_cartographic_grid(base):
    """Add a quiet old-map graticule with stronger primary reference lines."""
    ink = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(ink)
    minor = (83, 67, 46, 50)
    major = (76, 59, 39, 76)

    for lon in range(-150, 181, 30):
        points = [project(lon, lat) for lat in range(-80, 81, 2)]
        draw.line(points, fill=major if lon % 60 == 0 else minor, width=3 if lon % 60 == 0 else 2)

    for lat in range(-75, 76, 15):
        points = [project(lon, lat) for lon in range(-180, 181, 2)]
        draw.line(points, fill=major if lat in (-45, 0, 45) else minor, width=3 if lat in (-45, 0, 45) else 2)

    # Keep the equator and the two tropics legible without making the globe
    # look like a technical GIS layer.
    for lat in (-23.5, 23.5):
        points = [project(lon, lat) for lon in range(-180, 181, 2)]
        draw.line(points, fill=(76, 59, 39, 62), width=3)
    points = [project(lon, 0) for lon in range(-180, 181, 2)]
    draw.line(points, fill=(68, 52, 35, 96), width=4)

    return Image.alpha_composite(base, ink)


def main():
    base = Image.open(BASE).convert("RGBA")
    if base.size != (8192, 4096):
        raise ValueError(f"unexpected base size: {base.size}")

    # Bake the three approved paper-map accents into one final globe texture.
    base = apply_overlay(base, MOUNTAINS, 0.28)
    base = apply_overlay(base, TERRAIN, 0.11)
    base = apply_overlay(base, GRATICULE, 0.14)
    base = draw_handdrawn_ranges(base)
    base = draw_cartographic_grid(base)
    base.convert("RGB").save(OUTPUT, format="JPEG", quality=94, subsampling=0, optimize=True)
    print(f"wrote {OUTPUT} ({base.width}x{base.height})")


if __name__ == "__main__":
    main()
