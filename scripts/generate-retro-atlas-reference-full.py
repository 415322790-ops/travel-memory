from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "retro-atlas"
SOURCE = ASSET_DIR / "world-map-reference.jpg"
OUTPUT = ASSET_DIR / "retro-atlas-reference-full-8192.jpg"

WIDTH = 8192
HEIGHT = 4096

# The framed map area is the actual world-map composition. Cropping to this
# frame keeps every meaningful illustration and border while making its
# longitude/latitude footprint fill the Cesium 2:1 texture correctly.
MAP_FRAME = (62, 62, 1938, 1057)


def main():
    source = Image.open(SOURCE).convert("RGB")
    framed_map = source.crop(MAP_FRAME)
    texture = framed_map.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    texture.save(OUTPUT, format="JPEG", quality=96, subsampling=0, optimize=True)
    print(f"wrote {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
