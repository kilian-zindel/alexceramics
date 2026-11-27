// GET /api/products: the store's items as JSON, read live from Stripe.
// The Stripe logic (sold/hidden rules, slugs, sorting) is in
// netlify/lib/stripe-products.mjs, shared with the product pages and the feed.
//
// Each item: id (payment link), productId, slug, title, description, price
// (major units), currency, image (first photo), images (all), url (Stripe
// Payment Link, null when sold), pageUrl (/store/<slug>), sold, created.
//
// The response is cached at Netlify's CDN for 5 minutes, so Stripe is hit rarely.

import { getProducts, CACHE_HEADERS, NO_STORE_HEADERS } from "../lib/stripe-products.mjs";

export { isSold } from "../lib/stripe-products.mjs";

export default async (req, context) => {
    try {
        const products = await getProducts();
        return new Response(JSON.stringify(products), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8", ...CACHE_HEADERS },
        });
    } catch (err) {
        console.error("products: failed to load from Stripe:", err?.message ?? err);
        return new Response(JSON.stringify({ error: "Could not load the store right now." }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE_HEADERS },
        });
    }
};

export const config = { path: "/api/products" };
