// GET /api/pinterest-feed.xml: the store as a product catalog feed for Pinterest
// (RSS 2.0 with Google's g: namespace, which Pinterest accepts).
// https://help.pinterest.com/en/business/article/data-source-ingestion
//
// One <item> per visible product, sold ones included as "out of stock", so
// Pins of sold pieces keep pointing at their (still live) product page.
// Cached at Netlify's CDN for about an hour; Pinterest fetches it daily at most.

import {
    getProducts, NO_STORE_HEADERS, SITE_URL, escapeHtml, absoluteUrl, formatAmount,
} from "../lib/stripe-products.mjs";

const BRAND = "Alex K. Ceramics";
const SHIPPING = { country: "US", service: "Standard", price: "12.00 USD" };
const MAX_ADDITIONAL_IMAGES = 10; // Pinterest's limit

// Google product taxonomy (version 2021-09-21), matched by words in the name.
// IDs from https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
const CATEGORIES = [
    { re: /\bcoasters?\b/i, id: 2363, path: "Home & Garden > Kitchen & Dining > Barware > Coasters" },
    { re: /\bmugs?\b/i, id: 2169, path: "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs" },
    { re: /\b(tea)?cups?\b/i, id: 6049, path: "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Coffee & Tea Cups" },
    { re: /\bbowls?\b/i, id: 3498, path: "Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Bowls" },
    { re: /\b(plates?|dish|dishes)\b/i, id: 3553, path: "Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Plates" },
    { re: /\bvases?\b/i, id: 602, path: "Home & Garden > Decor > Vases" },
];
const FALLBACK_CATEGORY = { id: 696, path: "Home & Garden > Decor" };

// Escape for XML and drop control characters XML 1.0 doesn't allow.
const x = (value) => escapeHtml(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export function categoryFor(title) {
    return CATEGORIES.find((c) => c.re.test(title ?? "")) ?? FALLBACK_CATEGORY;
}

export default async (req, context) => {
    let products;
    try {
        products = await getProducts();
    } catch (err) {
        console.error("pinterest-feed: failed to load from Stripe:", err?.message ?? err);
        return new Response("Feed temporarily unavailable.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "600", ...NO_STORE_HEADERS },
        });
    }

    return new Response(renderFeed(products), {
        status: 200,
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Netlify-CDN-Cache-Control": "public, durable, max-age=3600, stale-while-revalidate=600",
            "Cache-Control": "public, max-age=0, must-revalidate",
        },
    });
};

export const config = { path: "/api/pinterest-feed.xml" };

// ---------------------------------------------------------------------------

export function renderFeed(products) {
    // Pinterest rejects items without a photo or a price.
    const items = products.filter((p) => p.images.length && typeof p.price === "number");
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${BRAND}</title>
<link>${SITE_URL}/store.html</link>
<description>One-of-a-kind handmade ceramics by Alex K., made in New York.</description>
${items.map(renderItem).join("")}</channel>
</rss>
`;
}

function renderItem(p) {
    const [first, ...rest] = p.images;
    const category = categoryFor(p.title);
    const description = (p.description || "").trim() || `${p.title}, a one-of-a-kind handmade ceramic piece by Alex K.`;
    const extra = rest.slice(0, MAX_ADDITIONAL_IMAGES)
        .map((u) => `  <g:additional_image_link>${x(absoluteUrl(u))}</g:additional_image_link>\n`).join("");
    return `<item>
  <g:id>${x(p.productId || p.id)}</g:id>
  <title>${x(p.title)}</title>
  <description>${x(description)}</description>
  <link>${x(SITE_URL + "/store/" + encodeURIComponent(p.slug))}</link>
  <g:image_link>${x(absoluteUrl(first))}</g:image_link>
${extra}  <g:price>${formatAmount(p.price, p.currency)} ${x((p.currency || "usd").toUpperCase())}</g:price>
  <g:availability>${p.sold ? "out of stock" : "in stock"}</g:availability>
  <g:condition>new</g:condition>
  <g:brand>${BRAND}</g:brand>
  <g:product_type>${x(category.path)}</g:product_type>
  <g:google_product_category>${category.id}</g:google_product_category>
  <g:shipping>
    <g:country>${SHIPPING.country}</g:country>
    <g:service>${SHIPPING.service}</g:service>
    <g:price>${SHIPPING.price}</g:price>
  </g:shipping>
</item>
`;
}
