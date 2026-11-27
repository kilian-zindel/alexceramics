// GET /store/<slug>: one product's page, rendered on the server so crawlers
// that don't run JavaScript (Pinterest, link previews) see the title, photos,
// price, Open Graph tags and schema.org Product data.
//
// Data comes from Stripe via netlify/lib/stripe-products.mjs, same as the store.
//   - for sale  -> page with a Buy link (the Stripe Payment Link)
//   - sold      -> page stays up, marked "Sold", with links to the store
//   - unknown   -> 302 to /store.html (archived, hidden or a typo)
// Cached at Netlify's CDN for 5 minutes, like /api/products.

import {
    getProducts, CACHE_HEADERS, NO_STORE_HEADERS, SITE_URL,
    escapeHtml, jsonForScript, absoluteUrl, formatAmount,
} from "../lib/stripe-products.mjs";

const BRAND = "Alex K. Ceramics";
const EMAIL = "alexkoe2001@gmail.com";
const SHIPPING_USD = 12;
const IMAGE_WIDTHS = [600, 900, 1200, 1600];
const MORE_LIMIT = 3;

export default async (req, context) => {
    const slug = context?.params?.slug ?? slugFromPath(req.url);

    let products;
    try {
        products = await getProducts();
    } catch (err) {
        console.error("product-page: failed to load from Stripe:", err?.message ?? err);
        return new Response(errorPage(), {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "300", ...NO_STORE_HEADERS },
        });
    }

    const product = products.find((p) => p.slug === slug);
    if (!product) {
        return new Response(null, {
            status: 302,
            headers: { Location: "/store.html", ...CACHE_HEADERS },
        });
    }

    const more = products.filter((p) => !p.sold && p.slug !== product.slug).slice(0, MORE_LIMIT);
    return new Response(renderPage(product, more), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", ...CACHE_HEADERS },
    });
};

export const config = { path: "/store/:slug" };

// ---------------------------------------------------------------------------

function slugFromPath(url) {
    const m = new URL(url).pathname.match(/^\/store\/([^/]+)\/?$/);
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
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

function summary(product) {
    const text = (product.description || "").replace(/\s+/g, " ").trim();
    const base = text || `A one-of-a-kind handmade ceramic piece by Alex K., made in New York.`;
    return base.length > 200 ? base.slice(0, 197).replace(/\s+\S*$/, "") + "…" : base;
}

// Stripe photos go through Netlify's Image CDN (resized + WebP), like js/store.js.
// Local paths (sample data in the dev server) are used as-is.
function isRemote(url) {
    return /^https?:\/\//i.test(url);
}
function imageSrc(url, width = 1200) {
    if (!isRemote(url)) return "/" + String(url).replace(/^\/+/, "");
    return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&q=85&fm=webp`;
}
function imgTag(url, { alt, className, sizes, lazy }) {
    const attrs = [`class="${className}"`, `src="${escapeHtml(imageSrc(url))}"`];
    if (isRemote(url)) {
        attrs.push(`srcset="${escapeHtml(IMAGE_WIDTHS.map((w) => `${imageSrc(url, w)} ${w}w`).join(", "))}"`);
        attrs.push(`sizes="${sizes}"`);
    }
    attrs.push(`alt="${escapeHtml(alt)}"`);
    if (lazy) attrs.push(`loading="lazy"`);
    return `<img ${attrs.join(" ")}>`;
}

export function productJsonLd(product, canonical) {
    const currency = (product.currency || "usd").toUpperCase();
    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        description: summary(product),
        image: product.images.map((u) => absoluteUrl(u)),
        brand: { "@type": "Brand", name: BRAND },
        sku: product.productId || product.id,
        url: canonical,
        offers: {
            "@type": "Offer",
            url: canonical,
            price: formatAmount(product.price, product.currency),
            priceCurrency: currency,
            availability: product.sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@type": "Organization", name: BRAND },
            shippingDetails: {
                "@type": "OfferShippingDetails",
                shippingRate: { "@type": "MonetaryAmount", value: SHIPPING_USD.toFixed(2), currency: "USD" },
                shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
                deliveryTime: {
                    "@type": "ShippingDeliveryTime",
                    handlingTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 3, unitCode: "DAY" },
                },
            },
            hasMerchantReturnPolicy: {
                "@type": "MerchantReturnPolicy",
                applicableCountry: "US",
                returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
                merchantReturnLink: `${SITE_URL}/policies.html#returns`,
            },
        },
    };
}

export function renderPage(product, more = []) {
    const e = escapeHtml;
    const canonical = `${SITE_URL}/store/${encodeURIComponent(product.slug)}`;
    const title = `${product.title} | ${BRAND}`;
    const description = summary(product);
    const amount = formatAmount(product.price, product.currency);
    const currency = (product.currency || "usd").toUpperCase();
    const ogImage = product.images[0]
        ? absoluteUrl(product.images[0])
        : `${SITE_URL}/assets/display/Untitled_05.webp`;

    const [first, ...rest] = product.images;
    const photos = first
        ? `<div class="product-photos">
                ${imgTag(first, { alt: product.title, className: "product-photo-main", sizes: "(max-width: 750px) 100vw, 620px" })}
                ${rest.length ? `<div class="product-photo-strip">
                    ${rest.map((u, i) => imgTag(u, { alt: `${product.title}, photo ${i + 2}`, className: "product-photo", sizes: "(max-width: 750px) 50vw, 300px", lazy: true })).join("\n                    ")}
                </div>` : ""}
            </div>`
        : "";

    const action = product.sold
        ? `<p class="product-sold product-page-sold">Sold</p>
                <p class="product-page-note">This one found a home. See <a class="text-link" href="/store.html">what's available in the store</a>, or <a class="text-link" href="${e(`mailto:${EMAIL}?subject=${encodeURIComponent(`Commission like "${product.title}"`)}`)}">email me about a commission</a>.</p>`
        : product.url
            ? `<a class="text-link product-buy" href="${e(product.url)}" target="_blank" rel="noopener" aria-label="Buy ${e(product.title)} (opens in a new tab)">Buy</a>`
            : "";

    const moreSection = product.sold && more.length
        ? `<section class="product-more">
            <h2>Available now</h2>
            <div class="products-grid">
                ${more.map((p) => `<article class="product">
                    <a href="${e(p.pageUrl)}">${p.image ? imgTag(p.image, { alt: p.title, className: "product-image", sizes: "(max-width: 750px) 100vw, 340px", lazy: true }) : ""}</a>
                    <div class="product-head">
                        <h3 class="product-title"><a class="product-link" href="${e(p.pageUrl)}">${e(p.title)}</a></h3>
                        <span class="product-price">${e(formatPrice(p.price, p.currency))}</span>
                    </div>
                </article>`).join("\n                ")}
            </div>
        </section>`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${e(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <!-- meta description, open graph & product tags -->
    <meta name="description" content="${e(description)}">
    <link rel="canonical" href="${e(canonical)}">
    <meta property="og:type" content="product">
    <meta property="og:site_name" content="${BRAND}">
    <meta property="og:title" content="${e(title)}">
    <meta property="og:description" content="${e(description)}">
    <meta property="og:image" content="${e(ogImage)}">
    <meta property="og:url" content="${e(canonical)}">
    <meta property="product:price:amount" content="${e(amount)}">
    <meta property="product:price:currency" content="${e(currency)}">
    <meta property="og:availability" content="${product.sold ? "out of stock" : "instock"}">
    <meta property="product:availability" content="${product.sold ? "out of stock" : "in stock"}">
    <script type="application/ld+json">${jsonForScript(productJsonLd(product, canonical))}</script>

    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="stylesheet" href="/css/base.css">
    <link rel="stylesheet" href="/css/store.css">
    <link rel="stylesheet" href="/css/product.css">

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cantarell:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
</head>
<body>

    <!-- HEADER (same on every page; only the "active" link changes) -->
    <header>
        <h1><a href="/index.html">Alex K. Ceramics</a></h1>

        <nav aria-label="Main Navigation">
            <div class="nav-links">
                <a class="nav-btn" href="/index.html" data-text="My Work">My Work</a>
                <a class="nav-btn" href="/workshops.html" data-text="Workshops">Workshops</a>
                <a class="nav-btn active" href="/store.html" data-text="Store">Store</a>
            </div>

            <a class="social-link"
               href="https://www.instagram.com/ceramics.alex"
               target="_blank"
               rel="noopener noreferrer"
               aria-label="Visit Alex's Instagram">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
            </a>
        </nav>
    </header>

    <!-- PRODUCT: rendered by netlify/functions/product-page.mjs from Stripe -->
    <main class="product-page page${product.sold ? " sold" : ""}">
        <a class="text-link product-back" href="/store.html">&larr; Store</a>

        <div class="product-layout">
            ${photos}

            <div class="product-info">
                <h2 class="product-page-title">${e(product.title)}</h2>
                <p class="product-page-price">${e(formatPrice(product.price, product.currency))}</p>
                ${product.description ? `<p class="product-page-description">${e(product.description)}</p>` : ""}
                ${action}
                <p class="store-terms">All sales final &middot; Prices in US dollars &middot; <a class="text-link" href="/policies.html#returns">Shipping &amp; returns</a></p>
                <p class="product-page-terms"><a class="text-link" href="/policies.html#shipping">$12 flat shipping in the US</a> &middot; ships in 2&ndash;3 business days</p>
            </div>
        </div>
        ${moreSection}
    </main>

    <footer class="site-footer">
        <p>Commissions welcome: <a class="text-link" href="mailto:${EMAIL}">${EMAIL}</a> &middot; <a class="text-link" href="tel:+13129610296">(312) 961-0296</a> &middot; <a class="text-link" href="https://www.instagram.com/ceramics.alex" target="_blank" rel="noopener noreferrer">Instagram</a> &middot; <a class="text-link" href="/policies.html#returns">Shipping &amp; returns</a> &middot; <a class="text-link" href="/policies.html#privacy">Privacy</a></p>
    </footer>
</body>
</html>
`;
}

function errorPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Store | ${BRAND}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <link rel="stylesheet" href="/css/base.css">
</head>
<body>
    <main class="page">
        <p>The store is taking a little break. Please try again in a few minutes, or see <a class="text-link" href="/store.html">the store</a>.</p>
    </main>
</body>
</html>
`;
}
