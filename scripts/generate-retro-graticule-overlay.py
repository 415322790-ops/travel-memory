from pathlib import Path

from PIL import Image, ImageDraw


WIDTH = 8192
HEIGHT = 4096
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "retro-atlas" / "earth-retro-graticule-8192.png"
INK = (131, 114, 90, 150)


def project(lon, lat):
    return ((lon + 180) / 360 * WIDTH, (90 - lat) / 180 * HEIGHT)


def main():
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Keep the network sparse enough that it reads as a paper-map trace.
    for longitude in range(-160, 180, 20):
        draw.line([project(longitude, latitude) for latitude in range(-80, 81, 2)], fill=INK, width=2)

    for latitude in range(-80, 81, 20):
        draw.line([project(longitude, latitude) for longitude in range(-180, 181, 2)], fill=INK, width=2)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, format="PNG", optimize=True)
    print(f"wrote {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
