// STORE PAGE
//
// How it works (no editing this file to add items):
//   1. Alex/Kilian create a Product + Payment Link in the Stripe Dashboard (see PLAN.txt).
//   2. netlify/functions/products.mjs (served at /api/products) reads the Payment
//      Links from Stripe with a read-only key and returns them as JSON, cached ~5 min.
//   3. This script fetches that JSON and draws the grid. "Buy" opens the Stripe
//      Payment Link; after paying, Stripe sends the buyer back to store.html?purchased=1.
//      When a piece sells, Stripe turns its link off and it shows here as "Sold"
//      (sold pieces are listed after the ones for sale).
//   4. Each card's photo and title link to the piece's own page, /store/<slug>
//      (netlify/functions/product-page.mjs), which Pinterest can read.

const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

// LOCAL DEV: tools/dev-server.mjs serves /api/products (and the product pages)
// from sample data. The plain Python server can't, so on localhost we fall back
// to js/sample-products.json, without product page links.
const PRODUCTS_URL = "/api/products";
const SAMPLE_URL = "js/sample-products.json";

const grid = document.querySelector(".products-grid");
const statusEl = document.querySelector(".store-status");

// Thank-you note after Stripe redirects back here
if (new URLSearchParams(location.search).has("purchased")) {
    document.querySelector(".store-thanks")?.classList.remove("hide");
}

// Remote (Stripe-hosted) photos go through Netlify's Image CDN: resized + WebP.
// The browser picks the smallest width that's still sharp on its screen
// (a phone at 3x needs ~1200px). Local paths (sample data) are used as-is.
const IMAGE_WIDTHS = [600, 900, 1200, 1600];
const IMAGE_SIZES = "(max-width: 750px) 100vw, 340px"; // 1 column on phones, 3 on desktop

function isRemote(url) {
    return !IS_LOCAL && /^https?:\/\//.test(url);
}

function imageSrc(url, width = 1200) {
    if (!isRemote(url)) return url;
    return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&q=85&fm=webp`;
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

// Wraps a node in a link to the product page (when there is one).
function linkTo(item, child, className) {
    if (!item.pageUrl) return child;
    const a = el("a", className);
    a.href = item.pageUrl;
    a.append(child);
    return a;
}

function renderProduct(item, index) {
    const card = el("article", "product" + (item.sold ? " sold" : ""));

    if (item.image) {
        const img = el("img", "product-image");
        img.src = imageSrc(item.image);
        if (isRemote(item.image)) {
            img.srcset = IMAGE_WIDTHS.map((w) => `${imageSrc(item.image, w)} ${w}w`).join(", ");
            img.sizes = IMAGE_SIZES;
        }
        img.alt = item.title;
        if (index >= 3) img.loading = "lazy"; // first row loads right away
        card.append(linkTo(item, img, "product-image-link"));
    }

    const head = el("div", "product-head");
    const title = el("h3", "product-title");
    title.append(linkTo(item, document.createTextNode(item.title), "product-link"));
    head.append(title);
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

async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function fetchProducts() {
    if (!IS_LOCAL) return fetchJson(PRODUCTS_URL);
    try {
        return await fetchJson(PRODUCTS_URL);
    } catch {
        // Python dev server: no functions, so no product pages either.
        const items = await fetchJson(SAMPLE_URL);
        return items.map(({ pageUrl, ...item }) => item);
    }
}

// For sale first, sold after (the API already sorts this way; keep it true for
// the sample fallback too). Array.prototype.sort is stable.
function forSaleFirst(products) {
    return [...products].sort((a, b) => Number(!!a.sold) - Number(!!b.sold));
}

async function loadStore() {
    try {
        const products = await fetchProducts();
        if (!Array.isArray(products) || products.length === 0) {
            showFallback("New pieces coming soon!");
            return;
        }
        grid.replaceChildren(...forSaleFirst(products).map(renderProduct));
        statusEl.remove();
    } catch (err) {
        console.error("Store failed to load:", err);
        showFallback("The store is taking a little break. New pieces coming soon!");
    }
}

loadStore();
