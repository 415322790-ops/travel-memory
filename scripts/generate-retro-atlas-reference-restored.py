from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "retro-atlas"
SOURCE = ASSET_DIR / "world-map-reference-restored.png"
OUTPUT = ASSET_DIR / "retro-atlas-reference-restored-8192.jpg"

WIDTH = 8192
HEIGHT = 4096


def main():
    source = Image.open(SOURCE).convert("RGB")
    # Keep the whole repaired composition, including its border and corner
    # ornaments. The final non-uniform fit is intentional: Cesium needs a
    # strict 2:1 equirectangular texture and the reference is a poster ratio.
    texture = source.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    texture.save(OUTPUT, format="JPEG", quality=96, subsampling=0, optimize=True)
    print(f"wrote {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
