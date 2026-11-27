# Tools

Not part of the deployed site (netlify.toml blocks `/tools/*`).

## Local preview: `dev-server.mjs`

Runs the site with the real Netlify Functions, on sample data. Node 18+, no dependencies, no Netlify CLI.

```
node tools/dev-server.mjs          # http://127.0.0.1:8888
node tools/dev-server.mjs 9000     # other port
```

- Static files are served like `dev_server.py`: never cached, dotfiles (`.env`, `.secrets/`, `.git`) never served, pretty URLs (`/store` -> `store.html`), `/tests/*` and `/tools/*` blocked like on Netlify.
- `/api/products`, `/api/pinterest-feed.xml` and `/store/<slug>` run the real handlers in `netlify/functions/`.
- **Products come from `js/sample-products.json`, never from Stripe**, even if `STRIPE_RESTRICTED_KEY` is set in your shell. The server calls `useProductLoader()` from `netlify/lib/stripe-products.mjs`; the deployed functions never do, so the live site always reads Stripe. The JSON is re-read on every request, so edit it and refresh.
- Sample items use the raw shape the Stripe loader builds: `slug` stands in for `product.metadata.slug` (leave it `""` to derive it from the title), `images` is every photo, `sold` marks a sold piece. Slugs, `pageUrl` and sorting are added by the same code as live.
- Try: `/store.html`, `/store/speckled-blue-mug` (for sale), `/store/brown-glaze-bowl` (sold), `/store/nope` (302 to the store), `/api/pinterest-feed.xml`.

`python3 tools/dev_server.py` still works for plain static pages; the store then falls back to `js/sample-products.json` without product page links.

# Image Pipeline

This is the one-time/rerunnable preprocessing step that turns raw client photos into the optimized assets the site actually loads.

## What it does

`scripts/optimize_images.py` takes every photo in `Images/` (raw, unprocessed client exports) and, for each one:

- Resizes it to three target widths: `thumbnail` (800px), `display` (1200px), `hero` (2560px), without upscaling images smaller than the target
- Converts it to WebP (quality 75, or 85 for hero images where fine detail matters more)
- Preserves the original ICC color profile so colors don't shift
- Renames it sequentially (`Untitled_01.webp`, `Untitled_02.webp`, ...) and records the original filename in `scripts/image_map.json`, so a processed file can always be traced back to its source photo

Output goes to `../assets/{thumbnail,display,hero}/` at the repo root, the folders `index.html` actually references.

## Why

Client-provided photos come straight off a phone/camera: full resolution, no compression, inconsistent filenames. Shipping those directly would mean multi-MB page loads. Converting to WebP at three purpose-built sizes cuts file size dramatically while keeping images sharp on high-density (2x/3x) screens.

## Usage

```
cd scripts
python optimize_images.py
```

Requires [Pillow](https://pypi.org/project/Pillow/) (`pip install pillow`). Run whenever new source photos are added to `Images/`.
