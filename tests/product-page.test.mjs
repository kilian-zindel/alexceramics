// Tests for netlify/functions/product-page.mjs (/store/<slug>).
// Products are injected with useProductLoader (the dev server's sample mode);
// one test goes through the fake Stripe API to cover the live path.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler, { config } from "../netlify/functions/product-page.mjs";
import { useProductLoader } from "../netlify/lib/stripe-products.mjs";
import { product, link, soldLink, fakeStripe } from "./helpers/fake-stripe.mjs";

const realFetch = globalThis.fetch;
const realError = console.error;

const items = [
    {
        id: "plink_mug", productId: "prod_mug", title: "Blue Mug", description: "A blue mug.",
        price: 35, currency: "usd",
        images: ["https://files.stripe.com/links/mug1", "https://files.stripe.com/links/mug2"],
        url: "https://buy.stripe.com/test_mug", sold: false, created: 3,
    },
    {
        id: "plink_bowl", productId: "prod_bowl", title: "Brown Bowl", description: "Sold already.",
        price: 55, currency: "usd", images: ["/assets/display/Untitled_03.webp"],
        url: "https://buy.stripe.com/should_not_show", sold: true, created: 2,
    },
    {
        id: "plink_evil", productId: "prod_evil",
        title: `Evil </script><script>alert("x")</script> & "Co"`,
        description: `<img src=x onerror=alert(1)> it's </SCRIPT> fine`,
        price: 20.5, currency: "usd", images: ["https://files.stripe.com/links/evil?a=1&b=2"],
        url: "https://buy.stripe.com/test_evil", sold: false, created: 1,
    },
];

async function get(slug) {
    const res = await handler(new Request(`https://alexceramics.art/store/${slug}`), { params: { slug } });
    return { res, html: res.status === 200 ? await res.text() : "" };
}

function meta(html, attr, name) {
    const m = html.match(new RegExp(`<meta ${attr}="${name.replace(/[.:]/g, "\\$&")}" content="([^"]*)">`));
    return m?.[1];
}

function jsonLd(html) {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, "JSON-LD block present");
    return { raw: m[1], data: JSON.parse(m[1]) };
}

beforeEach(() => {
    useProductLoader(() => structuredClone(items));
    console.error = () => {};
});
afterEach(() => {
    useProductLoader(null);
    globalThis.fetch = realFetch;
    console.error = realError;
    delete process.env.STRIPE_RESTRICTED_KEY;
});

test("config routes to /store/:slug", () => {
    assert.equal(config.path, "/store/:slug");
});

test("for-sale page: head meta, Buy link, photos, cache headers", async () => {
    const { res, html } = await get("blue-mug");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("Content-Type"), /text\/html/);
    assert.match(res.headers.get("Netlify-CDN-Cache-Control"), /max-age=300/);

    assert.match(html, /<title>Blue Mug \| Alex K\. Ceramics<\/title>/);
    assert.equal(meta(html, "name", "description"), "A blue mug.");
    assert.match(html, /<link rel="canonical" href="https:\/\/alexceramics\.art\/store\/blue-mug">/);
    assert.equal(meta(html, "property", "og:type"), "product");
    assert.equal(meta(html, "property", "og:title"), "Blue Mug | Alex K. Ceramics");
    assert.equal(meta(html, "property", "og:site_name"), "Alex K. Ceramics");
    assert.equal(meta(html, "property", "og:url"), "https://alexceramics.art/store/blue-mug");
    assert.equal(meta(html, "property", "og:image"), "https://files.stripe.com/links/mug1");
    assert.equal(meta(html, "property", "product:price:amount"), "35.00");
    assert.equal(meta(html, "property", "product:price:currency"), "USD");
    assert.equal(meta(html, "property", "og:availability"), "instock");
    assert.equal(meta(html, "property", "product:availability"), "in stock");

    // Buy opens the Payment Link; both photos via the Image CDN; nav + policy links
    assert.match(html, /<a class="text-link product-buy" href="https:\/\/buy\.stripe\.com\/test_mug"/);
    assert.match(html, /\/\.netlify\/images\?url=https%3A%2F%2Ffiles\.stripe\.com%2Flinks%2Fmug1&amp;w=1200/);
    assert.match(html, /srcset="[^"]*mug2[^"]*1600w"/);
    assert.match(html, /href="\/store\.html">&larr; Store<\/a>/);
    assert.match(html, /class="nav-btn active" href="\/store\.html"/);
    assert.match(html, /href="\/policies\.html#returns"/);
    assert.match(html, /href="\/policies\.html#shipping"/);
    assert.match(html, /All sales final &middot; Prices in US dollars/);
    assert.doesNotMatch(html, />Sold</);
});

test("for-sale page: schema.org Product JSON-LD", async () => {
    const { html } = await get("blue-mug");
    const { data } = jsonLd(html);
    assert.equal(data["@type"], "Product");
    assert.equal(data.name, "Blue Mug");
    assert.equal(data.sku, "prod_mug");
    assert.deepEqual(data.brand, { "@type": "Brand", name: "Alex K. Ceramics" });
    assert.deepEqual(data.image, ["https://files.stripe.com/links/mug1", "https://files.stripe.com/links/mug2"]);
    const o = data.offers;
    assert.equal(o.price, "35.00");
    assert.equal(o.priceCurrency, "USD");
    assert.equal(o.availability, "https://schema.org/InStock");
    assert.equal(o.itemCondition, "https://schema.org/NewCondition");
    assert.equal(o.url, "https://alexceramics.art/store/blue-mug");
    assert.equal(o.shippingDetails.shippingRate.value, "12.00");
    assert.equal(o.shippingDetails.shippingRate.currency, "USD");
    assert.equal(o.shippingDetails.shippingDestination.addressCountry, "US");
    assert.equal(o.hasMerchantReturnPolicy.returnPolicyCategory, "https://schema.org/MerchantReturnNotPermitted");
    assert.equal(o.hasMerchantReturnPolicy.merchantReturnLink, "https://alexceramics.art/policies.html#returns");
});

test("sold page: stays up, says Sold, no Buy link, out of stock, suggests available pieces", async () => {
    const { res, html } = await get("brown-bowl");
    assert.equal(res.status, 200);
    assert.match(html, /<p class="product-sold product-page-sold">Sold<\/p>/);
    assert.match(html, /This one found a home\./);
    assert.match(html, /mailto:alexkoe2001@gmail\.com/);
    assert.doesNotMatch(html, /should_not_show/);
    assert.doesNotMatch(html, /product-buy/);
    assert.equal(meta(html, "property", "og:availability"), "out of stock");
    assert.equal(meta(html, "property", "product:availability"), "out of stock");
    // local (sample) image becomes an absolute og:image
    assert.equal(meta(html, "property", "og:image"), "https://alexceramics.art/assets/display/Untitled_03.webp");
    assert.equal(jsonLd(html).data.offers.availability, "https://schema.org/SoldOut");
    // Available now: links to the for-sale pages, not itself
    assert.match(html, /href="\/store\/blue-mug"/);
    assert.doesNotMatch(html, /<a href="\/store\/brown-bowl">/);
});

test("Stripe text is escaped in HTML and JSON-LD", async () => {
    const slug = "evil-script-script-alert-x-script-and-co";
    const { res, html } = await get(slug);
    assert.equal(res.status, 200);

    // Exactly one closing </script> per script block in the head: none injected.
    assert.equal((html.match(/<\/script>/gi) ?? []).length, 1);
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /<title>Evil &lt;\/script&gt;&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &quot;Co&quot; \| Alex K\. Ceramics<\/title>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; it&#39;s &lt;\/SCRIPT&gt; fine/);

    const { raw, data } = jsonLd(html);
    assert.doesNotMatch(raw, /</);
    assert.equal(data.name, `Evil </script><script>alert("x")</script> & "Co"`);
    assert.equal(data.image[0], "https://files.stripe.com/links/evil?a=1&b=2");
    assert.equal(meta(html, "property", "og:image"), "https://files.stripe.com/links/evil?a=1&amp;b=2");
});

test("unknown slug redirects (302) to the store", async () => {
    const res = await handler(new Request("https://alexceramics.art/store/gone"), { params: { slug: "gone" } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/store.html");
});

test("slug is read from the path when context.params is missing", async () => {
    const res = await handler(new Request("https://alexceramics.art/store/blue-mug"), {});
    assert.equal(res.status, 200);
});

test("live path: reads Stripe, archived product redirects", async () => {
    useProductLoader(null);
    process.env.STRIPE_RESTRICTED_KEY = "rk_test_123";
    fakeStripe([[link("a"), soldLink("s"), link("z")]], {
        plink_a: { product: product("a", { name: "Tall Vase" }), unit_amount: 8000 },
        plink_s: { product: product("s", { name: "Old Plate" }) },
        plink_z: { product: product("z", { name: "Archived Cup", active: false }) },
    });
    const vase = await get("tall-vase");
    assert.equal(vase.res.status, 200);
    assert.equal(meta(vase.html, "property", "product:price:amount"), "80.00");
    assert.equal(jsonLd(vase.html).data.sku, "prod_a");
    const plate = await get("old-plate");
    assert.equal(plate.res.status, 200);
    assert.match(plate.html, />Sold</);
    const cup = await get("archived-cup");
    assert.equal(cup.res.status, 302);
});

test("Stripe failure returns 503, not cached", async () => {
    useProductLoader(null);
    delete process.env.STRIPE_RESTRICTED_KEY;
    const res = await handler(new Request("https://alexceramics.art/store/x"), { params: { slug: "x" } });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
});
