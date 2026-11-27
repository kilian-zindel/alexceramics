// Test helpers: a fake Stripe API (replaces globalThis.fetch) and builders.
// Not a test file itself (node --test only picks up *.test.mjs here).

export function product(id, extra = {}) {
    return {
        id: `prod_${id}`, object: "product", active: true, name: `Piece ${id}`,
        description: `About ${id}`, images: [`https://files.stripe.com/links/${id}`],
        metadata: {}, created: 1700000000, ...extra,
    };
}

export function link(id, extra = {}) {
    return {
        id: `plink_${id}`, object: "payment_link", active: true,
        url: `https://buy.stripe.com/test_${id}`, restrictions: null, ...extra,
    };
}

export function soldLink(id, extra = {}) {
    return link(id, { active: false, restrictions: { completed_sessions: { count: 1, limit: 1 } }, ...extra });
}

// pages: array of arrays of links (one per /payment_links page)
// products: { [linkId]: { product, unit_amount, currency } }
// calls: array that receives { url, init } for every request
export function fakeStripe(pages, products, calls = []) {
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
    return calls;
}
