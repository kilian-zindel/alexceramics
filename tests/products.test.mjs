// Tests for netlify/functions/products.mjs. Run: node --test tests/
// Stripe is faked by replacing globalThis.fetch.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler, { config, isSold } from "../netlify/functions/products.mjs";

const realFetch = globalThis.fetch;
const realError = console.error;
let calls;

function product(id, extra = {}) {
    return {
        id: `prod_${id}`, object: "product", active: true, name: `Piece ${id}`,
        description: `About ${id}`, images: [`https://files.stripe.com/links/${id}`],
        metadata: {}, created: 1700000000, ...extra,
    };
}

function link(id, extra = {}) {
    return {
        id: `plink_${id}`, object: "payment_link", active: true,
        url: `https://buy.stripe.com/test_${id}`, restrictions: null, ...extra,
    };
}

// pages: array of arrays of links (one per /payment_links page)
// products: { [linkId]: { product, unit_amount, currency } }
function fakeStripe(pages, products) {
    globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        const json = (body, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

        if (url.pathname === "/v1/payment_links") {
            const after = url.searchParams.get("starting_after");
            let i = 0;
            if (after) i = pages.findIndex((p) => p.at(-1)?.id === after) + 1;
            return json({ object: "list", data: pages[i] ?? [], has_more: i < pages.length - 1 });
        }
        const m = url.pathname.match(/^\/v1\/payment_links\/([^/]+)\/line_items$/);
        if (m) {
            const p = products[m[1]];
            if (!p) return json({ error: { message: "No such payment link" } }, 404);
            return json({
                object: "list", has_more: false,
                data: [{
                    object: "item", quantity: 1,
                    price: {
                        object: "price", type: "one_time", currency: p.currency ?? "usd",
                        unit_amount: p.unit_amount ?? 4500, product: p.product,
                    },
                }],
            });
        }
        return json({ error: { message: "unexpected" } }, 400);
    };
}

async function call() {
    const res = await handler(new Request("https://example.com/api/products"), {});
    return { res, body: await res.json() };
}

beforeEach(() => {
    calls = [];
    process.env.STRIPE_RESTRICTED_KEY = "rk_test_123";
    console.error = () => {};
});
afterEach(() => {
    globalThis.fetch = realFetch;
    console.error = realError;
    delete process.env.STRIPE_RESTRICTED_KEY;
});

test("config routes to /api/products", () => {
    assert.equal(config.path, "/api/products");
});

test("active link is listed for sale with price in major units", async () => {
    fakeStripe([[link("a")]], { plink_a: { product: product("a"), unit_amount: 4550 } });
    const { res, body } = await call();
    assert.equal(res.status, 200);
    assert.deepEqual(body, [{
        id: "plink_a", title: "Piece a", description: "About a", price: 45.5, currency: "usd",
        image: "https://files.stripe.com/links/a", url: "https://buy.stripe.com/test_a",
        sold: false, created: 1700000000,
    }]);
    assert.match(res.headers.get("Netlify-CDN-Cache-Control"), /max-age=300/);
    assert.match(res.headers.get("Netlify-CDN-Cache-Control"), /stale-while-revalidate/);
    // Auth header + expand are sent
    const li = calls.find((c) => c.url.pathname.endsWith("/line_items"));
    assert.equal(li.init.headers.Authorization, "Bearer rk_test_123");
    assert.equal(li.url.searchParams.get("expand[]"), "data.price.product");
});

test("inactive link that hit its payment limit is sold, with no url", async () => {
    const sold = link("s", { active: false, restrictions: { completed_sessions: { count: 1, limit: 1 } } });
    fakeStripe([[sold]], { plink_s: { product: product("s") } });
    const { body } = await call();
    assert.equal(body.length, 1);
    assert.equal(body[0].sold, true);
    assert.equal(body[0].url, null);
});

test("manually deactivated link (count < limit, or no limit) is hidden", async () => {
    const offA = link("x", { active: false, restrictions: { completed_sessions: { count: 0, limit: 1 } } });
    const offB = link("y", { active: false, restrictions: null });
    fakeStripe([[offA, offB, link("a")]], {
        plink_x: { product: product("x") },
        plink_y: { product: product("y") },
        plink_a: { product: product("a") },
    });
    const { body } = await call();
    assert.deepEqual(body.map((p) => p.id), ["plink_a"]);
    // Hidden links don't cost a line-items request
    assert.equal(calls.filter((c) => c.url.pathname.endsWith("/line_items")).length, 1);
});

test("archived product is hidden", async () => {
    fakeStripe([[link("z"), link("a")]], {
        plink_z: { product: product("z", { active: false }) },
        plink_a: { product: product("a") },
    });
    const { body } = await call();
    assert.deepEqual(body.map((p) => p.id), ["plink_a"]);
});

test("follows has_more pagination", async () => {
    fakeStripe([[link("p1")], [link("p2")], [link("p3")]], {
        plink_p1: { product: product("p1") },
        plink_p2: { product: product("p2") },
        plink_p3: { product: product("p3") },
    });
    const { body } = await call();
    assert.equal(body.length, 3);
    const listCalls = calls.filter((c) => c.url.pathname === "/v1/payment_links");
    assert.equal(listCalls.length, 3);
    assert.equal(listCalls[1].url.searchParams.get("starting_after"), "plink_p1");
    assert.equal(listCalls[2].url.searchParams.get("starting_after"), "plink_p2");
});

test("sorts for-sale first, then metadata.order, then newest", async () => {
    const soldLink = link("sold", { active: false, restrictions: { completed_sessions: { count: 1, limit: 1 } } });
    fakeStripe([[soldLink, link("old"), link("new"), link("pinned")]], {
        plink_sold: { product: product("sold", { created: 1800000000 }) },
        plink_old: { product: product("old", { created: 1600000000 }) },
        plink_new: { product: product("new", { created: 1700000000 }) },
        plink_pinned: { product: product("pinned", { created: 1500000000, metadata: { order: "1" } }) },
    });
    const { body } = await call();
    assert.deepEqual(body.map((p) => p.id), ["plink_pinned", "plink_new", "plink_old", "plink_sold"]);
});

test("missing key returns 500 without calling Stripe", async () => {
    delete process.env.STRIPE_RESTRICTED_KEY;
    fakeStripe([[]], {});
    const { res, body } = await call();
    assert.equal(res.status, 500);
    assert.equal(typeof body.error, "string");
    assert.equal(calls.length, 0);
});

test("Stripe error returns 500 with a generic message", async () => {
    globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: { message: "Invalid API Key provided: rk_test_***123" } }), { status: 401 });
    const { res, body } = await call();
    assert.equal(res.status, 500);
    assert.doesNotMatch(body.error, /rk_|API Key/);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("isSold", () => {
    assert.equal(isSold({ active: true, restrictions: { completed_sessions: { count: 1, limit: 1 } } }), false);
    assert.equal(isSold({ active: false, restrictions: { completed_sessions: { count: 2, limit: 1 } } }), true);
    assert.equal(isSold({ active: false, restrictions: null }), false);
});
