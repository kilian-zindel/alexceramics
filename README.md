# Alex K. Ceramics

Portfolio site for a ceramics artist, built to showcase the work rather than the framework.

**Stack:** Vanilla HTML/CSS/JS, no build step, no dependencies. Python + Pillow for image preprocessing (see [`tools/`](tools/)).
**Hosting:** Netlify, custom domain (`alexceramics.art`).

## What it does

- Category-filterable image gallery (All / Sculptures / Wares / Paintings), built with plain data attributes and DOM APIs
- Separate pages for Work, Workshops, Store, and About, with a shared stylesheet (`css/base.css`) plus one stylesheet per page
- Mobile-first responsive layout
- Images lazy-load below the fold (`loading="lazy"`) and are served pre-optimized as WebP at three sizes; see [`tools/README.md`](tools/README.md) for the preprocessing pipeline that generates them

## Implementation notes

- The active/hover state on filter and nav buttons goes bold without shifting surrounding layout. Done with a `::before` pseudo-element that pre-reserves the bold-text width (`content: attr(data-text)`), rather than reflowing on hover
- The gallery is populated from a single JS data array (`images` in `js/work.js`), so adding, reordering, or recategorizing work is a data change, not a markup change

## Status

- [x] Optimize images for web and faster loading
- [x] Home Page
- [x] Gallery w Filters and Categories
- [x] About Page
