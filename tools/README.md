# Image Pipeline

Not part of the deployed site — this is the one-time/rerunnable preprocessing step that turns raw client photos into the optimized assets the site actually loads.

## What it does

`scripts/optimize_images.py` takes every photo in `Images/` (raw, unprocessed client exports) and, for each one:

- Resizes it to three target widths — `thumbnail` (800px), `display` (1200px), `hero` (2560px) — without upscaling images smaller than the target
- Converts it to WebP (quality 75, or 85 for hero images where fine detail matters more)
- Preserves the original ICC color profile so colors don't shift
- Renames it sequentially (`Untitled_01.webp`, `Untitled_02.webp`, ...) and records the original filename in `scripts/image_map.json`, so a processed file can always be traced back to its source photo

Output goes to `../assets/{thumbnail,display,hero}/` at the repo root — the folders `index.html` actually references.

## Why

Client-provided photos come straight off a phone/camera: full resolution, no compression, inconsistent filenames. Shipping those directly would mean multi-MB page loads. Converting to WebP at three purpose-built sizes cuts file size dramatically while keeping images sharp on high-density (2x/3x) screens.

## Usage

```
cd scripts
python optimize_images.py
```

Requires [Pillow](https://pypi.org/project/Pillow/) (`pip install pillow`). Run whenever new source photos are added to `Images/`.
