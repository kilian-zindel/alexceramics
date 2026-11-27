// Local preview with the real Netlify Functions, on sample data. Zero dependencies.
//
//   node tools/dev-server.mjs [port]     -> http://127.0.0.1:8888
//
// - Static files like tools/dev_server.py: never cached, dotfiles never served,
//   pretty URLs (/store -> store.html), /tests/* and /tools/* blocked like on Netlify.
// - /api/products, /api/pinterest-feed.xml and /store/<slug> run the real
//   function handlers, but products come from js/sample-products.json:
//   Stripe is never called, even if STRIPE_RESTRICTED_KEY is set in your shell.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { useProductLoader } from "../netlify/lib/stripe-products.mjs";
import products from "../netlify/functions/products.mjs";
import productPage from "../netlify/functions/product-page.mjs";
import pinterestFeed from "../netlify/functions/pinterest-feed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8888;
const SAMPLE_FILE = join(ROOT, "js", "sample-products.json");

// Sample mode: re-read the JSON on every request so edits show up on refresh.
useProductLoader(async () => JSON.parse(await readFile(SAMPLE_FILE, "utf8")));

const ROUTES = [
    { re: /^\/api\/products\/?$/, handler: products },
    { re: /^\/api\/pinterest-feed\.xml$/, handler: pinterestFeed },
    { re: /^\/store\/(?<slug>[^/]+)\/?$/, handler: productPage },
];

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    try {
        for (const route of ROUTES) {
            const m = url.pathname.match(route.re);
            if (!m) continue;
            const params = {};
            for (const [k, v] of Object.entries(m.groups ?? {})) {
                try { params[k] = decodeURIComponent(v); } catch { params[k] = v; }
            }
            const headers = {};
            for (const h of ["accept", "user-agent", "accept-language"]) {
                if (req.headers[h]) headers[h] = req.headers[h];
            }
            const request = new Request(url, { method: req.method, headers });
            return await sendResponse(res, await route.handler(request, { params }), req.method);
        }
        await serveStatic(url.pathname, req.method, res);
    } catch (err) {
        console.error(err);
        if (!res.headersSent) send(res, 500, "Server error");
    }
});

async function sendResponse(res, response, method) {
    const headers = Object.fromEntries(response.headers);
    // Keep Netlify-CDN-Cache-Control visible for checking, but browsers never cache here.
    headers["cache-control"] = "no-store";
    res.writeHead(response.status, headers);
    if (method === "HEAD" || !response.body) return res.end();
    res.end(Buffer.from(await response.arrayBuffer()));
}

function send(res, status, text) {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(text);
}

async function isFile(path) {
    try { return (await stat(path)).isFile(); } catch { return false; }
}

async function serveStatic(pathname, method, res) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return send(res, 400, "Bad request"); }
    const parts = decoded.split("/").filter(Boolean);

    // Never serve hidden files/folders (.git, .secrets, .env, ...), and block
    // repo-only folders the same way netlify.toml does.
    if (parts.some((p) => p.startsWith(".")) || ["tests", "tools"].includes(parts[0])) {
        return notFound(res);
    }

    const base = resolve(ROOT, ...parts);
    if (base !== ROOT && !base.startsWith(ROOT + sep)) return notFound(res);

    // Pretty URLs: /store -> store.html, /folder/ -> folder/index.html
    const candidates = decoded.endsWith("/") || parts.length === 0
        ? [join(base, "index.html")]
        : [base, base + ".html", join(base, "index.html")];

    for (const file of candidates) {
        if (await isFile(file)) {
            const body = await readFile(file);
            res.writeHead(200, {
                "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
                "Content-Length": body.length,
                "Cache-Control": "no-store",
            });
            return method === "HEAD" ? res.end() : res.end(body);
        }
    }
    return notFound(res);
}

async function notFound(res) {
    const page = join(ROOT, "404.html");
    if (await isFile(page)) {
        res.writeHead(404, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
        return res.end(await readFile(page));
    }
    send(res, 404, "Not found");
}

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT} (no caching, sample products, no Stripe)`);
});
