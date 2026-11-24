// GET /api/products: the store's items, read live from Stripe.
//
// Stripe is the admin panel: every Payment Link = one item on store.html.
//   - link active                                     -> for sale
//   - link inactive AND completed_sessions count >= limit -> sold (Stripe turned it off)
//   - link inactive any other way (turned off by hand) -> hidden
//   - product archived (product.active === false)      -> hidden
//
// Needs the env var STRIPE_RESTRICTED_KEY (a read-only restricted key with
// Products, Prices and Payment Links: Read). No npm packages: plain fetch.
// The response is cached at Netlify's CDN for 5 minutes, so Stripe is hit rarely.
//
// API reference: https://docs.stripe.com/api/payment_links

const STRIPE_API = "https://api.stripe.com/v1";
const MAX_PAGES = 10;     // 10 x 100 links is far more than this store will ever have
const CONCURRENCY = 6;    // parallel line-item requests (Stripe rate limits are ~25/s in test mode)

// Currencies Stripe counts in whole units (no cents). https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL = new Set([
    "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
    "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

export default async (req, context) => {
    const key = readKey();
    if (!key) {
        console.error("products: STRIPE_RESTRICTED_KEY is not set");
        return errorResponse();
    }

    try {
        const products = await loadProducts(key);
        return new Response(JSON.stringify(products), {
            status: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                // Netlify's CDN: fresh for 5 min, then serve stale for up to 10 more
                // while refreshing in the background. "durable" shares the cached
                // copy across all of Netlify's edge nodes.
                // https://docs.netlify.com/build/caching/caching-overview/
                "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=600",
                // Browsers: always ask the CDN (cheap), so a sold piece shows up quickly.
                "Cache-Control": "public, max-age=0, must-revalidate",
            },
        });
    } catch (err) {
        console.error("products: failed to load from Stripe:", err?.message ?? err);
        return errorResponse();
    }
};

export const config = { path: "/api/products" };

// ---------------------------------------------------------------------------

function readKey() {
    // Netlify.env.get is the Functions v2 way; process.env works too (and in tests).
    const fromNetlify = globalThis.Netlify?.env?.get?.("STRIPE_RESTRICTED_KEY");
    return fromNetlify || process.env.STRIPE_RESTRICTED_KEY || "";
}

function errorResponse() {
    return new Response(JSON.stringify({ error: "Could not load the store right now." }), {
        status: 500,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Netlify-CDN-Cache-Control": "no-store",
        },
    });
}

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

function toMajorUnits(amount, currency) {
    if (typeof amount !== "number") return null;
    return ZERO_DECIMAL.has(currency) ? amount : amount / 100;
}

async function loadProducts(key) {
    const links = await listAllPaymentLinks(key);

    // Skip links turned off by hand before spending a request on their line items.
    const visible = links.filter((link) => link.active || isSold(link));

    const items = await mapLimit(visible, CONCURRENCY, async (link) => {
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
        const order = Number.parseFloat(product.metadata?.order);
        return {
            id: link.id,
            title: product.name ?? "",
            description: product.description ?? "",
            price: toMajorUnits(price.unit_amount, currency),
            currency,
            image: product.images?.[0] ?? null,
            url: sold ? null : link.url,
            sold,
            created: product.created ?? 0,
            order: Number.isFinite(order) ? order : null,
        };
    });

    return items
        .filter(Boolean)
        .sort(compareProducts)
        .map(({ order, ...rest }) => rest);
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
