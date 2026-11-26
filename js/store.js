// STORE PAGE
//
// How it works (no editing this file to add items):
//   1. Alex/Kilian create a Product + Payment Link in the Stripe Dashboard (see PLAN.txt).
//   2. netlify/functions/products.mjs (served at /api/products) reads the Payment
//      Links from Stripe with a read-only key and returns them as JSON, cached ~5 min.
//   3. This script fetches that JSON and draws the grid. "Buy" opens the Stripe
//      Payment Link; after paying, Stripe sends the buyer back to store.html?purchased=1.
//      When a piece sells, Stripe turns its link off and it shows here as "Sold".

const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

// LOCAL DEV SWITCH: python3 -m http.server can't run Netlify Functions, so on
// localhost we load placeholder items from js/sample-products.json instead.
const PRODUCTS_URL = IS_LOCAL ? "js/sample-products.json" : "/api/products";

const grid = document.querySelector(".products-grid");
const statusEl = document.querySelector(".store-status");

// Thank-you note after Stripe redirects back here
if (new URLSearchParams(location.search).has("purchased")) {
    document.querySelector(".store-thanks")?.classList.remove("hide");
}

// Remote (Stripe-hosted) photos go through Netlify's Image CDN: resized + WebP.
// Local paths (sample data) are used as-is.
function imageSrc(url) {
    if (IS_LOCAL || !/^https?:\/\//.test(url)) return url;
    return `/.netlify/images?url=${encodeURIComponent(url)}&w=800&fm=webp`;
}

function formatPrice(amount, currency) {
    if (typeof amount !== "number") return "";
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: (currency || "usd").toUpperCase(),
            minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        }).format(amount);
    } catch {
        return `${amount} ${(currency || "").toUpperCase()}`;
    }
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function renderProduct(item, index) {
    const card = el("article", "product" + (item.sold ? " sold" : ""));

    if (item.image) {
        const img = el("img", "product-image");
        img.src = imageSrc(item.image);
        img.alt = item.title;
        if (index >= 3) img.loading = "lazy"; // first row loads right away
        card.append(img);
    }

    const head = el("div", "product-head");
    head.append(el("h3", "product-title", item.title));
    head.append(el("span", "product-price", formatPrice(item.price, item.currency)));
    card.append(head);

    if (item.description) card.append(el("p", "product-description", item.description));

    if (item.sold) {
        card.append(el("span", "product-sold", "Sold"));
    } else if (item.url) {
        const buy = el("a", "text-link product-buy", "Buy");
        buy.href = item.url;
        buy.target = "_blank"; // checkout opens in a new tab; the store stays open here
        buy.rel = "noopener";
        buy.setAttribute("aria-label", `Buy ${item.title} (opens in a new tab)`);
        card.append(buy);
    }
    return card;
}

function showFallback(message) {
    statusEl.textContent = "";
    statusEl.append(el("p", null, message + " Follow along on "));
    const p = statusEl.firstChild;
    const ig = el("a", "text-link", "Instagram");
    ig.href = "https://www.instagram.com/ceramics.alex";
    ig.target = "_blank";
    ig.rel = "noopener noreferrer";
    const mail = el("a", "text-link", "alexkoe2001@gmail.com");
    mail.href = "mailto:alexkoe2001@gmail.com";
    p.append(ig, " or email me at ", mail, ".");
    statusEl.classList.remove("loading");
}

async function loadStore() {
    try {
        const res = await fetch(PRODUCTS_URL, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const products = await res.json();
        if (!Array.isArray(products) || products.length === 0) {
            showFallback("New pieces coming soon!");
            return;
        }
        grid.replaceChildren(...products.map(renderProduct));
        statusEl.remove();
    } catch (err) {
        console.error("Store failed to load:", err);
        showFallback("The store is taking a little break. New pieces coming soon!");
    }
}

loadStore();
