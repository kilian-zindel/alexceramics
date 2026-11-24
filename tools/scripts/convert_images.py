"""
Convert photos into web-ready WebP files with names you choose.

Unlike optimize_images.py (the portfolio pipeline, which renumbers everything
into Untitled_XX), this script converts only the files you pass and keeps
readable names. Use it for workshop photos, store/product photos, etc.

  - Fixes phone rotation (EXIF orientation), so photos don't come out sideways
  - Resizes down to --width (never upscales)
  - Keeps the color profile, converts to WebP

Usage (from repo root):
  python3 tools/scripts/convert_images.py PHOTO [PHOTO ...] --out assets/workshops
  python3 tools/scripts/convert_images.py IMG_3888.jpeg --out assets/workshops --name teaching
  python3 tools/scripts/convert_images.py raw/*.jpg --out assets/store --width 1600 --quality 82

Output name = --name (single file only) or a slug of the original filename.
Existing files are overwritten, so re-running with an enhanced photo just swaps it.

Requires Pillow:  pip install pillow
"""

import argparse
import os
import re
import sys

from PIL import Image, ImageOps

VALID_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".tiff", ".bmp")


def slugify(filename):
    base = os.path.splitext(os.path.basename(filename))[0]
    slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
    return slug or "image"


def convert(src, out_dir, name, width, quality):
    with Image.open(src) as img:
        icc_profile = img.info.get("icc_profile")
        img = ImageOps.exif_transpose(img)

        if img.mode in ("RGBA", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1])
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        if img.width > width:
            height = round(img.height * width / img.width)
            img = img.resize((width, height), Image.LANCZOS)

        dest = os.path.join(out_dir, f"{name}.webp")
        save_kwargs = {"quality": quality, "method": 6}
        if icc_profile:
            save_kwargs["icc_profile"] = icc_profile
        img.save(dest, "WEBP", **save_kwargs)

    size_kb = os.path.getsize(dest) // 1024
    print(f"{src} -> {dest}  ({img.width}x{img.height}, {size_kb} KB)")


def main():
    parser = argparse.ArgumentParser(description="Convert photos to named, web-ready WebP files.")
    parser.add_argument("photos", nargs="+", help="image files to convert")
    parser.add_argument("--out", required=True, help="output folder, e.g. assets/workshops")
    parser.add_argument("--name", help="output name without extension (only with a single photo)")
    parser.add_argument("--width", type=int, default=1200, help="max width in px (default 1200)")
    parser.add_argument("--quality", type=int, default=78, help="WebP quality 1-100 (default 78)")
    args = parser.parse_args()

    if args.name and len(args.photos) > 1:
        sys.exit("--name only works with a single photo")

    os.makedirs(args.out, exist_ok=True)

    for src in args.photos:
        if not src.lower().endswith(VALID_EXTENSIONS):
            print(f"skipping {src} (not an image)")
            continue
        convert(src, args.out, args.name or slugify(src), args.width, args.quality)


if __name__ == "__main__":
    main()
