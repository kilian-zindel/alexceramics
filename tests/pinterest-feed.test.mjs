// Tests for netlify/functions/pinterest-feed.mjs (/api/pinterest-feed.xml).

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler, { config, categoryFor } from "../netlify/functions/pinterest-feed.mjs";
import { useProductLoader } from "../netlify/lib/stripe-products.mjs";

const realError = console.error;

const items = [
    {
        id: "plink_mug", productId: "prod_mug", title: "Blue Mug", description: "A blue mug & saucer <3",
        price: 35, currency: "usd",
        images: ["https://files.stripe.com/links/m1", "https://files.stripe.com/links/m2", "https://files.stripe.com/links/m3"],
        url: "https://buy.stripe.com/test_mug", sold: false, created: 2,
    },
    {
        id: "plink_bowl", productId: "prod_bowl", title: "Brown Bowl", description: "",
        price: 55, currency: "usd", images: ["/assets/display/Untitled_03.webp"],
        url: null, sold: true, created: 1,
    },
    {
        id: "plink_nophoto", productId: "prod_nophoto", title: "No Photo", description: "x",
        price: 10, currency: "usd", images: [], url: "https://buy.stripe.com/x", sold: false, created: 3,
    },
];

async function feed() {
    const res = await handler(new Request("https://alexceramics.art/api/pinterest-feed.xml"), {});
    return { res, xml: await res.text() };
}

function itemFor(xml, id) {
    return xml.split("<item>").slice(1).find((it) => it.includes(`<g:id>${id}</g:id>`));
}

beforeEach(() => {
    useProductLoader(() => structuredClone(items));
    console.error = () => {};
});
afterEach(() => {
    useProductLoader(null);
    console.error = realError;
});

test("config routes to /api/pinterest-feed.xml", () => {
    assert.equal(config.path, "/api/pinterest-feed.xml");
});

test("RSS 2.0 with the g: namespace, cached ~1 hour", async () => {
    const { res, xml } = await feed();
    assert.equal(res.status, 200);
    assert.match(res.headers.get("Content-Type"), /xml/);
    assert.match(res.headers.get("Netlify-CDN-Cache-Control"), /max-age=3600/);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/);
    // Items without a photo are left out (Pinterest rejects them)
    assert.equal((xml.match(/<item>/g) ?? []).length, 2);
    assert.equal(itemFor(xml, "prod_nophoto"), undefined);
});

test("for-sale item fields", async () => {
    const it = itemFor((await feed()).xml, "prod_mug");
    assert.ok(it);
    assert.match(it, /<title>Blue Mug<\/title>/);
    assert.match(it, /<description>A blue mug &amp; saucer &lt;3<\/description>/);
    assert.match(it, /<link>https:\/\/alexceramics\.art\/store\/blue-mug<\/link>/);
    assert.match(it, /<g:image_link>https:\/\/files\.stripe\.com\/links\/m1<\/g:image_link>/);
    assert.equal((it.match(/<g:additional_image_link>/g) ?? []).length, 2);
    assert.match(it, /<g:additional_image_link>https:\/\/files\.stripe\.com\/links\/m3<\/g:additional_image_link>/);
    assert.match(it, /<g:price>35\.00 USD<\/g:price>/);
    assert.match(it, /<g:availability>in stock<\/g:availability>/);
    assert.match(it, /<g:condition>new<\/g:condition>/);
    assert.match(it, /<g:brand>Alex K\. Ceramics<\/g:brand>/);
    assert.match(it, /<g:product_type>Home &amp; Garden &gt; Kitchen &amp; Dining &gt; Tableware &gt; Drinkware &gt; Mugs<\/g:product_type>/);
    assert.match(it, /<g:google_product_category>2169<\/g:google_product_category>/);
    assert.match(it, /<g:shipping>\s*<g:country>US<\/g:country>\s*<g:service>Standard<\/g:service>\s*<g:price>12\.00 USD<\/g:price>\s*<\/g:shipping>/);
});

test("sold item is listed as out of stock, local image made absolute, description filled in", async () => {
    const it = itemFor((await feed()).xml, "prod_bowl");
    assert.ok(it);
    assert.match(it, /<g:availability>out of stock<\/g:availability>/);
    assert.match(it, /<g:image_link>https:\/\/alexceramics\.art\/assets\/display\/Untitled_03\.webp<\/g:image_link>/);
    assert.doesNotMatch(it, /additional_image_link/);
    assert.match(it, /<description>Brown Bowl, a one-of-a-kind/);
    assert.match(it, /<g:google_product_category>3498<\/g:google_product_category>/);
});

test("categoryFor picks Google taxonomy IDs from the name", () => {
    assert.equal(categoryFor("Speckled Blue Mug").id, 2169);
    assert.equal(categoryFor("Small Teacup").id, 6049);
    assert.equal(categoryFor("Tea Cups, set of 2").id, 6049);
    assert.equal(categoryFor("Set of Four Coasters").id, 2363);
    assert.equal(categoryFor("Cup Coaster").id, 2363); // coaster wins over cup
    assert.equal(categoryFor("Brown Glaze Bowl").id, 3498);
    assert.equal(categoryFor("Dinner Plate").id, 3553);
    assert.equal(categoryFor("Small Serving Dish").id, 3553);
    assert.equal(categoryFor("Celadon Vase").id, 602);
    assert.equal(categoryFor("Wall Hanging").id, 696);
    assert.equal(categoryFor("Wall Hanging").path, "Home & Garden > Decor");
    assert.equal(categoryFor("Cupola sculpture").id, 696); // whole words only
});

test("Stripe failure returns 503, not cached", async () => {
    useProductLoader(() => { throw new Error("boom"); });
    const { res } = await feed();
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
});
