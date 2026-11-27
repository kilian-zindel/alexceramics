// Unit tests for the slug + finalize helpers in netlify/lib/stripe-products.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, assignSlugs, finalizeProducts } from "../netlify/lib/stripe-products.mjs";

test("slugify", () => {
    assert.equal(slugify("Speckled Blue Mug"), "speckled-blue-mug");
    assert.equal(slugify("  Alex's  Café Bowl (large) "), "alexs-cafe-bowl-large");
    assert.equal(slugify("Cup & Saucer"), "cup-and-saucer");
    assert.equal(slugify("<script>alert(1)</script>"), "script-alert-1-script");
    assert.equal(slugify("!!!"), "");
    assert.equal(slugify(null), "");
    assert.ok(slugify("x".repeat(200)).length <= 80);
});

test("assignSlugs: empty names fall back to 'piece'", () => {
    const a = { title: "", created: 1 };
    const b = { title: "???", created: 2 };
    const slugs = assignSlugs([b, a]);
    assert.equal(slugs.get(a), "piece");
    assert.equal(slugs.get(b), "piece-2");
});

test("assignSlugs: a suffix never steals an explicit slug", () => {
    const explicit = { title: "Other", slug: "bowl-2", created: 9 };
    const b1 = { title: "Bowl", created: 1 };
    const b2 = { title: "Bowl", created: 2 };
    const slugs = assignSlugs([explicit, b1, b2]);
    assert.equal(slugs.get(explicit), "bowl-2");
    assert.equal(slugs.get(b1), "bowl");
    assert.equal(slugs.get(b2), "bowl-3");
});

test("assignSlugs: same created time is ordered by product id (stable)", () => {
    const x = { title: "Mug", created: 5, productId: "prod_b" };
    const y = { title: "Mug", created: 5, productId: "prod_a" };
    const slugs = assignSlugs([x, y]);
    assert.equal(slugs.get(y), "mug");
    assert.equal(slugs.get(x), "mug-2");
});

test("finalizeProducts: sold after for sale, sold has no url, image falls back to images[0]", () => {
    const out = finalizeProducts([
        { id: "l1", productId: "p1", title: "Sold Plate", sold: true, url: "https://buy.stripe.com/x", images: ["/a.webp"], created: 3 },
        { id: "l2", productId: "p2", title: "Cup", sold: false, url: "https://buy.stripe.com/y", image: "/b.webp", created: 1 },
    ]);
    assert.deepEqual(out.map((p) => p.id), ["l2", "l1"]);
    assert.equal(out[1].url, null);
    assert.deepEqual(out[0].images, ["/b.webp"]);
    assert.equal(out[0].pageUrl, "/store/cup");
    assert.ok(!("order" in out[0]));
});
