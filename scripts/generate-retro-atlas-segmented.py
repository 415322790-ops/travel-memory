from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "retro-atlas"
OUTPUT = ASSET_DIR / "retro-atlas-segmented-8192.jpg"
REFERENCE = ASSET_DIR / "world-map-reference.jpg"
LAND_SOURCE = ASSET_DIR / "earth-natural-earth-ii-8192.jpg"
BASE = ASSET_DIR / "retro-atlas-remastered-8192.jpg"

WIDTH = 8192
HEIGHT = 4096
REFERENCE_FRAME = (62, 62, 1938, 1057)


def normalized_map(image):
    return image.crop(REFERENCE_FRAME).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def project(lon, lat):
    return (
        int(round((lon + 180) / 360 * WIDTH)),
        int(round((90 - lat) / 180 * HEIGHT)),
    )


def build_land_mask():
    """Build a soft land-only mask from the high-resolution geospatial raster."""
    source = Image.open(LAND_SOURCE).convert("RGB").resize((2048, 1024), Image.Resampling.BILINEAR)
    pixels = source.load()
    mask = Image.new("L", source.size, 0)
    output = mask.load()

    for y in range(source.height):
        for x in range(source.width):
            red, green, blue = pixels[x, y]
            is_water = blue > red * 1.10 and blue > green * 1.04 and blue - red > 24
            output[x, y] = 0 if is_water else 255

    return mask.resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(1.2))


def build_reference_land_mask(reference_map):
    """Keep the reference's hand-drawn land texture, not its ocean decorations."""
    gray = ImageOps.grayscale(reference_map)
    mask = gray.point(lambda value: 255 if value >= 190 else 0)
    return mask.filter(ImageFilter.GaussianBlur(1.2))


def erase_reference_labels(mask):
    # These small land rectangles remove the large continent captions while
    # leaving the reference's mountain and coastline strokes available.
    label_rectangles = [
        (360, 338, 570, 405),   # North America
        (1030, 330, 1160, 405), # Europe
        (1420, 300, 1540, 370), # Asia
        (980, 570, 1100, 635),  # Africa
        (575, 725, 780, 800),  # South America
        (1535, 790, 1690, 860),# Oceania
    ]
    draw = ImageDraw.Draw(mask)
    frame_x0, frame_y0, frame_x1, frame_y1 = REFERENCE_FRAME
    frame_width = frame_x1 - frame_x0
    frame_height = frame_y1 - frame_y0

    for x0, y0, x1, y1 in label_rectangles:
        draw.rectangle(
            (
                int((x0 - frame_x0) / frame_width * WIDTH),
                int((y0 - frame_y0) / frame_height * HEIGHT),
                int((x1 - frame_x0) / frame_width * WIDTH),
                int((y1 - frame_y0) / frame_height * HEIGHT),
            ),
            fill=0,
        )


def crop_by_geo(image, bounds):
    lon_min, lat_min, lon_max, lat_max = bounds
    x0, y1 = project(lon_min, lat_min)
    x1, y0 = project(lon_max, lat_max)
    return image.crop((x0, y0, x1, y1))


def paste_detail_panel(
    style_layer,
    reference_map,
    reference_land_mask,
    geospatial_land_mask,
    source_bounds,
    target_bounds,
    opacity,
):
    source = ImageOps.grayscale(crop_by_geo(reference_map, source_bounds))
    target_x0, target_y_bottom = project(target_bounds[0], target_bounds[1])
    target_x1, target_y_top = project(target_bounds[2], target_bounds[3])
    target_width = max(1, target_x1 - target_x0)
    target_height = max(1, target_y_bottom - target_y_top)
    source = source.resize((target_width, target_height), Image.Resampling.LANCZOS)
    detail_alpha = source.point(lambda value: max(0, min(255, (190 - value) * 4)))

    target_x, target_y = project(target_bounds[0], target_bounds[3])
    reference_mask = crop_by_geo(reference_land_mask, source_bounds).resize(
        (target_width, target_height), Image.Resampling.BILINEAR
    )
    geospatial_mask = crop_by_geo(geospatial_land_mask, target_bounds).resize(
        (target_width, target_height), Image.Resampling.BILINEAR
    )
    panel_mask = ImageChops.multiply(reference_mask, geospatial_mask)
    detail_alpha = ImageChops.multiply(detail_alpha, panel_mask)
    detail_alpha = detail_alpha.point(lambda value: int(value * opacity))
    detail = Image.new("RGBA", (target_width, target_height), (76, 59, 39, 0))
    detail.putalpha(detail_alpha)
    style_layer.alpha_composite(detail, (target_x, target_y))


def main():
    reference_map = normalized_map(Image.open(REFERENCE).convert("RGB"))
    base = Image.open(BASE).convert("RGBA")
    geospatial_land_mask = build_land_mask()
    reference_land_mask = build_reference_land_mask(reference_map)
    erase_reference_labels(reference_land_mask)
    style_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))

    # Each panel has independent source and target bounds. Small target shifts
    # are intentional calibration knobs for matching the clean geospatial base.
    panels = [
        ((-170, 15, -48, 75), (-171, 14, -47, 74), 0.68), # North America
        ((-88, -56, -30, 15), (-87, -57, -29, 14), 0.7),  # South America
        ((-20, -38, 55, 72), (-19, -39, 56, 71), 0.66),  # Europe and Africa
        ((38, 0, 180, 78), (37, -1, 179, 77), 0.7),      # Asia
        ((108, -48, 180, 15), (109, -47, 179, 14), 0.7), # Australia and Oceania
    ]
    for source_bounds, target_bounds, opacity in panels:
        paste_detail_panel(
            style_layer,
            reference_map,
            reference_land_mask,
            geospatial_land_mask,
            source_bounds,
            target_bounds,
            opacity,
        )

    # Keep the accurate high-resolution base visible and blend only the
    # segmented reference linework into it instead of replacing the raster.
    result = Image.alpha_composite(base, style_layer)
    result.convert("RGB").save(OUTPUT, format="JPEG", quality=94, subsampling=0, optimize=True)
    print(f"wrote {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
