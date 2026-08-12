from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


SIZE = 1024
SCALE = 4
CANVAS = SIZE * SCALE
BG = "#08131E"
MINT = "#46E0C2"
BLUE = "#5E9BFF"
BLUE_DARK = "#1B4D78"
MINT_DARK = "#1A6B65"


def point(x: float, y: float) -> tuple[int, int]:
    return int(x * SCALE), int(y * SCALE)


def polygon_points(points: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [point(x, y) for x, y in points]


def hexagon(cx: float, cy: float, radius: float) -> list[tuple[int, int]]:
    return polygon_points([
        (cx, cy - radius),
        (cx + radius * 0.866, cy - radius * 0.5),
        (cx + radius * 0.866, cy + radius * 0.5),
        (cx, cy + radius),
        (cx - radius * 0.866, cy + radius * 0.5),
        (cx - radius * 0.866, cy - radius * 0.5),
    ])


def make_icon() -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), BG)

    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((point(218, 218), point(806, 806)), fill=(70, 224, 194, 44))
    glow = glow.filter(ImageFilter.GaussianBlur(86 * SCALE))
    image.alpha_composite(glow)

    draw = ImageDraw.Draw(image)
    # Broad routing paths behind the core.
    draw.line([point(330, 377), point(452, 455), point(514, 512)], fill=BLUE_DARK, width=42 * SCALE, joint="curve")
    draw.line([point(690, 377), point(572, 465), point(514, 512)], fill=BLUE_DARK, width=42 * SCALE, joint="curve")
    draw.line([point(514, 512), point(514, 690)], fill=MINT_DARK, width=42 * SCALE)
    draw.line([point(330, 377), point(452, 455), point(514, 512)], fill=BLUE, width=16 * SCALE, joint="curve")
    draw.line([point(690, 377), point(572, 465), point(514, 512)], fill=BLUE, width=16 * SCALE, joint="curve")
    draw.line([point(514, 512), point(514, 690)], fill=MINT, width=16 * SCALE)

    # Endpoint nodes.
    for cx, cy, fill, ring in [(306, 360, BLUE, "#173B61"), (718, 360, BLUE, "#173B61"), (514, 718, MINT, "#174944")]:
        draw.ellipse((point(cx - 54, cy - 54), point(cx + 54, cy + 54)), fill=ring)
        draw.ellipse((point(cx - 33, cy - 33), point(cx + 33, cy + 33)), fill=fill)
        draw.ellipse((point(cx - 11, cy - 13), point(cx + 11, cy + 9)), fill="#EAF2F7")

    # Center routing core.
    draw.polygon(hexagon(514, 512, 154), fill="#14383B", outline="#2C9083", width=10 * SCALE)
    draw.polygon(hexagon(514, 512, 112), fill=MINT)
    draw.polygon(hexagon(514, 512, 58), fill="#08131E")
    draw.ellipse((point(493, 491), point(535, 533)), fill="#EAF2F7")

    # Fine highlights preserve recognizability at small sizes.
    draw.line([point(444, 458), point(514, 418), point(584, 458)], fill="#B7FFF0", width=10 * SCALE, joint="curve")
    draw.line([point(584, 566), point(514, 606), point(444, 566)], fill="#2AAE9D", width=10 * SCALE, joint="curve")

    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS).convert("RGBA")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    icon = make_icon()
    for filename in ("icon.png", "splash-icon.png", "favicon.png", "android-icon-foreground.png"):
        icon.save(root / "assets" / "images" / filename, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
