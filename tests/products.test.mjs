// Tests for netlify/functions/products.mjs (and the shared Stripe loader in
// netlify/lib/stripe-products.mjs). Run: node --test (from the repo root)
// Stripe is faked by replacing globalThis.fetch.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler, { config, isSold } from "../netlify/functions/products.mjs";
import { product, link, soldLink, fakeStripe as fakeStripeImpl } from "./helpers/fake-stripe.mjs";

const realFetch = globalThis.fetch;
const realError = console.error;
let calls;

const fakeStripe = (pages, products) => fakeStripeImpl(pages, products, calls);

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
        id: "plink_a", productId: "prod_a", slug: "piece-a", title: "Piece a", description: "About a",
        price: 45.5, currency: "usd",
        image: "https://files.stripe.com/links/a", images: ["https://files.stripe.com/links/a"],
        url: "https://buy.stripe.com/test_a", pageUrl: "/store/piece-a",
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
    const sold = soldLink("s");
    fakeStripe([[sold]], { plink_s: { product: product("s") } });
    const { body } = await call();
    assert.equal(body.length, 1);
    assert.equal(body[0].sold, true);
    assert.equal(body[0].url, null);
    assert.equal(body[0].pageUrl, "/store/piece-s"); // sold pieces keep their page
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

test("all product images are returned; image is the first", async () => {
    const imgs = ["https://files.stripe.com/links/1", "https://files.stripe.com/links/2", "https://files.stripe.com/links/3"];
    fakeStripe([[link("a")]], { plink_a: { product: product("a", { images: imgs }) } });
    const { body } = await call();
    assert.deepEqual(body[0].images, imgs);
    assert.equal(body[0].image, imgs[0]);
});

test("product without images has image null and images []", async () => {
    fakeStripe([[link("a")]], { plink_a: { product: product("a", { images: [] }) } });
    const { body } = await call();
    assert.equal(body[0].image, null);
    assert.deepEqual(body[0].images, []);
});

test("slugs: metadata.slug wins, else the name; collisions get -2, -3 by created", async () => {
    fakeStripe([[link("n3"), link("n1"), link("n2"), link("m"), link("acc")]], {
        // three pieces with the same name; n1 is oldest, then n2, then n3
        plink_n3: { product: product("n3", { name: "Blue Cup", created: 1700000300 }) },
        plink_n1: { product: product("n1", { name: "Blue Cup", created: 1700000100 }) },
        plink_n2: { product: product("n2", { name: "Blue  cup!", created: 1700000200 }) },
        // newest, but its hand-set slug claims "blue-cup" before the name-based ones
        plink_m: { product: product("m", { name: "Something else", created: 1700000400, metadata: { slug: "Blue Cup" } }) },
        plink_acc: { product: product("acc", { name: "Crème Brûlée Dish & Lid", created: 1700000500 }) },
    });
    const { body } = await call();
    const slugOf = (id) => body.find((p) => p.id === id).slug;
    assert.equal(slugOf("plink_m"), "blue-cup");
    assert.equal(slugOf("plink_n1"), "blue-cup-2");
    assert.equal(slugOf("plink_n2"), "blue-cup-3");
    assert.equal(slugOf("plink_n3"), "blue-cup-4");
    assert.equal(slugOf("plink_acc"), "creme-brulee-dish-and-lid");
    assert.equal(new Set(body.map((p) => p.slug)).size, body.length);
    for (const p of body) assert.equal(p.pageUrl, `/store/${p.slug}`);
});
