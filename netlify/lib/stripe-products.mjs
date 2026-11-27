// Shared by the Netlify Functions: the store's items, read live from Stripe.
// (Lives outside netlify/functions/ so Netlify doesn't deploy it as a function.)
//
// Stripe is the admin panel: every Payment Link = one item in the store.
//   - link active                                     -> for sale
//   - link inactive AND completed_sessions count >= limit -> sold (Stripe turned it off)
//   - link inactive any other way (turned off by hand) -> hidden
//   - product archived (product.active === false)      -> hidden
//
// Each item gets a URL slug for its page at /store/<slug>:
//   product.metadata.slug if set, else the product name, slugified.
//   If two items end up with the same slug, the older one (by created) keeps it
//   and the newer ones get -2, -3, ... Slugs set in metadata are claimed first.
//
// Needs the env var STRIPE_RESTRICTED_KEY (a read-only restricted key with
// Products, Prices and Payment Links: Read). No npm packages: plain fetch.
//
// API reference: https://docs.stripe.com/api/payment_links

export const SITE_URL = "https://alexceramics.art";

const STRIPE_API = "https://api.stripe.com/v1";
const MAX_PAGES = 10;     // 10 x 100 links is far more than this store will ever have
const CONCURRENCY = 6;    // parallel line-item requests (Stripe rate limits are ~25/s in test mode)

// Currencies Stripe counts in whole units (no cents). https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL = new Set([
    "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
    "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

// Netlify's CDN: fresh for 5 min, then serve stale for up to 10 more while
// refreshing in the background. "durable" shares the cached copy across all of
// Netlify's edge nodes. Browsers always ask the CDN (cheap), so a sold piece
// shows up quickly. https://docs.netlify.com/build/caching/caching-overview/
export const CACHE_HEADERS = {
    "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=600",
    "Cache-Control": "public, max-age=0, must-revalidate",
};

export const NO_STORE_HEADERS = {
    "Cache-Control": "no-store",
    "Netlify-CDN-Cache-Control": "no-store",
};

// ---------------------------------------------------------------------------
// Where products come from.
//
// Live (Netlify): Stripe, with STRIPE_RESTRICTED_KEY.
// Local preview (tools/dev-server.mjs only): a loader that returns sample items
// in the same raw shape loadFromStripe builds. Nothing in the deployed functions
// ever calls useProductLoader, so production always reads Stripe.

let customLoader = null;

export function useProductLoader(fn) {
    customLoader = typeof fn === "function" ? fn : null;
}

export class MissingKeyError extends Error {}

// The store's visible items: for sale first, then sold. Throws on failure.
export async function getProducts() {
    if (customLoader) return finalizeProducts(await customLoader());
    const key = readKey();
    if (!key) throw new MissingKeyError("STRIPE_RESTRICTED_KEY is not set");
    return finalizeProducts(await loadFromStripe(key));
}

export function readKey() {
    // Netlify.env.get is the Functions v2 way; process.env works too (and in tests).
    const fromNetlify = globalThis.Netlify?.env?.get?.("STRIPE_RESTRICTED_KEY");
    return fromNetlify || process.env.STRIPE_RESTRICTED_KEY || "";
}

// ---------------------------------------------------------------------------
// Stripe

async function stripeGet(key, path, params = []) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${STRIPE_API}${path}${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
        let detail = "";
        try { detail = (await res.json())?.error?.message ?? ""; } catch { /* not JSON */ }
        throw new Error(`Stripe ${path} -> HTTP ${res.status} ${detail}`.trim());
    }
    return res.json();
}

async function listAllPaymentLinks(key) {
    const links = [];
    let startingAfter = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        const params = [["limit", "100"]];
        if (startingAfter) params.push(["starting_after", startingAfter]);
        const body = await stripeGet(key, "/payment_links", params);
        const data = body.data ?? [];
        links.push(...data);
        if (!body.has_more || data.length === 0) break;
        startingAfter = data[data.length - 1].id;
    }
    return links;
}

// Sold = Stripe deactivated the link because it reached its payment limit.
export function isSold(link) {
    const cs = link.restrictions?.completed_sessions;
    return !link.active && !!cs && typeof cs.limit === "number" && cs.count >= cs.limit;
}

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    });
    await Promise.all(workers);
    return results;
}

export function toMajorUnits(amount, currency) {
    if (typeof amount !== "number") return null;
    return ZERO_DECIMAL.has(currency) ? amount : amount / 100;
}

// "35.00" (or "3500" for zero-decimal currencies), for meta tags and feeds.
export function formatAmount(amount, currency = "usd") {
    if (typeof amount !== "number") return "";
    return amount.toFixed(ZERO_DECIMAL.has(String(currency).toLowerCase()) ? 0 : 2);
}

// Raw items (before slugs + sorting). Hidden links never cost a line-items request.
async function loadFromStripe(key) {
    const links = await listAllPaymentLinks(key);
    const visible = links.filter((link) => link.active || isSold(link));

    return mapLimit(visible, CONCURRENCY, async (link) => {
        const lineItems = await stripeGet(key, `/payment_links/${link.id}/line_items`, [
            ["limit", "1"],
            ["expand[]", "data.price.product"],
        ]);
        const price = lineItems.data?.[0]?.price;
        const product = price?.product;
        if (!price || !product || typeof product !== "object") return null;
        if (product.active === false) return null; // archived in Stripe

        const sold = isSold(link);
        const currency = price.currency ?? "usd";
        const images = (product.images ?? []).filter((u) => typeof u === "string" && u);
        return {
            id: link.id,
            productId: product.id ?? "",
            slug: product.metadata?.slug ?? "",
            title: product.name ?? "",
            description: product.description ?? "",
            price: toMajorUnits(price.unit_amount, currency),
            currency,
            images,
            url: sold ? null : link.url,
            sold,
            created: product.created ?? 0,
            order: product.metadata?.order,
        };
    });
}

// ---------------------------------------------------------------------------
// Slugs, sorting, final shape (shared by the Stripe path and the sample loader)

export function slugify(text) {
    return String(text ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")   // é -> e
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/['’]/g, "")              // "alex's" -> "alexs"
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .replace(/-+$/g, "");
}

// items: [{ slug (explicit, may be empty), title, created, productId }]
// Returns a Map item -> unique slug. Stable: oldest item keeps the plain slug.
export function assignSlugs(items) {
    const byAge = [...items].sort((a, b) =>
        (a.created ?? 0) - (b.created ?? 0) || String(a.productId ?? a.id).localeCompare(String(b.productId ?? b.id)));
    const taken = new Set();
    const result = new Map();

    const claim = (item, base) => {
        let slug = base;
        for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
        taken.add(slug);
        result.set(item, slug);
    };

    // Slugs set by hand in Stripe metadata win over ones made from the name.
    for (const item of byAge) {
        const explicit = slugify(item.slug);
        if (explicit) claim(item, explicit);
    }
    for (const item of byAge) {
        if (result.has(item)) continue;
        claim(item, slugify(item.title) || "piece");
    }
    return result;
}

// For sale first; then metadata.order (lower first, items without it after);
// then newest first.
function compareProducts(a, b) {
    if (a.sold !== b.sold) return a.sold ? 1 : -1;
    const ao = a.order ?? Infinity;
    const bo = b.order ?? Infinity;
    if (ao !== bo) return ao - bo;
    return b.created - a.created;
}

export function finalizeProducts(raw) {
    const items = (raw ?? []).filter(Boolean).map((item) => {
        const order = Number.parseFloat(item.order);
        const images = Array.isArray(item.images) && item.images.length
            ? item.images
            : item.image ? [item.image] : [];
        return { ...item, images, order: Number.isFinite(order) ? order : null };
    });
    const slugs = assignSlugs(items);

    return items.sort(compareProducts).map((item) => ({
        id: item.id,
        productId: item.productId ?? "",
        slug: slugs.get(item),
        title: item.title ?? "",
        description: item.description ?? "",
        price: item.price ?? null,
        currency: item.currency ?? "usd",
        image: item.images[0] ?? null,
        images: item.images,
        url: item.sold ? null : (item.url ?? null),
        pageUrl: `/store/${slugs.get(item)}`,
        sold: !!item.sold,
        created: item.created ?? 0,
    }));
}

// ---------------------------------------------------------------------------
// Small helpers for the HTML page and the feed

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Safe for HTML text and quoted attributes, and for XML.
export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// JSON that's safe inside <script>: no "</script>", "<!--" or line separators.
export function jsonForScript(value) {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

// Stripe image URLs are already absolute; local sample paths become site URLs.
export function absoluteUrl(pathOrUrl, base = SITE_URL) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return base + "/" + String(pathOrUrl).replace(/^\/+/, "");
}
