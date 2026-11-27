# Alex K. Ceramics

Portfolio site for a ceramics artist, built to showcase the work rather than the framework.

**Stack:** Vanilla HTML/CSS/JS, no build step, no dependencies. Python + Pillow for image preprocessing (see [`tools/`](tools/)).
**Hosting:** Netlify, custom domain (`alexceramics.art`).

## What it does

- Category-filterable image gallery (All / Sculptures / Wares / Paintings), built with plain data attributes and DOM APIs
- Separate pages for Work, Workshops, and Store, with a shared stylesheet (`css/base.css`) plus one stylesheet per page
- Mobile-first responsive layout
- Images lazy-load below the fold (`loading="lazy"`) and are served pre-optimized as WebP at three sizes; see [`tools/README.md`](tools/README.md) for the preprocessing pipeline that generates them

## Store

- Stripe is the admin panel: every Stripe Payment Link is one item. `/api/products` (a Netlify Function) reads them with a read-only key; `js/store.js` draws the grid. Sold pieces stay up, marked "Sold"
- Each piece has its own server-rendered page at `/store/<slug>` (slug from `metadata.slug` in Stripe, else the product name) with Open Graph tags and schema.org Product data, so Pinterest and link previews can read it without JavaScript
- `/api/pinterest-feed.xml` is a product catalog feed for Pinterest (RSS 2.0 + `g:` fields), sold pieces included as out of stock
- Shared Stripe logic lives in `netlify/lib/stripe-products.mjs`. Tests: `node --test`. Local preview with the functions on sample data: `node tools/dev-server.mjs` (see [`tools/README.md`](tools/README.md))

## Implementation notes

- The active/hover state on filter and nav buttons goes bold without shifting surrounding layout. Done with a `::before` pseudo-element that pre-reserves the bold-text width (`content: attr(data-text)`), rather than reflowing on hover
- The gallery is populated from a single JS data array (`images` in `js/work.js`), so adding, reordering, or recategorizing work is a data change, not a markup change

## Status

- [x] Optimize images for web and faster loading
- [x] Home Page
- [x] Gallery w Filters and Categories
- [x] About Page
