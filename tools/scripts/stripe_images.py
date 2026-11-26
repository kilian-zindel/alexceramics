"""
Shrink product photos so Stripe accepts them (Stripe's limit: under 2 MB).

  - Fixes phone rotation (EXIF orientation)
  - Resizes so the longest side is at most --size px (default 1600, never upscales)
  - Saves as JPEG (Stripe takes JPEG/PNG, not WebP/HEIC) and lowers quality
    step by step if a file would still be over the limit
  - Optional rename: write PHOTO=new-name instead of just PHOTO

Usage (from repo root):
  python3 tools/scripts/stripe_images.py photos/*.JPG --out assets/products/stripe
  python3 tools/scripts/stripe_images.py IMG_3915.JPG=blue-vessel IMG_3950.JPG=red-coaster --out OUT

Requires Pillow (pip install pillow); .heic photos also need pillow-heif.
"""

import argparse
import os
import re
import sys

from PIL import Image, ImageOps

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pillow_heif = None

LIMIT = 2 * 1024 * 1024
TARGET = int(LIMIT * 0.9)  # stay safely under Stripe's limit


def slugify(path):
    base = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-") or "image"


def convert(src, dest, size, quality):
    with Image.open(src) as img:
        icc = img.info.get("icc_profile")
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((size, size), Image.LANCZOS)

        q = quality
        while True:
            kwargs = {"quality": q, "optimize": True, "progressive": True}
            if icc:
                kwargs["icc_profile"] = icc
            img.save(dest, "JPEG", **kwargs)
            if os.path.getsize(dest) <= TARGET or q <= 60:
                break
            q -= 5

    kb = os.path.getsize(dest) // 1024
    flag = "" if os.path.getsize(dest) < LIMIT else "  !! STILL OVER 2 MB, try a smaller --size"
    print(f"{os.path.basename(src)} -> {dest}  ({img.width}x{img.height}, {kb} KB, q{q}){flag}")


def main():
    p = argparse.ArgumentParser(description="Resize product photos for Stripe (<2 MB JPEG).")
    p.add_argument("photos", nargs="+", help="PHOTO or PHOTO=new-name")
    p.add_argument("--out", required=True, help="output folder")
    p.add_argument("--size", type=int, default=1600, help="longest side in px (default 1600)")
    p.add_argument("--quality", type=int, default=85, help="starting JPEG quality (default 85)")
    args = p.parse_args()

    os.makedirs(args.out, exist_ok=True)
    for item in args.photos:
        src, _, name = item.partition("=")
        if not os.path.isfile(src):
            print(f"skipping {src} (not found)")
            continue
        if src.lower().endswith(".heic") and pillow_heif is None:
            print(f"skipping {src} (needs: pip install pillow-heif)")
            continue
        convert(src, os.path.join(args.out, f"{name or slugify(src)}.jpg"), args.size, args.quality)


if __name__ == "__main__":
    sys.exit(main())
